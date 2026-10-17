import * as THREE from 'three';
import { damp, type Frame } from './common';

// One sunflower, built procedurally: a painted seed disc with real relief, 34 + 21 Fibonacci petals
// and 21 sepals that open, droop and fall with the life cycle, plus exact Vogel-model parastichies
// (34 one way, 55 the other) that can be lit up over the disc.

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const DISC_VS = /* glsl */ `
uniform sampler2D uSeed; uniform float uDome; uniform float uBump;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
float lumAt(vec2 uv){ vec3 c = texture2D(uSeed, uv).rgb; return dot(c, vec3(0.3, 0.55, 0.15)); }
void main(){
  vUv = uv;
  vec3 p = position; float r = length(p.xy);
  float h = uDome * (1.0 - r * r) + (lumAt(uv) - 0.35) * uBump;
  p.z += h;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normalize(vec3(2.0 * uDome * p.xy, 1.0)));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const DISC_FS = /* glsl */ `
uniform sampler2D uSeed; uniform vec3 uLight; uniform float uOpacity; uniform float uDry; uniform float uGlow;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lumAt(vec2 uv){ vec3 c = texture2D(uSeed, uv).rgb; return dot(c, vec3(0.3, 0.55, 0.15)); }
void main(){
  if (hash(gl_FragCoord.xy) > uOpacity) discard;
  vec4 t = texture2D(uSeed, vUv);
  if (t.a < 0.5) discard;
  vec2 e = vec2(1.0 / 768.0);
  float hx = lumAt(vUv + vec2(e.x, 0.0)) - lumAt(vUv - vec2(e.x, 0.0));
  float hy = lumAt(vUv + vec2(0.0, e.y)) - lumAt(vUv - vec2(0.0, e.y));
  vec3 N = normalize(vN + vec3(-hx, -hy, 0.0) * 5.5);
  vec3 L = normalize(uLight - vW); vec3 V = normalize(cameraPosition - vW);
  float lam = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 26.0);
  vec3 base = t.rgb;
  base = mix(base, base * vec3(0.72, 0.62, 0.48), uDry);
  vec3 col = base * (0.34 + 0.95 * lam) + spec * 0.22 * vec3(1.0, 0.9, 0.7);
  col += vec3(1.0, 0.72, 0.25) * uGlow * 0.4;
  gl_FragColor = vec4(col, 1.0);
}`;

const PETAL_VS = /* glsl */ `
uniform float uOpen; uniform float uDroop; uniform float uFall; uniform float uDry; uniform float uTime;
attribute vec4 aA; // phi, ring, cell, rnd
varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vRing; varying float vA; varying float vDry;
vec3 rotA(vec3 v, vec3 k, float a){ return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
void main(){
  float phi = aA.x, ring = aA.y, cell = aA.z, rnd = aA.w;
  float s = position.y, w = position.x;
  float len = ring < 0.5 ? 1.12 : (ring < 1.5 ? 0.86 : 0.58);
  float wid = ring < 0.5 ? 0.34 : (ring < 1.5 ? 0.31 : 0.30);
  float attach = ring < 1.5 ? 0.9 : 0.8;
  float zoff = ring < 0.5 ? -0.03 : (ring < 1.5 ? 0.0 : -0.1);
  len *= 0.88 + rnd * 0.26;
  // bud: long green bracts curl right over a small, tucked-in crown of petals
  float bud = 1.0 - smoothstep(0.0, 0.55, uOpen);
  if (ring > 1.5) { len *= mix(1.0, 2.15, bud); wid *= mix(1.0, 1.3, bud); attach = mix(attach, 1.0, bud); }
  else { len *= mix(1.0, 0.42, bud); attach = mix(attach, 0.74, bud); }
  float a0 = mix(1.42 + rnd * 0.15, 0.06 + (rnd - 0.5) * 0.3 - ring * 0.04, uOpen);
  float k = mix(1.0, 0.16 + rnd * 0.15, uOpen);
  if (ring > 1.5) { a0 = mix(1.3, -0.45, uOpen); k = mix(0.7, 0.15, uOpen) + bud * (1.9 + rnd * 0.3); }
  float dro = uDroop * (0.65 + rnd * 0.7) * (ring > 1.5 ? 0.4 : 1.0);
  a0 -= dro * 1.35;
  k -= dro * (1.0 + rnd * 1.6);
  float a = a0 + k * s;
  float xr, zr;
  if (abs(k) < 0.001) { xr = cos(a0) * s; zr = sin(a0) * s; } else { xr = (sin(a) - sin(a0)) / k; zr = (cos(a0) - cos(a)) / k; }
  float shriv = 1.0 - uDry * 0.5 * smoothstep(0.15, 1.0, s) * (ring > 1.5 ? 0.3 : 1.0);
  float across = w * wid * shriv * (1.0 - 0.2 * s * s);
  float cup = w * w * (0.22 + uDroop * 0.3);
  vec3 radial = vec3(cos(phi), sin(phi), 0.0), tang = vec3(-sin(phi), cos(phi), 0.0), up = vec3(0.0, 0.0, 1.0);
  float twist = (rnd - 0.5) * 0.5 * s + uDroop * (rnd - 0.5) * 1.6 * s;
  vec3 acrossDir = normalize(tang * cos(twist) + up * sin(twist));
  vec3 p = radial * (attach + xr * len) + up * (zr * len + zoff + cup) + acrossDir * across;
  vec3 dPds = (radial * cos(a) + up * sin(a)) * len;
  vec3 n = normalize(cross(dPds, acrossDir));
  vA = 1.0;
  float ft = clamp(uFall * 1.7 - rnd * 0.7, 0.0, 1.0);
  if (ft > 0.0 && ring < 1.5) {
    vec3 piv = radial * attach;
    vec3 ax = normalize(tang + vec3(0.0, 0.0, rnd - 0.5));
    p = piv + rotA(p - piv, ax, ft * (3.0 + rnd * 4.0));
    n = rotA(n, ax, ft * (3.0 + rnd * 4.0));
    p += vec3(sin(rnd * 40.0) * ft * 0.9, -ft * ft * 4.5, ft * 1.4) + radial * ft * 0.7;
    vA = 1.0 - smoothstep(0.55, 1.0, ft);
  }
  float c = ring < 1.5 ? cell : mod(cell + 3.0, 14.0);
  vUv = vec2(mod(c, 8.0) / 8.0, 1.0 - (floor(c / 8.0) + 1.0) / 2.0) + vec2(w + 0.5, s) * vec2(1.0 / 8.0, 0.5);
  vRing = ring; vDry = uDry * (0.7 + rnd * 0.5);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const PETAL_FS = /* glsl */ `
uniform sampler2D uAtlas; uniform vec3 uLight; uniform float uOpacity; uniform float uGlow;
varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vRing; varying float vA; varying float vDry;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  if (hash(gl_FragCoord.xy) > uOpacity * vA) discard;
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.45) discard;
  vec3 base = t.rgb;
  float l = dot(base, vec3(0.3, 0.55, 0.15));
  if (vRing > 1.5) base = vec3(0.26, 0.40, 0.18) * (0.45 + l * 1.0);
  base = mix(base, base * vec3(0.80, 0.56, 0.27) + vec3(0.06, 0.035, 0.0), clamp(vDry, 0.0, 1.0));
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 L = normalize(uLight - vW); vec3 V = normalize(cameraPosition - vW);
  float d = dot(N, L);
  float lam = max(d, 0.0) * 0.8 + 0.2;
  float trans = pow(max(-d, 0.0), 1.5) * 0.35;
  vec3 col = base * (0.30 + 0.92 * lam) + base * trans * vec3(1.0, 0.75, 0.3);
  col += pow(1.0 - abs(dot(N, V)), 3.0) * 0.1 * vec3(1.0, 0.85, 0.5);
  col += base * uGlow * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;

const STEM_VS = /* glsl */ `varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const STEM_FS = /* glsl */ `
uniform vec3 uLight; uniform float uOpacity; uniform sampler2D uStroke; uniform float uDry;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  if (hash(gl_FragCoord.xy) > uOpacity) discard;
  float s = texture2D(uStroke, vec2(fract(vUv.x * 9.0) * 0.25, 0.75 + fract(vUv.y * 3.0) * 0.25)).r;
  vec3 base = mix(vec3(0.20, 0.33, 0.14), vec3(0.42, 0.55, 0.22), s);
  base = mix(base, vec3(0.42, 0.34, 0.14), uDry * 0.7);
  vec3 N = normalize(vN); vec3 L = normalize(uLight - vW);
  float lam = max(dot(N, L), 0.0);
  gl_FragColor = vec4(base * (0.35 + 0.9 * lam), 1.0);
}`;

const SPIRAL_VS = /* glsl */ `attribute vec3 aInfo; varying vec3 vInfo; varying float vSide;
void main(){ vInfo = aInfo; vSide = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SPIRAL_FS = /* glsl */ `
uniform float uAmt; uniform float uTime; varying vec3 vInfo; varying float vSide;
void main(){
  float t = vInfo.x, arm = vInfo.y, fam = vInfo.z;
  float sweep = uAmt * 1.35 - arm * 0.35;
  float on = smoothstep(t - 0.05, t, sweep);
  float head = exp(-pow((sweep - t) * 14.0, 2.0));
  float edge = 1.0 - abs(vSide * 2.0 - 1.0);
  vec3 c = fam < 0.5 ? vec3(1.0, 0.86, 0.36) : vec3(0.45, 0.78, 1.0);
  float pulse = 0.75 + 0.25 * sin(uTime * 2.0 - t * 12.0 + arm * 6.2831);
  float a = (on * 0.75 * pulse + head * 1.4) * edge * smoothstep(0.0, 0.12, uAmt);
  gl_FragColor = vec4(c * a, 1.0);
}`;

export class Sunflower {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  root = new THREE.Group();
  head = new THREE.Group();
  light = new THREE.Vector3(2, 3, 6);
  private discMat: THREE.ShaderMaterial; private petalMat: THREE.ShaderMaterial; private stemMat: THREE.ShaderMaterial;
  private spiralMat: THREE.ShaderMaterial;
  private yaw = 0.35; private pitch = 0.1; private yawV = 0; private pitchV = 0;
  private spiralAmt = 0; private appear = 0;
  life = { open: 0, droop: 0, fall: 0, dry: 0, nod: 0 };

  constructor(seed: THREE.Texture, petals: THREE.Texture, strokes: THREE.Texture) {
    this.scene.add(this.root);
    this.root.add(this.head);
    const shared = { uLight: { value: this.light }, uOpacity: { value: 1 }, uDry: { value: 0 }, uGlow: { value: 0 } };

    // seed disc with relief
    const discGeo = new THREE.RingGeometry(0.0005, 1, 200, 70);
    this.discMat = new THREE.ShaderMaterial({ vertexShader: DISC_VS, fragmentShader: DISC_FS,
      uniforms: { ...shared, uSeed: { value: seed }, uDome: { value: 0.16 }, uBump: { value: 0.07 } } });
    const disc = new THREE.Mesh(discGeo, this.discMat);
    this.head.add(disc);
    // back of the head (green receptacle)
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2.2),
      new THREE.ShaderMaterial({ vertexShader: STEM_VS, fragmentShader: STEM_FS, uniforms: { ...shared, uStroke: { value: strokes } } }));
    back.scale.set(0.93, 0.93, 0.32); back.rotation.x = Math.PI / 2; back.position.z = 0.02;
    this.head.add(back);

    // petals: outer 34, inner 21, sepals 21 (all Fibonacci)
    const rings: Array<[number, number, number]> = [[34, 0, 0], [21, 1, 0.5], [21, 2, 0.25]];
    const total = rings.reduce((a, r) => a + r[0], 0);
    const aA = new Float32Array(total * 4); let k = 0;
    for (const [n, ring, off] of rings) for (let i = 0; i < n; i++, k++) {
      aA.set([((i + off) / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.06, ring, Math.floor(Math.random() * 14), Math.random()], k * 4);
    }
    const pg = new THREE.PlaneGeometry(1, 1, 1, 14); pg.translate(0, 0.5, 0);
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = pg.index; ig.setAttribute('position', pg.attributes.position); ig.setAttribute('uv', pg.attributes.uv);
    ig.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4)); ig.instanceCount = total;
    this.petalMat = new THREE.ShaderMaterial({ vertexShader: PETAL_VS, fragmentShader: PETAL_FS, side: THREE.DoubleSide,
      uniforms: { ...shared, uAtlas: { value: petals }, uOpen: { value: 0 }, uDroop: { value: 0 }, uFall: { value: 0 }, uTime: { value: 0 } } });
    const petalMesh = new THREE.Mesh(ig, this.petalMat); petalMesh.frustumCulled = false;
    this.head.add(petalMesh);

    // stem + two leaves
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -0.25), new THREE.Vector3(0.05, -0.6, -0.55), new THREE.Vector3(0.2, -1.8, -0.75),
      new THREE.Vector3(0.32, -3.4, -0.8), new THREE.Vector3(0.38, -6, -0.85),
    ]);
    this.stemMat = new THREE.ShaderMaterial({ vertexShader: STEM_VS, fragmentShader: STEM_FS, uniforms: { ...shared, uStroke: { value: strokes } } });
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.085, 12), this.stemMat);
    this.root.add(stem);

    // Vogel-model parastichies (34 & 55 families) as glowing ribbons on the disc
    const N = 987, c = 0.9 / Math.sqrt(N);
    const seedPos = (n: number) => { const r = c * Math.sqrt(n), th = n * GOLDEN; return new THREE.Vector3(r * Math.cos(th), r * Math.sin(th), 0.16 * (1 - r * r) + 0.035); };
    const pos: number[] = [], uv: number[] = [], info: number[] = [], idx: number[] = [];
    let base = 0;
    for (const [m, fam] of [[34, 0], [55, 1]] as const) for (let arm = 0; arm < m; arm++) {
      const pts: THREE.Vector3[] = [];
      for (let n = arm + 1; n <= N; n += m) pts.push(seedPos(n));
      if (pts.length < 3) continue;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        const dir = new THREE.Vector3().subVectors(q, o).setZ(0).normalize();
        const side = new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(0.0075 + 0.006 * (i / pts.length));
        pos.push(p.x + side.x, p.y + side.y, p.z, p.x - side.x, p.y - side.y, p.z);
        uv.push(0, 0, 0, 1);
        const t = Math.sqrt(i / (pts.length - 1));
        info.push(t, arm / m, fam, t, arm / m, fam);
        if (i < pts.length - 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      base += pts.length * 2;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    sg.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
    sg.setIndex(idx);
    this.spiralMat = new THREE.ShaderMaterial({ vertexShader: SPIRAL_VS, fragmentShader: SPIRAL_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } } });
    const spirals = new THREE.Mesh(sg, this.spiralMat); spirals.renderOrder = 5;
    this.head.add(spirals);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    const wide = aspect >= 1;
    this.camera.fov = wide ? 30 : 38;
    this.camera.position.set(0, 0.15, wide ? 9.2 : 11.5);
    this.camera.lookAt(0, wide ? 0 : -0.9, 0);
    this.root.position.set(wide ? Math.min(2.6, 1.15 * aspect) : 0, wide ? -0.05 : 0.9, 0);
    this.camera.updateProjectionMatrix();
  }

  drag(dx: number, dy: number) { this.yawV += dx * 3.2; this.pitchV += dy * 2.0; }

  update(fr: Frame, o: { stageT: number; opacity: number; spirals: boolean; appear: number; lightNdc: THREE.Vector2 }) {
    const dt = Math.min(fr.dt, 0.05), s = o.stageT;
    const L = this.life;
    L.open = damp(L.open, Math.min(1, Math.max(0, s)), 5, dt);
    L.droop = damp(L.droop, Math.min(1, Math.max(0, (s - 1.15) / 0.85)), 4, dt);
    L.dry = damp(L.dry, Math.min(1, Math.max(0, (s - 1.3) / 1.2)), 3, dt);
    L.fall = damp(L.fall, Math.min(1, Math.max(0, (s - 2.15) / 0.8)), 3, dt);
    L.nod = damp(L.nod, Math.min(1, Math.max(0, (s - 1.4) / 1.6)), 2.5, dt);
    const pu = this.petalMat.uniforms;
    pu.uOpen.value = L.open; pu.uDroop.value = L.droop; pu.uFall.value = L.fall; pu.uTime.value = fr.t;
    this.discMat.uniforms.uDry.value = L.dry; this.discMat.uniforms.uDome.value = 0.16 + L.fall * 0.08;
    this.petalMat.uniforms.uDry.value = L.dry;
    this.stemMat.uniforms.uDry.value = L.dry * 0.6;
    this.spiralAmt = damp(this.spiralAmt, o.spirals ? 1 : 0, o.spirals ? 0.9 : 4, dt);
    this.spiralMat.uniforms.uAmt.value = this.spiralAmt * o.opacity; this.spiralMat.uniforms.uTime.value = fr.t;
    this.appear = damp(this.appear, o.appear, 3.2, dt);
    const ap = this.appear;
    const glow = Math.max(0, 1 - ap * 1.6) * 0.0 + (1 - Math.min(1, ap * 1.3)) * 0.8;
    this.discMat.uniforms.uGlow.value = glow; this.petalMat.uniforms.uGlow.value = glow;
    for (const m of [this.discMat, this.petalMat, this.stemMat]) m.uniforms.uOpacity.value = o.opacity;

    this.yaw += this.yawV * dt; this.pitch += this.pitchV * dt;
    this.yawV *= Math.exp(-3.2 * dt); this.pitchV *= Math.exp(-3.2 * dt);
    this.yaw += (0.35 - this.yaw) * (1 - Math.exp(-0.35 * dt));
    this.pitch += (0.1 - this.pitch) * (1 - Math.exp(-0.6 * dt));
    this.pitch = Math.max(-0.9, Math.min(0.9, this.pitch));
    const sway = fr.reduced ? 0 : Math.sin(fr.t * 0.6) * 0.05;
    this.root.rotation.set(this.pitch, this.yaw + sway, sway * 0.3);
    this.head.rotation.x = -L.nod * 0.62 + L.open * 0.0;
    this.head.position.y = -L.nod * 0.15;
    this.root.scale.setScalar((0.08 + 0.92 * easeOutBack(Math.min(1, ap))) * 0.86);

    // the cursor is the sun here too
    const v = new THREE.Vector3(o.lightNdc.x, o.lightNdc.y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    this.light.copy(this.camera.position).addScaledVector(v, 6.5);
    this.root.visible = o.opacity > 0.003;
  }
}

function easeOutBack(x: number) { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
