import * as THREE from 'three';
import { PAINT_W, PAINT_H, type Frame } from './common';
import type { Palette } from '../lib/palette';
import { computeStrokes, STROKE_GRID, STROKE_R, type StrokeData, type StrokeInput } from './strokeData';

// "Thirty-three yellows": the painting re-made from tens of thousands of real impasto strokes,
// which lift off the canvas and re-sort themselves by lightness into a phyllotaxis sunflower.

const VS = /* glsl */ `
uniform float uMorph; uniform float uCollapse; uniform float uTime;
uniform float uHL; uniform float uHLAmt; uniform float uScale; uniform mat4 uDisc; uniform float uSpiralSize;
attribute vec2 aPos; attribute vec3 aCol; attribute vec4 aD; attribute vec2 aS; attribute vec4 aB; attribute vec4 aT;
varying vec2 vUv; varying vec3 vCol; varying float vDim; varying float vHL;
void main(){
  float rnd = aD.w, f = aB.w;
  // the flower breathes: petals sway & flutter a little around the disc
  float sway = aT.z * sin(uTime * 1.05 + aT.w) * 0.05;
  vec3 loc = aB.xyz;
  float cs = cos(sway), sn = sin(sway);
  loc.xy = vec2(loc.x * cs - loc.y * sn, loc.x * sn + loc.y * cs);
  loc.z += aT.z * sin(uTime * 1.7 + aT.w * 1.9) * 0.16;
  vec3 B = (uDisc * vec4(loc, 1.0)).xyz;
  vec3 A = vec3(aPos, 0.0);
  float delay = rnd * 0.42 + (1.0 - f) * 0.18;
  float e = clamp(uMorph * 1.6 - delay, 0.0, 1.0);
  e = e * e * (3.0 - 2.0 * e);
  float arc = sin(3.14159265 * e);
  vec3 P = mix(A, B, e);
  if (arc > 0.001) {
    vec3 q = A * 0.22 + vec3(uTime * 0.05);
    vec3 flow = vec3(sin(q.y * 2.1 + rnd * 6.0) + sin(q.z * 1.3), cos(q.x * 1.7 - rnd * 4.0) + sin(q.z * 1.9), 1.4 + sin(q.x + q.y));
    P += flow * arc * (0.9 + rnd * 1.4);
  }
  float c = clamp(uCollapse * 1.5 - rnd * 0.5, 0.0, 1.0);
  c = c * c * (3.0 - 2.0 * c);
  P = mix(P, (uDisc * vec4(0.0, 0.0, 0.35, 1.0)).xyz, c);
  float isHL = 1.0 - step(0.5, abs(aS.y - uHL));
  vHL = isHL * uHLAmt;
  vDim = uHLAmt * (1.0 - isHL);
  P.z += vHL * 0.9 * e;
  float ang = mix(aD.x, aT.x + sway * e, e);
  float size = mix(aD.y, aT.y * uSpiralSize, e) * uScale * (1.0 + vHL * 0.6) * (1.0 - c * 0.92);
  vec4 mv = modelViewMatrix * vec4(P, 1.0);
  vec2 corner = position.xy * vec2(2.0, 1.0) * size;
  float ca = cos(ang), sa = sin(ang);
  mv.xy += vec2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
  gl_Position = projectionMatrix * mv;
  float cell = aD.z;
  vUv = vec2(mod(cell, 4.0) * 0.25, 1.0 - (floor(cell / 4.0) + 1.0) * 0.25) + uv * 0.25;
  vCol = aCol;
}`;

const FS = /* glsl */ `
uniform sampler2D uAtlas; uniform float uOpacity;
varying vec2 vUv; varying vec3 vCol; varying float vDim; varying float vHL;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main(){
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.42) discard;
  float sh = t.r;
  vec3 col = vCol * (0.40 + 0.80 * sh) + pow(sh, 8.0) * 0.2;
  // spotlight one yellow: everything else sinks into a warm umber shadow (not grey)
  col = mix(col, vec3(luma(col)) * vec3(1.0, 0.86, 0.62), vDim * 0.45) * (1.0 - vDim * 0.66);
  col += vec3(0.20, 0.14, 0.02) * vHL * sh;
  gl_FragColor = vec4(col, uOpacity);
}`;

/**
 * Reads the painting at 768×512 on the main thread (one cheap drawImage) and lays the strokes out
 * in a Web Worker; falls back to doing it inline if workers are unavailable. The worker is spun up
 * immediately so its script downloads while the textures are still streaming in.
 */
export function strokeWorker() {
  let w: Worker | null = null, failed = false;
  try {
    w = new Worker(new URL('./strokes.worker.ts', import.meta.url), { type: 'module' });
    w.onerror = (e) => { e.preventDefault(); failed = true; };
  } catch { w = null; }
  return {
    run(img: CanvasImageSource, pal: Palette, N: number): Promise<StrokeData> {
      const W = 768, H = 512;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, W, H);
      const input: StrokeInput = { px: ctx.getImageData(0, 0, W, H).data, W, H, pal: { all: pal.all, lab: pal.lab }, N, R: STROKE_R, gridN: STROKE_GRID, PW: PAINT_W, PH: PAINT_H };
      const local = () => computeStrokes(input);
      const worker = w;
      if (!worker || failed) return Promise.resolve().then(local);
      return new Promise<StrokeData>((res) => {
        worker.onmessage = (e: MessageEvent<StrokeData>) => { res(e.data); worker.terminate(); };
        worker.onerror = (e) => { e.preventDefault(); worker.terminate(); res(local()); };
        worker.postMessage(input);
      });
    },
    dispose() { w?.terminate(); },
  };
}

export class StrokeField {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  N: number;
  R = STROKE_R;
  /** top-most palette index per cell of the laid-out flower (disc-local), -1 = empty */
  private grid: Int16Array; private gridN = STROKE_GRID; private gridR: number;
  disc = new THREE.Matrix4();
  yaw = 0; pitch = -0.5; spin = 0; private yawV = 0; private pitchV = 0;
  hl = -1; private hlAmt = 0;

  constructor(data: StrokeData, atlas: THREE.Texture) {
    const { N, pos, col, d, aS, aB, aT } = data;
    this.N = N;
    this.grid = data.grid; this.gridR = data.gridR;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 2));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    g.setAttribute('aD', new THREE.InstancedBufferAttribute(d, 4));
    g.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 2));
    g.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
    g.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
    g.instanceCount = N;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false,
      uniforms: {
        uMorph: { value: 0 }, uCollapse: { value: 0 }, uTime: { value: 0 },
        uHL: { value: -1 }, uHLAmt: { value: 0 }, uScale: { value: 1 }, uDisc: { value: this.disc }, uSpiralSize: { value: 0.085 },
        uAtlas: { value: atlas }, uOpacity: { value: 1 },
      },
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
  }

  /** palette index of the visible stroke at a disc-local point (−1 = between petals) */
  clusterAt(x: number, y: number) {
    const n = this.gridN;
    const gx = Math.floor((x / (2 * this.gridR) + 0.5) * n), gy = Math.floor((y / (2 * this.gridR) + 0.5) * n);
    for (let rr = 0; rr <= 1; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      const X = gx + dx, Y = gy + dy;
      if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
      const c = this.grid[Y * n + X]; if (c >= 0) return c;
    }
    return -1;
  }

  drag(dx: number, dy: number) { this.yawV += dx * 2.2; this.pitchV += dy * 1.6; }

  /** world placement of the colour-flower (centre + uniform scale), composed into uDisc */
  offset = new THREE.Vector3(); scale = 1;
  private euler = new THREE.Euler(0, 0, 0, 'XYZ');
  private tmpM = new THREE.Matrix4();

  update(fr: Frame, o: { morph: number; collapse: number; opacity: number; hl: number }) {
    const dt = Math.min(fr.dt, 0.05);
    const u = this.mesh.material.uniforms;
    this.yaw += this.yawV * dt; this.pitch += this.pitchV * dt;
    this.yawV *= Math.exp(-3 * dt); this.pitchV *= Math.exp(-3 * dt);
    this.yaw *= Math.exp(-0.25 * dt);
    this.pitch = Math.max(-1.25, Math.min(0.35, this.pitch));
    this.pitch += (-0.5 - this.pitch) * (1 - Math.exp(-0.4 * dt));
    if (!fr.reduced) this.spin += dt * 0.05;
    const tilt = this.pitch * o.morph;
    this.euler.set(tilt, this.yaw * o.morph + (fr.reduced ? 0 : Math.sin(fr.t * 0.2) * 0.12 * o.morph), this.spin, 'XYZ');
    this.disc.makeRotationFromEuler(this.euler);
    this.disc.premultiply(this.tmpM.makeScale(this.scale, this.scale, this.scale));
    this.disc.premultiply(this.tmpM.makeTranslation(this.offset.x, this.offset.y, this.offset.z));
    if (o.hl !== this.hl) { if (o.hl >= 0) this.hl = o.hl; }
    this.hlAmt += ((o.hl >= 0 ? 1 : 0) - this.hlAmt) * (1 - Math.exp(-8 * dt));
    u.uHL.value = this.hl; u.uHLAmt.value = this.hlAmt;
    u.uMorph.value = o.morph; u.uCollapse.value = o.collapse; u.uTime.value = fr.t; u.uOpacity.value = o.opacity;
    this.mesh.visible = o.opacity > 0.003;
  }

  /** inverse-transform a world point on the (tilted) disc into disc-local coordinates */
  localPoint(world: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(world).applyMatrix4(this.tmpM.copy(this.disc).invert());
  }

  /** world-space normal of the disc plane */
  normal(out = new THREE.Vector3()) { return out.set(0, 0, 1).transformDirection(this.disc); }
}
