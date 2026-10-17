import * as THREE from 'three';
import type { Frame } from './common';

// Pollen motes that catch the cursor-sun + drifting / bursting painted petals.
const POLLEN_VS = /* glsl */ `
uniform float uTime; uniform float uPixel; uniform vec3 uLight;
attribute vec4 aSeed; varying float vB;
void main(){
  vec3 p = position;
  float t = uTime * (0.05 + aSeed.x * 0.07);
  p += vec3(sin(t * 3.1 + aSeed.y * 20.0) * 0.7, t * 0.9 + sin(t * 2.3 + aSeed.z * 17.0) * 0.4, cos(t * 2.7 + aSeed.w * 13.0) * 0.5);
  p.y = mod(p.y + 6.5, 13.0) - 6.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = length(p - uLight);
  vB = (0.16 + 1.9 / (1.0 + d * d * 0.32)) * (0.6 + 0.4 * sin(uTime * (1.5 + aSeed.x * 3.0) + aSeed.y * 30.0));
  gl_PointSize = (0.035 + aSeed.w * 0.075) * uPixel / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const POLLEN_FS = /* glsl */ `
uniform float uOpacity; varying float vB;
void main(){
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vec3(1.0, 0.86, 0.48) * a * a * vB * uOpacity, 1.0);
}`;

const PETAL_VS = /* glsl */ `
uniform float uTime;
attribute vec3 aStart; attribute vec3 aVel; attribute vec3 aAxis; attribute vec4 aP; // cell, spin, birth, mode
varying vec2 vUv; varying float vShade; varying float vA;
vec3 rotA(vec3 v, vec3 k, float a){ return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
void main(){
  float cell = aP.x;
  vec2 cuv = vec2(mod(cell, 8.0) / 8.0, 1.0 - (floor(cell / 8.0) + 1.0) / 2.0);
  vUv = cuv + uv * vec2(1.0 / 8.0, 0.5);
  vec3 p; float ang; vA = 1.0;
  if (aP.w < 0.5) {
    float sp = 0.035 + fract(aStart.x * 7.13) * 0.04;
    float tau = fract(uTime * sp + aStart.y);
    p = vec3(aStart.x + sin(uTime * 0.4 + aStart.z * 6.0) * 0.8, 7.0 - tau * 14.0, aStart.z);
    ang = uTime * aP.y;
    vA = smoothstep(0.0, 0.08, tau) * smoothstep(1.0, 0.9, tau);
  } else {
    float tau = uTime - aP.z;
    if (tau < 0.0 || tau > 4.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vShade = 0.0; return; }
    p = aStart + aVel * tau * (1.0 - 0.12 * tau) + vec3(0.0, -0.55 * tau * tau, 0.0);
    ang = aP.y * tau;
    vA = smoothstep(4.5, 3.4, tau) * smoothstep(0.0, 0.06, tau);
  }
  vec3 axis = normalize(aAxis);
  vec3 c = rotA(position, axis, ang);
  vec3 n = rotA(vec3(0.0, 0.0, 1.0), axis, ang);
  vShade = 0.72 + 0.38 * abs(dot(n, normalize(vec3(0.3, 0.6, 1.0))));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p + c, 1.0);
}`;
const PETAL_FS = /* glsl */ `
uniform sampler2D uAtlas; uniform float uOpacity; varying vec2 vUv; varying float vShade; varying float vA;
void main(){
  vec4 t = texture2D(uAtlas, vUv);
  float a = t.a * vA * uOpacity;
  if (a < 0.35) discard;
  gl_FragColor = vec4(t.rgb * vShade, 1.0);
}`;

export class Atmosphere {
  group = new THREE.Group();
  pollen: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  petals: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private ambient: number; private burstBase: number; private burstCount: number; private next = 0;

  constructor(petalAtlas: THREE.Texture, mobile: boolean) {
    const N = mobile ? 420 : 1100;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 9; pos[i * 3 + 1] = (Math.random() * 2 - 1) * 6.5; pos[i * 3 + 2] = -1.2 + Math.random() * 7;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.pollen = new THREE.Points(pg, new THREE.ShaderMaterial({
      vertexShader: POLLEN_VS, fragmentShader: POLLEN_FS, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 800 }, uLight: { value: new THREE.Vector3() }, uOpacity: { value: 1 } },
    }));
    this.pollen.frustumCulled = false; this.pollen.renderOrder = 6;
    this.group.add(this.pollen);

    this.ambient = mobile ? 10 : 22; this.burstCount = 72; this.burstBase = this.ambient;
    const M = this.ambient + this.burstCount;
    const base = new THREE.PlaneGeometry(0.26, 0.52);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const aStart = new Float32Array(M * 3), aVel = new Float32Array(M * 3), aAxis = new Float32Array(M * 3), aP = new Float32Array(M * 4);
    for (let i = 0; i < M; i++) {
      aStart.set([(Math.random() * 2 - 1) * 8.5, Math.random(), 0.8 + Math.random() * 5.5], i * 3);
      aAxis.set([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 + 0.2], i * 3);
      aP.set([Math.floor(Math.random() * 14), (Math.random() * 2 - 1) * 1.6, -100, i < this.ambient ? 0 : 1], i * 4);
    }
    g.setAttribute('aStart', new THREE.InstancedBufferAttribute(aStart, 3));
    g.setAttribute('aVel', new THREE.InstancedBufferAttribute(aVel, 3));
    g.setAttribute('aAxis', new THREE.InstancedBufferAttribute(aAxis, 3));
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
    g.instanceCount = M;
    this.petals = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: PETAL_VS, fragmentShader: PETAL_FS, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uAtlas: { value: petalAtlas }, uOpacity: { value: 1 } },
    }));
    this.petals.frustumCulled = false; this.petals.renderOrder = 5;
    this.group.add(this.petals);
  }

  burst(at: THREE.Vector3, t: number, count = 18, radius = 0.6) {
    const g = this.petals.geometry;
    const s = g.getAttribute('aStart') as THREE.InstancedBufferAttribute, v = g.getAttribute('aVel') as THREE.InstancedBufferAttribute;
    const p = g.getAttribute('aP') as THREE.InstancedBufferAttribute;
    for (let k = 0; k < count; k++) {
      const i = this.burstBase + (this.next++ % this.burstCount);
      const a = Math.random() * Math.PI * 2, r = radius * Math.sqrt(Math.random());
      s.setXYZ(i, at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, at.z + 0.3);
      const sp = 1.2 + Math.random() * 2.2;
      v.setXYZ(i, Math.cos(a) * sp, Math.sin(a) * sp + 1.2, 1.5 + Math.random() * 2.5);
      p.setXYZW(i, Math.floor(Math.random() * 14), (Math.random() * 2 - 1) * 5, t + Math.random() * 0.08, 1);
    }
    s.needsUpdate = v.needsUpdate = p.needsUpdate = true;
  }

  update(fr: Frame, light: THREE.Vector3, pixel: number, opacity: number) {
    const pu = this.pollen.material.uniforms;
    pu.uTime.value = fr.t; pu.uPixel.value = pixel; pu.uLight.value.copy(light); pu.uOpacity.value = opacity;
    const qu = this.petals.material.uniforms;
    qu.uTime.value = fr.t; qu.uOpacity.value = opacity;
    this.group.visible = opacity > 0.003;
  }
}
