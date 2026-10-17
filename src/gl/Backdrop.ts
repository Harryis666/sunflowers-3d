import * as THREE from 'three';
import type { Frame } from './common';

// Full-screen painted backdrop behind the 3D scenes. It is made of procedural impasto "dabs":
// each screen cell owns one elongated brush stroke whose direction follows a slow flow field and,
// near the colour-flower, curls into concentric halos (a nod to the turbulent skies Van Gogh painted
// the following year). Four palettes are blended by chapter: warm wall, Prussian night, the
// blue-green of the first Arles sunflowers, and candle-lit night.

const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FS = /* glsl */ `
uniform float uTime; uniform vec2 uRes; uniform vec4 uMix; uniform vec2 uCenter; uniform float uHalo;
uniform vec2 uLight; uniform sampler2D uCanvas; uniform float uLayers;
varying vec2 vUv;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec3 pick(vec3 a, vec3 b, vec3 c, vec3 d, float k){ return k < 0.25 ? a : k < 0.5 ? b : k < 0.75 ? c : d; }
vec3 palette(float k){
  vec3 warm  = pick(vec3(0.957, 0.914, 0.651), vec3(0.933, 0.859, 0.514), vec3(0.902, 0.796, 0.373), vec3(0.969, 0.941, 0.800), k);
  vec3 blue  = pick(vec3(0.059, 0.137, 0.220), vec3(0.086, 0.196, 0.310), vec3(0.137, 0.294, 0.451), vec3(0.106, 0.239, 0.373), k);
  vec3 teal  = pick(vec3(0.365, 0.620, 0.604), vec3(0.475, 0.710, 0.675), vec3(0.298, 0.541, 0.557), vec3(0.580, 0.780, 0.730), k);
  vec3 night = pick(vec3(0.082, 0.063, 0.039), vec3(0.150, 0.112, 0.062), vec3(0.090, 0.140, 0.200), vec3(0.200, 0.150, 0.075), k);
  return warm * uMix.x + blue * uMix.y + teal * uMix.z + night * uMix.w;
}
vec3 haloColor(){ return vec3(0.40, 0.60, 0.74) * uMix.y + vec3(0.86, 0.93, 0.84) * uMix.z + vec3(0.55, 0.40, 0.16) * uMix.w + vec3(1.0, 0.97, 0.82) * uMix.x; }

// axial (bidirectional) flow direction, doubled-angle averaging
float flowAngle(vec2 w, vec2 c){
  float n = (vnoise(w * 0.55 + vec2(uTime * 0.012, -uTime * 0.008)) * 2.0 - 1.0) * 2.4 + (vnoise(w * 1.7 + 4.1) - 0.5) * 0.9;
  vec2 r = w - c; float d2 = dot(r, r);
  float tang = atan(r.y, r.x) + 1.5707963;
  float k = uHalo * exp(-d2 * 0.22) * 0.95;
  vec2 v = mix(vec2(cos(2.0 * n), sin(2.0 * n)), vec2(cos(2.0 * tang), sin(2.0 * tang)), k);
  return 0.5 * atan(v.y, v.x);
}

void main(){
  float asp = uRes.x / uRes.y;
  vec2 w = (vUv - 0.5) * vec2(asp, 1.0) * 2.0;           // aspect-corrected screen space (-asp..asp, -1..1)
  vec2 c = uCenter * vec2(asp, 1.0);
  float ang = flowAngle(w * 2.2, c * 2.2);
  vec2 L = normalize(vec2(uLight.x * asp, uLight.y) - w + 1e-4);

  vec3 linen = texture2D(uCanvas, vUv * vec2(asp, 1.0) * 2.2).rgb;
  vec3 col = palette(0.1) * (0.70 + 0.30 * linen);       // canvas showing through gaps
  float topH = -1.0;
  for (int layer = 0; layer < 2; layer++) {
    if (float(layer) >= uLayers) break;
    float S = layer == 0 ? 15.0 : 23.0;
    vec2 q = w * S + float(layer) * 17.31;
    vec2 cell = floor(q);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 cc = cell + vec2(float(i), float(j));
      float h = hash12(cc + float(layer) * 31.7);
      if (layer == 1 && h < 0.42) continue;
      vec2 ctr = cc + vec2(hash12(cc + 1.3), hash12(cc + 7.1));
      float a = ang + (hash12(cc + 3.7) - 0.5) * 0.5;
      vec2 d = rot2(-a) * (q - ctr);
      float len = 0.95 + 0.75 * hash12(cc + 5.9), wid = 0.30 + 0.16 * hash12(cc + 9.2);
      float e = length(vec2(max(abs(d.x) - len * 0.5, 0.0), d.y)) - wid;
      float order = h + float(layer);
      if (e < 0.0 && order > topH) {
        topH = order;
        float k = hash12(cc + 11.3);
        vec3 base = palette(k);
        // halo rings brighten strokes around the flower centre
        vec2 rr = w - c; float rd = length(rr);
        float ring = pow(0.5 + 0.5 * sin(rd * 9.0 - uTime * 0.35), 3.0) * exp(-rd * 1.1) * uHalo;
        base = mix(base, haloColor(), clamp(ring * (0.55 + 0.45 * hash12(cc + 2.2)), 0.0, 0.85));
        float bristle = vnoise(vec2(d.x * 2.2, d.y * 26.0 + h * 40.0));
        float across = d.y / wid;
        float ridge = 1.0 - across * across;
        vec2 nrm = rot2(a) * vec2(0.0, -across);
        float lit = 0.5 + 0.5 * dot(normalize(nrm + 1e-4), L) * abs(across);
        float edge = smoothstep(-0.12, 0.0, e);
        col = base * (0.82 + 0.16 * ridge + 0.14 * (bristle - 0.5)) * (0.92 + 0.16 * lit) * (1.0 - edge * 0.25);
      }
    }
  }
  // soft lamp around the cursor-sun and a gentle vignette
  vec2 lw = vec2(uLight.x * asp, uLight.y) - w;
  float lamp = exp(-dot(lw, lw) * 1.6);
  col *= 1.0 + lamp * (0.10 + 0.55 * uMix.w + 0.22 * uMix.y);
  float vig = smoothstep(2.2, 0.6, length(w * vec2(0.75, 1.0)));
  col *= mix(0.72, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Backdrop {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  constructor(canvasTex: THREE.Texture, mobile: boolean) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMix: { value: new THREE.Vector4(1, 0, 0, 0) },
        uCenter: { value: new THREE.Vector2() }, uHalo: { value: 0 }, uLight: { value: new THREE.Vector2() },
        uCanvas: { value: canvasTex }, uLayers: { value: mobile ? 1 : 2 },
      },
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
  }
  update(fr: Frame, o: { mix: THREE.Vector4; center: THREE.Vector2; halo: number; light: THREE.Vector2; visible: boolean }) {
    const u = this.mesh.material.uniforms;
    if (!fr.reduced) u.uTime.value = fr.t;
    u.uRes.value.set(fr.w, fr.h);
    u.uMix.value.copy(o.mix);
    u.uCenter.value.copy(o.center);
    u.uHalo.value = o.halo;
    u.uLight.value.copy(o.light);
    this.mesh.visible = o.visible;
  }
}
