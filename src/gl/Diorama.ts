import * as THREE from 'three';
import { NOISE, AGEING } from './glsl';
import { PAINT_W, PAINT_H, CAM_D, TEX_W, TEX_H, damp, type Frame } from './common';
import flowersData from '../data/flowers.json';

export interface DioramaTextures {
  bg: THREE.Texture; mid: THREE.Texture; midForm: THREE.Texture; table: THREE.Texture; tableForm: THREE.Texture; fg: THREE.Texture;
}

const MAX_FLOWERS = 12;

const VS = /* glsl */ `
uniform sampler2D uForm; uniform float uFormAmp; uniform vec2 uVRange; uniform float uScale;
varying vec2 vUv; varying vec3 vWorld; varying vec2 vPaint;
void main(){
  vec2 tuv = vec2(uv.x, 0.5 + (uv.y - 0.5) * uVRange.x);
  vUv = tuv;
  vec3 p = position;
  if (uFormAmp > 0.0) p.z += texture2D(uForm, tuv).r * uFormAmp;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vPaint = w.xy / uScale;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = /* glsl */ `
uniform sampler2D uMap; uniform sampler2D uForm;
uniform vec2 uTexel; uniform vec3 uLight; uniform float uTime; uniform float uOpacity;
uniform float uRaking; uniform float uAge; uniform float uReveal; uniform float uRelief; uniform float uFormRelief;
uniform float uWarp; uniform float uLit; uniform float uMirror; uniform float uNight;
uniform vec4 uFlowers[${MAX_FLOWERS}]; uniform vec4 uFlowerB[${MAX_FLOWERS}];
varying vec2 vUv; varying vec3 vWorld; varying vec2 vPaint;
${NOISE}
${AGEING}
float tri(float t){ return 1.0 - abs(mod(t, 2.0) - 1.0); }
// tall / wide screens: extend the wall upwards and the table downwards by reflecting
// *within* each band, so the table never reappears above the wall (or vice versa)
vec2 mirrorUv(vec2 uv){
  if (uMirror < 0.5) return uv;
  uv.x = abs(mod(uv.x + 1.0, 2.0) - 1.0);
  if (uv.y > 1.0) uv.y = 1.0 - 0.5 * tri((uv.y - 1.0) / 0.5);
  else if (uv.y < 0.0) uv.y = 0.27 * tri(-uv.y / 0.27);
  return uv;
}
float H(vec2 uv){ vec3 a = texture2D(uMap, uv).rgb; vec3 b = texture(uMap, uv, 3.0).rgb; return luma(a) - luma(b) * 0.92; }
vec2 warp(vec2 uv, out float glow){
  glow = 0.0;
  vec2 p = uv * vec2(1.5, 1.0);
  for (int i = 0; i < ${MAX_FLOWERS}; i++){
    vec4 f = uFlowers[i]; vec4 g = uFlowerB[i];
    if (f.z <= 0.0) continue;
    vec2 c = f.xy * vec2(1.5, 1.0);
    float R = f.z * 1.5 * 1.2;
    vec2 d = p - c; float r = length(d);
    if (r < R) {
      float fall = 1.0 - smoothstep(R * 0.5, R, r);
      d = rot2(g.x * fall) * d / (1.0 + (g.y - 1.0) * fall);
      p = c + d;
      glow += f.w * (1.0 - smoothstep(0.0, R * 0.9, r));
    }
  }
  return p / vec2(1.5, 1.0);
}
void main(){
  float glow = 0.0;
  vec2 uv = uWarp > 0.5 ? warp(vUv, glow) : vUv;
  uv = mirrorUv(uv);
  vec4 tex = texture2D(uMap, uv);
  if (tex.a < 0.004) discard;
  vec3 albedo = tex.rgb;
  vec3 col = albedo;
  if (uLit > 0.5) {
    vec2 e = uTexel * 1.25;
    float hx = H(uv + vec2(e.x, 0.0)) - H(uv - vec2(e.x, 0.0));
    float hy = H(uv + vec2(0.0, e.y)) - H(uv - vec2(0.0, e.y));
    float fx = 0.0, fy = 0.0;
    if (uFormRelief > 0.0) {
      vec2 fe = vec2(0.012, 0.018);
      fx = texture2D(uForm, uv + vec2(fe.x, 0.0)).r - texture2D(uForm, uv - vec2(fe.x, 0.0)).r;
      fy = texture2D(uForm, uv + vec2(0.0, fe.y)).r - texture2D(uForm, uv - vec2(0.0, fe.y)).r;
    }
    float rel = uRelief * (1.0 + uRaking * 1.1);
    vec3 N = normalize(vec3(-(hx * rel + fx * uFormRelief), -(hy * rel + fy * uFormRelief), 1.0));
    vec3 Lv = uLight - vWorld; float dist = length(Lv); vec3 L = Lv / dist;
    vec3 V = normalize(cameraPosition - vWorld);
    float lam = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), mix(36.0, 22.0, uRaking));
    float pool = 1.0 / (1.0 + dist * dist * mix(0.010, 0.05, uRaking));
    vec3 lc = vec3(1.0, 0.93, 0.78);
    float amb = mix(0.80, 0.30, uRaking);
    float dif = mix(0.24, 1.25, uRaking) * mix(1.0, pool * 2.4, uRaking);
    float ridge = smoothstep(0.30, 0.95, luma(albedo));
    col = albedo * (amb + dif * lam * lc) + spec * mix(0.10, 0.42, uRaking) * pool * 1.6 * lc * ridge;
  }
  col = ageColor(col, uAge);
  // nocturne: moonlit Prussian blue everywhere, a warm candle-pool where the cursor is
  if (uNight > 0.001) {
    vec2 dl = uLight.xy - vWorld.xy;
    float lamp = exp(-dot(dl, dl) * 0.12);
    vec3 moon = luma(col) * vec3(0.10, 0.15, 0.33) + col * 0.06 + vec3(0.004, 0.008, 0.022);
    col = mix(col, moon + col * vec3(1.12, 0.80, 0.46) * lamp, uNight);
  }
  // the flowers themselves glow — "like standard lamps or candelabra" (letter 743)
  col += vec3(1.0, 0.70, 0.22) * glow * (0.32 + 0.85 * uNight) * smoothstep(0.25, 0.85, luma(albedo));
  float alpha = tex.a * uOpacity;
  // cut-out layers end at the picture edge: feather them instead of a hard line (visible on tall screens)
  if (uMirror < 0.5) alpha *= smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
  if (uReveal < 0.999) {
    float d = 1.0 - uReveal;
    float n = 0.03 + dabs(vPaint * 3.2) * 0.53 + vnoise(vPaint * 0.35) * 0.40;
    float m = smoothstep(d - 0.02, d + 0.02, n);
    col += vec3(0.55, 0.36, 0.06) * (1.0 - smoothstep(0.0, 0.05, abs(n - d))) * step(0.002, d);
    alpha *= m;
  }
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(col, alpha);
}`;

const GLOW_FS = /* glsl */ `
uniform float uI; uniform float uTime; uniform float uSeed; varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
  float core = exp(-r * r * 4.2);
  float rays = pow(0.5 + 0.5 * sin(a * 13.0 + uTime * 0.7 + uSeed * 9.0), 7.0) * 0.7
             + pow(0.5 + 0.5 * sin(a * 8.0 - uTime * 0.5 + uSeed * 3.0), 9.0) * 0.5;
  float v = (core + rays * core * 1.4) * smoothstep(1.0, 0.55, r);
  gl_FragColor = vec4(vec3(1.0, 0.76, 0.30) * v * uI, 1.0);
}`;
const GLOW_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export interface FlowerState {
  id: string; x: number; y: number; r: number; stage: string;
  hover: number; ang: number; vel: number; pulse: number; flash: number;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
}

export class Diorama {
  group = new THREE.Group();
  layers: { key: string; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; z: number }[] = [];
  flowers: FlowerState[] = [];
  shared = {
    uLight: { value: new THREE.Vector3(0, 0, 5) }, uTime: { value: 0 }, uRaking: { value: 0 }, uAge: { value: 0 },
    uReveal: { value: 1 }, uOpacity: { value: 1 }, uNight: { value: 0 },
  };
  private flowerA = Array.from({ length: MAX_FLOWERS }, () => new THREE.Vector4());
  private flowerB = Array.from({ length: MAX_FLOWERS }, () => new THREE.Vector4(0, 1, 0, 0));
  candles = 0;

  constructor(tex: DioramaTextures) {
    const make = (key: string, map: THREE.Texture, z: number, o: { seg?: [number, number]; form?: THREE.Texture; formAmp?: number; relief?: number; formRelief?: number; warp?: boolean; lit?: boolean; mirror?: boolean; order: number }) => {
      const s = (CAM_D - z) / CAM_D;
      const geo = new THREE.PlaneGeometry(PAINT_W, PAINT_H, o.seg?.[0] ?? 1, o.seg?.[1] ?? 1);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false,
        uniforms: {
          ...this.shared,
          uMap: { value: map }, uForm: { value: o.form ?? map }, uFormAmp: { value: o.formAmp ?? 0 },
          uFormRelief: { value: o.formRelief ?? 0 }, uRelief: { value: o.relief ?? 7 },
          uTexel: { value: new THREE.Vector2(1 / TEX_W, 1 / TEX_H) }, uVRange: { value: new THREE.Vector2(1, 0) },
          uScale: { value: s }, uWarp: { value: o.warp ? 1 : 0 }, uLit: { value: o.lit === false ? 0 : 1 },
          uMirror: { value: o.mirror ? 1 : 0 },
          uFlowers: { value: this.flowerA }, uFlowerB: { value: this.flowerB },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = z; mesh.scale.setScalar(s); mesh.renderOrder = o.order;
      this.group.add(mesh);
      this.layers.push({ key, mesh, z });
      return mesh;
    };
    make('bg', tex.bg, -1.8, { relief: 6.5, mirror: true, order: 0 });
    make('mid', tex.mid, 0, { seg: [160, 107], form: tex.midForm, formAmp: 0.42, formRelief: 1.6, relief: 7.5, warp: true, order: 2 });
    make('table', tex.table, 0.55, { seg: [48, 32], form: tex.tableForm, formAmp: 0.2, formRelief: 1.2, relief: 7, order: 3 });
    make('fg', tex.fg, 3.2, { lit: false, order: 4 });

    const glowGeo = new THREE.PlaneGeometry(1, 1);
    flowersData.forEach((f, i) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, uniforms: { uI: { value: 0 }, uTime: this.shared.uTime, uSeed: { value: i * 0.37 } },
      });
      const glow = new THREE.Mesh(glowGeo, mat);
      const wx = (f.x / TEX_W - 0.5) * PAINT_W, wy = (0.5 - f.y / TEX_H) * PAINT_H;
      glow.position.set(wx, wy, -0.06);
      glow.scale.setScalar((f.r / 100) * 3.2);
      glow.renderOrder = 1;
      this.group.add(glow);
      this.flowers.push({ ...f, hover: 0, ang: 0, vel: 0, pulse: 0, flash: 0, glow });
      this.flowerA[i].set(f.x / TEX_W, 1 - f.y / TEX_H, f.r / TEX_W, 0);
    });
  }

  /** extend the wall/table for tall screens (mirror-wrapped) */
  resize(visH: number) {
    const bg = this.layers[0].mesh;
    const ext = Math.max(1, (visH * 1.14) / PAINT_H);
    bg.scale.y = bg.scale.x * ext;
    bg.material.uniforms.uVRange.value.set(ext, 0);
  }

  /** flower index under painting-space point (px), or -1 */
  pick(px: number, py: number) {
    let best = -1, bd = 1e9;
    this.flowers.forEach((f, i) => {
      const d = Math.hypot(px - f.x, py - f.y) / f.r;
      if (d < 0.92 && d < bd) { bd = d; best = i; }
    });
    return best;
  }

  poke(i: number) {
    const f = this.flowers[i]; if (!f) return;
    f.vel += 7.5; f.flash = 1; f.pulse = 0.14;
  }

  update(fr: Frame, hovered: number, opts: { opacity: number; reveal: number; age: number; raking: number; candles: number; night: number }) {
    const dt = Math.min(fr.dt, 0.05);
    this.shared.uTime.value = fr.t;
    this.shared.uOpacity.value = opts.opacity;
    this.shared.uReveal.value = opts.reveal;
    this.shared.uAge.value = opts.age;
    this.shared.uNight.value = opts.night;
    this.shared.uRaking.value = damp(this.shared.uRaking.value, opts.raking, 6, dt);
    this.candles = damp(this.candles, opts.candles, 2.5, dt);
    this.flowers.forEach((f, i) => {
      f.hover = damp(f.hover, i === hovered ? 1 : 0, 7, dt);
      const target = f.hover * 0.34 + (fr.reduced ? 0 : Math.sin(fr.t * 0.55 + i * 1.7) * 0.025);
      f.vel += (-(f.ang - target) * 26 - f.vel * 4.2) * dt;
      f.ang += f.vel * dt;
      f.pulse = damp(f.pulse, 0, 3.5, dt);
      f.flash = damp(f.flash, 0, 2.2, dt);
      const scale = 1 + f.hover * 0.06 + f.pulse * Math.max(0, Math.sin(f.flash * Math.PI));
      this.flowerA[i].w = f.hover * 0.9 + f.flash * 0.8 + this.candles * 0.45;
      this.flowerB[i].set(f.ang, scale, 0, 0);
      const flick = this.candles * (0.75 + 0.25 * Math.sin(fr.t * 2.3 + i * 2.1) * Math.sin(fr.t * 1.3 + i));
      f.glow.material.uniforms.uI.value = (f.hover * 0.85 + f.flash * 1.1 + flick * 0.9) * opts.opacity * opts.reveal;
      f.glow.visible = f.glow.material.uniforms.uI.value > 0.003;
    });
    this.group.visible = opts.opacity > 0.002 && opts.reveal > 0.002;
  }
}
