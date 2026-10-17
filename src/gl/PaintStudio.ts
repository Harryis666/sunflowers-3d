import * as THREE from 'three';
import { gpuIdle, loadTexture, yieldToPaint } from './assets';
import { hexToRgb, type Palette } from '../lib/palette';

// "Leave your stroke": a tiny impasto simulator. Every brush stamp writes colour (alpha-blended)
// and *adds* paint thickness into a half-float target; a display pass relights that height field
// with a low, cursor-driven raking light over a linen canvas — the same way the 3D painting is lit.

const MAX = 4096;

const STAMP_VS = /* glsl */ `
uniform float uAspect;
attribute vec4 aP; attribute vec4 aC; attribute vec4 aS;
varying vec2 vUv; varying vec4 vC; varying vec4 vS; varying vec2 vQ;
void main(){
  vec2 o = position.xy * vec2(aP.w * aS.y, aP.w);
  float c = cos(aP.z), s = sin(aP.z);
  o = vec2(o.x * c - o.y * s, o.x * s + o.y * c);
  vec2 pos = aP.xy + vec2(o.x / uAspect, o.y);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  float cell = aS.x;
  vUv = vec2(mod(cell, 4.0) * 0.25, 1.0 - (floor(cell / 4.0) + 1.0) * 0.25) + uv * 0.25;
  vC = aC; vS = aS; vQ = uv;
}`;
const STAMP_FS = /* glsl */ `
uniform sampler2D uAtlas; uniform float uHGain;
varying vec2 vUv; varying vec4 vC; varying vec4 vS; varying vec2 vQ;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
void main(){
  if (vS.x < -0.5) {   // ground coat: flat, opaque, faintly mottled; it fills the gaps between later strokes
    float m = vnoise(vQ * vec2(41.0, 23.0)) * 0.6 + vnoise(vQ * vec2(7.0, 5.0)) * 0.4;
    gl_FragColor = vec4(vC.rgb * (0.94 + 0.12 * m), vC.a * uHGain);
    return;
  }
  vec4 t = texture2D(uAtlas, vUv);
  float cov = smoothstep(0.08, 0.6, t.a);
  float bristle = vnoise(vec2(vQ.x * 5.0, vQ.y * 34.0) + vS.z * 17.0);
  float dry = vS.w;
  cov *= mix(1.0, smoothstep(0.42, 0.62, bristle + 0.35 - dry * 0.45), clamp(dry * 1.4, 0.0, 1.0));
  float a = cov * vC.a;
  if (a < 0.004) discard;
  vec3 col = vC.rgb * (0.84 + 0.30 * t.r) * (0.96 + 0.08 * bristle);
  gl_FragColor = vec4(col, a * uHGain);
}`;

const DISPLAY_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DISPLAY_FS = /* glsl */ `
uniform sampler2D uPaint; uniform sampler2D uCanvas; uniform vec2 uTexel; uniform vec3 uLight; uniform float uAspect; uniform float uHScale;
varying vec2 vUv;
float H(vec2 uv){ return 1.0 - exp(-texture2D(uPaint, uv).a * uHScale); }
float lw(vec2 uv){ return dot(texture2D(uCanvas, uv * vec2(uAspect, 1.0) * 3.0).rgb, vec3(0.333)); }
void main(){
  vec4 P = texture2D(uPaint, vUv);
  float h = 1.0 - exp(-P.a * uHScale);
  vec2 e = uTexel * 1.5;
  float hx = H(vUv + vec2(e.x, 0.0)) - H(vUv - vec2(e.x, 0.0));
  float hy = H(vUv + vec2(0.0, e.y)) - H(vUv - vec2(0.0, e.y));
  vec2 ce = vec2(0.0016, 0.0024);
  float cx = lw(vUv + vec2(ce.x, 0.0)) - lw(vUv - vec2(ce.x, 0.0));
  float cy = lw(vUv + vec2(0.0, ce.y)) - lw(vUv - vec2(0.0, ce.y));
  float cover = smoothstep(0.0, 0.3, P.a);
  vec3 N = normalize(vec3(-hx * 11.0 - cx * 1.2 * (1.0 - cover), -hy * 11.0 - cy * 1.2 * (1.0 - cover), 1.0));
  vec3 linen = texture2D(uCanvas, vUv * vec2(uAspect, 1.0) * 3.0).rgb * vec3(1.0, 0.97, 0.9);
  vec3 albedo = mix(linen, P.rgb, cover);
  vec3 pos = vec3((vUv - 0.5) * vec2(uAspect, 1.0), h * 0.025);
  vec3 Lv = uLight - pos; float dist = length(Lv); vec3 L = Lv / dist;
  float lam = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 38.0) * cover;
  float pool = 1.0 / (1.0 + dist * dist * 1.6);
  // crevice darkening from the local height relief
  float hb = (H(vUv + vec2(e.x * 4.0, 0.0)) + H(vUv - vec2(e.x * 4.0, 0.0)) + H(vUv + vec2(0.0, e.y * 4.0)) + H(vUv - vec2(0.0, e.y * 4.0))) * 0.25;
  float ao = clamp(1.0 - (hb - h) * 1.5, 0.74, 1.0);
  vec3 col = albedo * (0.6 + 0.66 * lam * (0.55 + 0.6 * pool)) * ao + spec * 0.3 * vec3(1.0, 0.95, 0.82);
  vec2 vq = vUv - 0.5;
  col *= 1.0 - dot(vq, vq) * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;

interface Stroke { pts: [number, number][]; rgb: [number, number, number]; size: number; elong: number; cell: number; alpha: number; dryRate: number; }

export class PaintStudio {
  readonly canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  private rt!: THREE.WebGLRenderTarget;
  private stampScene = new THREE.Scene(); private displayScene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private stampMesh!: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private displayMat!: THREE.ShaderMaterial;
  private aP!: THREE.InstancedBufferAttribute; private aC!: THREE.InstancedBufferAttribute; private aS!: THREE.InstancedBufferAttribute;
  private pending = 0;
  readonly W: number; readonly H: number; readonly aspect: number;
  private hGain = 1; private hScale = 0.55; private ready = false; private running = false; private raf = 0;
  private queue: Stroke[] = []; private qStroke: Stroke | null = null; private qIndex = 0; private qCarry = 0;
  private rate = 2600;
  private light = new THREE.Vector3(-0.4, 0.3, 0.45); private lightT = new THREE.Vector3(-0.4, 0.3, 0.45);
  private hover = false; private last = 0;
  color: [number, number, number] = [0.94, 0.71, 0.1];
  size = 0.045;
  private cur: { x: number; y: number; dist: number; cell: number; seed: number; rgb: [number, number, number] } | null = null;
  private palette: Palette;
  onBrush?: (x: number, y: number, r: number, visible: boolean) => void;
  grown = false;
  private textures: THREE.Texture[] = [];

  constructor(canvas: HTMLCanvasElement, palette: Palette, mobile: boolean) {
    this.canvas = canvas; this.palette = palette;
    this.W = mobile ? 1152 : 1536; this.H = mobile ? 768 : 1024; this.aspect = this.W / this.H;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: false });
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    THREE.ColorManagement.enabled = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  }

  async init() {
    const r = this.renderer;
    const half = r.extensions.has('EXT_color_buffer_half_float') || r.extensions.has('EXT_color_buffer_float');
    this.hGain = 1;
    this.hScale = half ? 0.55 : 2.2;   // 8-bit fallback saturates at 1, so compress less
    this.rt = new THREE.WebGLRenderTarget(this.W, this.H, {
      type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
    });
    // the engine already fetched + decoded these: reuse the same pixels (no second download/decode)
    const [atlas, linen] = await Promise.all([loadTexture('strokes.webp'), loadTexture('canvas.webp', { repeat: true })]);
    this.textures = [atlas, linen];

    const base4 = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base4.index; g.setAttribute('position', base4.attributes.position); g.setAttribute('uv', base4.attributes.uv);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aP', this.aP); g.setAttribute('aC', this.aC); g.setAttribute('aS', this.aS);
    g.instanceCount = 0;
    this.stampMesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: STAMP_VS, fragmentShader: STAMP_FS, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      uniforms: { uAtlas: { value: atlas }, uAspect: { value: this.aspect }, uHGain: { value: this.hGain } },
    }));
    this.stampMesh.frustumCulled = false;
    this.stampScene.add(this.stampMesh);

    this.displayMat = new THREE.ShaderMaterial({
      vertexShader: DISPLAY_VS, fragmentShader: DISPLAY_FS, depthTest: false, depthWrite: false,
      uniforms: {
        uPaint: { value: this.rt.texture }, uCanvas: { value: linen }, uTexel: { value: new THREE.Vector2(1 / this.W, 1 / this.H) },
        uLight: { value: this.light }, uAspect: { value: this.aspect }, uHScale: { value: this.hScale },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.displayMat);
    quad.frustumCulled = false;
    this.displayScene.add(quad);
    this.clear();
    this.bind();
    this.resize();
    this.ready = true;
  }

  /**
   * Upload textures and link both programs ahead of time, one small step per frame; then draw one
   * throw-away stamp into a target of the paint layer's format and one display pass through a tiny
   * viewport of the real canvas — exactly the pipelines the first brush stroke will need.
   * `quiet` lets the caller hold each step back while the main scene is busy (e.g. its intro).
   */
  async warm(quiet: () => Promise<void> = yieldToPaint) {
    const r = this.renderer;
    for (const t of this.textures) { await quiet(); r.initTexture(t); }
    await quiet();
    await Promise.all([r.compileAsync(this.stampScene, this.cam), r.compileAsync(this.displayScene, this.cam)]).catch(() => {});
    await gpuIdle(r);
    await quiet();
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: this.rt.texture.type, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false });
    const g = this.stampMesh.geometry, n = g.instanceCount;
    g.instanceCount = 1;
    r.setRenderTarget(rt);
    r.render(this.stampScene, this.cam);
    g.instanceCount = n;
    r.setRenderTarget(null);
    const size = r.getSize(new THREE.Vector2());
    r.setViewport(0, 0, 4, 4);
    r.render(this.displayScene, this.cam);
    r.setViewport(0, 0, size.x, size.y);
    rt.dispose();
    await gpuIdle(r);
    performance.mark('sf:studio');
  }

  clear() {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(new THREE.Color(0.80, 0.74, 0.60), 0);
    r.clear(true, false, false);
    r.setRenderTarget(null);
    this.queue = []; this.qStroke = null;
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h) this.renderer.setSize(w, h, false);
  }

  start() { if (this.running || !this.ready) return; this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  dispose() { this.stop(); this.unbind(); this.rt?.dispose(); this.renderer.dispose(); }

  setSwatch(hex: string) { const [r, g, b] = hexToRgb(hex); this.color = [r / 255, g / 255, b / 255]; }

  // ------------------------------------------------------------ input
  private toUv(e: PointerEvent) {
    const rc = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - rc.left) / rc.width, y: 1 - (e.clientY - rc.top) / rc.height, rc };
  }
  private onDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* auto mode's pointer is not a real device */ }
    const { x, y } = this.toUv(e);
    const j = () => 1 + (Math.random() - 0.5) * 0.05;
    this.cur = { x, y, dist: 0, cell: Math.floor(Math.random() * 15), seed: Math.random(), rgb: [this.color[0] * j(), this.color[1] * j(), this.color[2] * j()] };
    this.stampAt(x, y, Math.random() * Math.PI, this.cur, e.pressure);
    e.preventDefault();
  };
  private onMove = (e: PointerEvent) => {
    const { x, y, rc } = this.toUv(e);
    this.hover = true;
    this.lightT.set((x - 0.5) * this.aspect, y - 0.5, 0.3);
    this.onBrush?.(e.clientX - rc.left, e.clientY - rc.top, this.size * rc.height * 0.5 * 1.15, true);
    const c = this.cur; if (!c) return;
    const dx = (x - c.x) * this.aspect, dy = y - c.y;
    const d = Math.hypot(dx, dy);
    const step = this.size * 0.3;
    if (d < step) return;
    const ang = Math.atan2(dy, dx);
    const n = Math.floor(d / step);
    for (let k = 1; k <= n; k++) {
      const t = (k * step) / d;
      c.dist += step;
      this.stampAt(c.x + (x - c.x) * t, c.y + (y - c.y) * t, ang, c, e.pressure);
    }
    const t = (n * step) / d;
    c.x += (x - c.x) * t; c.y += (y - c.y) * t;
  };
  private onUp = () => { this.cur = null; };
  private onLeave = () => { this.hover = false; this.onBrush?.(0, 0, 0, false); };

  private stampAt(x: number, y: number, ang: number, c: NonNullable<PaintStudio['cur']>, pressure = 0.5) {
    const load = Math.exp(-c.dist / (this.size * 26));
    const pr = pressure > 0 && pressure !== 0.5 ? 0.6 + pressure * 0.8 : 1;
    this.push(x, y, ang + (Math.random() - 0.5) * 0.06, this.size * pr, 2.3, c.rgb, 0.5 * (0.35 + 0.65 * load), c.cell, c.seed, 1 - load);
  }

  private bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('pointerleave', this.onLeave);
    addEventListener('resize', this.onResizeEv);
  }
  private unbind() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('pointerleave', this.onLeave);
    removeEventListener('resize', this.onResizeEv);
  }
  private onResizeEv = () => this.resize();

  private push(x: number, y: number, ang: number, size: number, elong: number, rgb: [number, number, number], alpha: number, cell: number, seed: number, dry: number) {
    if (this.pending >= MAX) this.flush();
    const i = this.pending++;
    this.aP.setXYZW(i, x, y, ang, size);
    this.aC.setXYZW(i, rgb[0], rgb[1], rgb[2], alpha);
    this.aS.setXYZW(i, cell, elong, seed, dry);
  }

  private flush() {
    if (!this.pending) return;
    const g = this.stampMesh.geometry;
    g.instanceCount = this.pending;
    for (const a of [this.aP, this.aC, this.aS]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.pending * 4); a.needsUpdate = true; }
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(this.stampScene, this.cam);
    r.setRenderTarget(null);
    this.pending = 0;
  }

  // ------------------------------------------------------------ auto-painting
  /** queue an algorithmic still life: hatched wall, table, blue edge, a signed two-tone vase, stems & leaves, six heads (bloom → seed) */
  grow() {
    this.grown = true;
    const P = this.palette;
    const ys = [...P.yellows].sort((a, b) => b.L - a.L);
    const fam = (...zh: string[]) => { const c = ys.filter((s) => zh.includes(s.zh)); return c.length ? c.map((s) => s.hex) : ys.map((s) => s.hex); };
    const any = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    /** palette colour (+ optional lift towards lead white), with a little hand-mixed jitter */
    const col = (hex: string, white = 0): [number, number, number] => {
      const [r, g, b] = hexToRgb(hex); const j = 1 + (Math.random() - 0.5) * 0.06;
      const W = [0.984, 0.953, 0.851];
      return [((r / 255) * (1 - white) + W[0] * white) * j, ((g / 255) * (1 - white) + W[1] * white) * j, ((b / 255) * (1 - white) + W[2] * white) * j];
    };
    const A = this.aspect;
    const S: Stroke[] = [];
    const line = (x0: number, y0: number, ang: number, len: number, bend = 0): [number, number][] => {
      const pts: [number, number][] = [];
      let x = x0, y = y0; pts.push([x, y]);
      for (let k = 1; k <= 6; k++) { const a = ang + bend * (k / 6 - 0.5); x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6; pts.push([x, y]); }
      return pts;
    };
    const add = (pts: [number, number][], c: string | [number, number, number], size: number, o: Partial<Stroke> = {}) =>
      S.push({ pts, rgb: typeof c === 'string' ? col(c) : c, size, elong: 2.3, cell: Math.floor(Math.random() * 15), alpha: 0.55, dryRate: 26, ...o });
    const GA = Math.PI * (3 - Math.sqrt(5));
    const greens = ['#58684a', '#6b7d3a', '#4f6e4c', '#5d7440'], lightGreens = ['#8c9a4a', '#9aa653', '#7f8f45'];
    const BLUE = '#2f5f86';
    const ink = { elong: 3, alpha: 0.8, dryRate: 400 };

    // 0. a ground coat (Van Gogh often worked over a toned ground): flat, so the gaps read as paint, not linen
    const fill = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number], alpha: number) =>
      S.push({ pts: [[(x0 + x1) / 2, (y0 + y1) / 2]], rgb: c, size: y1 - y0, elong: (x1 - x0) / (y1 - y0), cell: -1, alpha, dryRate: 1e6 });
    const wall = fam('那不勒斯黄', '柠檬黄', '浅铬黄'), table = fam('土黄', '赭黄', '深铬黄', '铬橙');
    fill(-0.02, 0.345, A + 0.02, 1.01, col(wall[0], 0.3), 0.85);
    fill(-0.02, -0.01, A + 0.02, 0.36, col(any(fam('赭黄', '深铬黄')), 0.05), 0.85);
    // 1. the wall: short hatching in drifting patches of two directions, the palest yellows lifted with lead white
    const WX = 40, WY = 17;
    for (let gy = 0; gy < WY; gy++) for (let gx = 0; gx < WX; gx++) {
      const x = ((gx + 0.1 + Math.random() * 0.8) / WX) * (A + 0.04) - 0.02, y = 0.35 + ((gy + 0.1 + Math.random() * 0.8) / WY) * 0.66;
      const patch = Math.sin(x * 9.0 + Math.sin(y * 7.0) * 1.5) * Math.sin(y * 11.0 + x * 3.0);
      add(line(x, y, (patch > 0 ? 0.75 : -0.55) + (Math.random() - 0.5) * 0.4, 0.03 + Math.random() * 0.025, (Math.random() - 0.5) * 0.35),
        col(any(wall), 0.06 + Math.random() * 0.26), 0.03 + Math.random() * 0.008, { alpha: 0.36, dryRate: 16 });
    }
    // 2. the table: long horizontal strokes in ochres and deep chrome
    for (let gy = 0; gy < 9; gy++) for (let gx = 0; gx < 20; gx++) {
      const x = ((gx + Math.random()) / 20) * (A + 0.1) - 0.08, y = 0.012 + ((gy + Math.random() * 0.8) / 9) * 0.34;
      add(line(x, y, (Math.random() - 0.5) * 0.16, 0.09 + Math.random() * 0.08, (Math.random() - 0.5) * 0.2), any(table), 0.03, { alpha: 0.5 });
    }
    // 3. Van Gogh's blue line along the table edge
    add(Array.from({ length: 24 }, (_, k) => [(k / 23) * A, 0.352 + Math.sin(k * 0.7) * 0.003] as [number, number]), BLUE, 0.011, { ...ink, alpha: 0.75 });

    // 4. the earthenware vase. Brushwork follows the form: meridians round the deep belly, curved bands
    //    across the pale shoulder; lit from the upper left; blue contour, blue glaze seam, lead-white highlight
    const vx = A * 0.5, v0 = 0.06, v1 = 0.46, vh = v1 - v0, seam = 0.5;
    const vr = (t: number) => 0.06 + 0.115 * Math.sin(Math.PI * Math.min(1, t * 1.06)) * (1 - 0.32 * t);
    const vp = (u: number, t: number): [number, number] => [vx + u * vr(t), v0 + t * vh - 0.012 * Math.sqrt(Math.max(0, 1 - u * u))];
    const shade = (c: [number, number, number], u: number): [number, number, number] => {
      const k = u > 0.3 ? 1 - (u - 0.3) * 0.42 : 1;
      return [c[0] * k, c[1] * k, c[2] * k];
    };
    const belly = fam('铬黄', '深铬黄', '铬橙'), shoulder = fam('浅铬黄', '那不勒斯黄', '柠檬黄');
    for (let m = 0; m < 11; m++) {
      const u = -0.94 + (1.88 * (m + 0.5)) / 11;
      for (const [t0, t1] of [[0.0, 0.3], [0.22, 0.53]]) {
        const pts = Array.from({ length: 7 }, (_, j) => vp(u * (1 + (Math.random() - 0.5) * 0.05), t0 + ((t1 - t0) * j) / 6));
        add(pts, shade(col(any(belly), u < 0 ? -u * 0.16 : 0), u), 0.024, { elong: 2.4, alpha: 0.6, dryRate: 30 });
      }
    }
    for (let row = 0; row < 9; row++) {
      const t = seam + 0.02 + ((row + 0.5) / 9) * (0.98 - seam);
      for (const [ua, ub] of [[-0.98, 0.06], [-0.06, 0.98]]) {
        const pts = Array.from({ length: 7 }, (_, j) => vp(ua + ((ub - ua) * j) / 6, t));
        add(pts, shade(col(any(shoulder), ua < 0 ? 0.2 : 0.05), (ua + ub) / 2), 0.021, { elong: 2.4, alpha: 0.6, dryRate: 30 });
      }
    }
    add([vp(-0.62, 0.58), vp(-0.6, 0.68), vp(-0.55, 0.8)], col('#fbf3d9', 0.4), 0.014, { elong: 2.6, alpha: 0.7, dryRate: 200 });
    add([vp(-0.7, 0.12), vp(-0.68, 0.22), vp(-0.62, 0.34)], col('#fbe7a1', 0.3), 0.012, { elong: 2.6, alpha: 0.6, dryRate: 200 });
    for (const side of [-1, 1]) add(Array.from({ length: 19 }, (_, i) => { const t = i / 18; return [vx + side * (vr(t) + 0.006), v0 + t * vh] as [number, number]; }), BLUE, 0.011, ink);
    add(Array.from({ length: 13 }, (_, i) => vp(-1 + i / 6, seam)), BLUE, 0.009, ink);
    add(Array.from({ length: 13 }, (_, i) => vp(-1 + i / 6, 0.0)), BLUE, 0.01, ink);
    add(Array.from({ length: 21 }, (_, i) => { const th = (i / 20) * Math.PI * 2; return [vx + Math.cos(th) * vr(1) * 1.04, v1 + Math.sin(th) * 0.012] as [number, number]; }), BLUE, 0.01, ink);
    // ... and, like the London picture, the vase is signed "Vincent" in blue
    const sig: [number, number][][] = [
      [[0, 2], [0.45, 0], [1.0, 2.1]],
      [[1.12, 0.3], [1.3, 1], [1.35, 0], [1.55, 1], [1.6, 0], [1.7, 0.85], [1.9, 1], [2.0, 0.6], [2.02, 0]],
      [[2.55, 0.85], [2.32, 1], [2.15, 0.5], [2.3, 0], [2.62, 0.15], [2.9, 0.5], [2.8, 1], [2.64, 0.7], [2.76, 0.08], [3.05, 0.15],
        [3.15, 1], [3.2, 0], [3.32, 0.88], [3.5, 1], [3.6, 0.6], [3.62, 0], [3.82, 0.3], [3.95, 1.8], [3.9, 0.2], [4.12, 0.1]],
      [[3.74, 1.1], [4.16, 1.16]], [[1.28, 1.5], [1.31, 1.56]],
    ];
    for (const s of sig) add(s.map(([u, w]) => { const [px, py] = vp(-0.42 + u * 0.17, 0.66); return [px, py + w * 0.021] as [number, number]; }), BLUE, 0.0055, { elong: 1.8, alpha: 0.85, dryRate: 600 });

    // 5. stems from the vase mouth, then leaves hanging over the shoulder
    type Head = { x: number; y: number; rd: number; nOut: number; nIn: number; len: [number, number]; wilt: number; tilt?: number; squash?: number; bud?: boolean };
    const heads: Head[] = [   // painted back to front
      { x: vx + 0.4, y: 0.88, rd: 0.045, nOut: 9, nIn: 0, len: [0.035, 0.05], wilt: 0.8, tilt: 0.3, squash: 0.85 },
      { x: vx - 0.12, y: 0.92, rd: 0.03, nOut: 0, nIn: 0, len: [0, 0], wilt: 0, bud: true },
      { x: vx - 0.45, y: 0.52, rd: 0.05, nOut: 21, nIn: 13, len: [0.06, 0.085], wilt: 0.3, tilt: -0.3, squash: 0.8 },
      { x: vx - 0.3, y: 0.73, rd: 0.06, nOut: 21, nIn: 13, len: [0.07, 0.1], wilt: 0.1, tilt: 0.5, squash: 0.62 },
      { x: vx + 0.36, y: 0.6, rd: 0.055, nOut: 21, nIn: 13, len: [0.07, 0.1], wilt: 1, tilt: -0.4, squash: 0.72 },
      { x: vx + 0.05, y: 0.76, rd: 0.08, nOut: 34, nIn: 21, len: [0.1, 0.15], wilt: 0 },
    ];
    heads.forEach((h, i) => {
      const sx = vx + (i - 2.5) * 0.014, sy = v1 - 0.01;
      for (let k = 0; k < 2; k++) {
        const pts: [number, number][] = [];
        for (let j = 0; j <= 14; j++) { const t = j / 14; const bow = Math.sin(t * Math.PI) * (h.x > vx ? 0.05 : -0.05); pts.push([sx + (h.x - sx) * t + bow + k * 0.006, sy + (h.y - sy) * Math.pow(t, 0.9)]); }
        add(pts, any(greens), 0.015, { dryRate: 90 });
      }
    });
    const leaf = (bx: number, by: number, dir: number, L: number, W: number, curl: number) => {
      const at = (t: number, s: number): [number, number] => {
        const a = dir + curl * t, m = dir + curl * t * 0.5, w = W * Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.8))) * s;
        return [bx + Math.cos(m) * L * t - Math.sin(a) * w, by + Math.sin(m) * L * t + Math.cos(a) * w];
      };
      for (let i = 0; i < 9; i++) {
        const t = 0.06 + (i / 8) * 0.82;
        for (const s of [-1, 1]) add([at(t, 0), at(t + 0.04, s * 0.55), at(t + 0.08, s * 0.95)], any(s > 0 ? lightGreens : greens), 0.026, { elong: 2.0, alpha: 0.62, dryRate: 40 });
      }
      add(Array.from({ length: 8 }, (_, j) => at(j / 7, 0)), '#3f5636', 0.008, { elong: 2.6, alpha: 0.75, dryRate: 300 });
    };
    leaf(vx - 0.04, 0.5, Math.PI * 1.12, 0.17, 0.055, -0.5);
    leaf(vx + 0.06, 0.52, -0.25, 0.17, 0.055, -0.6);
    leaf(vx + 0.2, 0.65, 0.15, 0.12, 0.042, -0.9);
    leaf(vx - 0.2, 0.64, Math.PI * 0.86, 0.12, 0.042, 0.7);

    // 6. heads: full bloom, turning away, wilting, gone to seed, a bud — the life cycle again
    const chrome = fam('铬黄', '浅铬黄', '深铬黄'), tips = fam('柠檬黄', '浅铬黄'), orange = fam('铬橙', '深铬黄'), dry = fam('赭黄', '生赭', '熟赭', '土黄');
    const discCols = { inner: ['#5a5a26', '#6b5a1e', '#4d4a22'], midc: ['#4a2f12', '#5c3a14', '#3d2a10', '#6b4316'], rim: ['#9b4811', '#b8621c', '#c88611'] };
    for (const h of heads) {
      const k = h.rd / 0.085;
      if (h.bud) {
        for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; add(line(h.x + Math.cos(a) * h.rd * 0.3, h.y + Math.sin(a) * h.rd * 0.3, a + 1.2, h.rd * 1.6, 0.9), any(greens), 0.018, { elong: 2.2 }); }
        add(line(h.x - 0.01, h.y + 0.02, 1.4, 0.02), any(tips), 0.01, { alpha: 0.8, dryRate: 300 });
        continue;
      }
      // foreshortening: the face of a turned head is an ellipse (squash along the tilt axis)
      const ct = Math.cos(h.tilt ?? 0), st = Math.sin(h.tilt ?? 0), q = h.squash ?? 1;
      const F = (x: number, y: number): [number, number] => { const dx = x - h.x, dy = y - h.y; const a = dx * ct + dy * st, b = (-dx * st + dy * ct) * q; return [h.x + a * ct - b * st, h.y + a * st + b * ct]; };
      const put = (pts: [number, number][], c: string | [number, number, number], size: number, o: Partial<Stroke> = {}) => add(pts.map(([x, y]) => F(x, y)), c, size, o);
      const droop = (a: number) => { if (!h.wilt) return a; const w = Math.atan2(Math.sin(a), Math.cos(a)); return w + (-Math.PI / 2 - w) * 0.45 * h.wilt * Math.abs(Math.cos(w)); };
      for (let i = 0; i < h.nOut; i++) {
        const a0 = (i / h.nOut) * Math.PI * 2 + (Math.random() - 0.5) * 0.08, a = droop(a0);
        const len = h.len[0] + Math.random() * (h.len[1] - h.len[0]), bend = (Math.random() - 0.5) * 0.5 + h.wilt * 0.9 * Math.sign(Math.cos(a0));
        for (let j = 0; j < 3; j++) {
          const off = (j - 1) * 0.11;
          const c = h.wilt > 0.5 ? any(j === 1 ? dry : orange) : j === 1 ? any(chrome) : any(j === 0 ? orange : tips);
          put(line(h.x + Math.cos(a + off * 0.3) * h.rd * 0.85, h.y + Math.sin(a + off * 0.3) * h.rd * 0.85, a + off * 0.25, len * (j === 1 ? 1 : 0.86) * (1 - h.wilt * 0.25), bend),
            c, 0.026 * Math.max(0.7, k), { elong: 2.6 });
        }
      }
      for (let i = 0; i < h.nIn; i++) {
        const a = droop(((i + 0.5) / h.nIn) * Math.PI * 2);
        put(line(h.x + Math.cos(a) * h.rd * 0.8, h.y + Math.sin(a) * h.rd * 0.8, a + (Math.random() - 0.5) * 0.2, (0.06 + Math.random() * 0.03) * k, 0.3), any(h.wilt > 0.5 ? dry : orange), 0.024 * Math.max(0.7, k), { elong: 2.4 });
      }
      // the seed disc: Vogel's model, dark heart, bronze ring
      const N = Math.round(260 * k * k);
      for (let n = N; n >= 1; n--) {
        const f = n / N, r = h.rd * Math.sqrt(f), th = n * GA;
        const c = f < 0.18 ? any(discCols.inner) : f < 0.78 ? any(discCols.midc) : any(discCols.rim);
        put(line(h.x + Math.cos(th) * r, h.y + Math.sin(th) * r, th + 1.2, 0.012 * Math.max(0.6, k)), c, (0.014 + f * 0.006) * Math.max(0.7, k), { elong: 1.5, alpha: 0.8, dryRate: 400 });
      }
      // last touches: lemon highlights on the petals, ochre specks in the disc
      if (h.wilt < 0.5) for (let i = 0; i < Math.round(40 * k); i++) {
        const a = Math.random() * Math.PI * 2, r0 = h.rd * (1.1 + Math.random() * 0.8);
        put(line(h.x + Math.cos(a) * r0, h.y + Math.sin(a) * r0, a, 0.035 * k, 0.2), any(tips), 0.012, { alpha: 0.7, elong: 2.8, dryRate: 200 });
      }
      for (let i = 0; i < Math.round(30 * k); i++) {
        const a = Math.random() * Math.PI * 2, r0 = h.rd * Math.sqrt(Math.random()) * 0.9;
        put(line(h.x + Math.cos(a) * r0, h.y + Math.sin(a) * r0, a, 0.006), '#c88611', 0.009, { alpha: 0.9, elong: 1.2, dryRate: 400 });
      }
    }
    // 7. fallen petals on the table
    for (const [fx, fy, fa] of [[vx + 0.24, 0.1, 0.3], [vx - 0.31, 0.16, -0.5], [vx + 0.42, 0.22, 2.6]] as const) add(line(fx, fy, fa, 0.07, 0.6), any(orange), 0.022, { elong: 2.6 });

    // convert aspect-space x to uv
    for (const s of S) s.pts = s.pts.map(([x, y]) => [x / A, y] as [number, number]);
    this.queue.push(...S);
  }

  private pumpQueue(dt: number) {
    let budget = this.rate * dt + this.qCarry;
    while (budget >= 1) {
      if (!this.qStroke) { this.qStroke = this.queue.shift() ?? null; this.qIndex = 0; if (!this.qStroke) { budget = 0; break; } }
      const s = this.qStroke;
      if (s.cell < 0) { const [gx, gy] = s.pts[0]; this.push(gx, gy, 0, s.size, s.elong, s.rgb, s.alpha, s.cell, 0, 0); this.qStroke = null; budget--; continue; }
      // resample the polyline at ~0.3 brush widths
      const A = this.aspect;
      let total = 0; const segs: number[] = [];
      for (let i = 1; i < s.pts.length; i++) { const d = Math.hypot((s.pts[i][0] - s.pts[i - 1][0]) * A, s.pts[i][1] - s.pts[i - 1][1]); segs.push(d); total += d; }
      const step = s.size * 0.3, count = Math.max(1, Math.ceil(total / step));
      const seed = s.cell * 0.37;
      while (this.qIndex <= count && budget >= 1) {
        const dist = (this.qIndex / count) * total;
        let acc = 0, k = 0;
        while (k < segs.length - 1 && acc + segs[k] < dist) { acc += segs[k]; k++; }
        const t = segs[k] ? (dist - acc) / segs[k] : 0;
        const p0 = s.pts[k], p1 = s.pts[Math.min(k + 1, s.pts.length - 1)];
        const x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t;
        const ang = Math.atan2(p1[1] - p0[1], (p1[0] - p0[0]) * A);
        const load = Math.exp(-dist / (s.size * s.dryRate));
        this.push(x, y, ang, s.size, s.elong, s.rgb, s.alpha * (0.35 + 0.65 * load), s.cell, seed, 1 - load);
        this.qIndex++; budget--;
      }
      if (this.qIndex > count) this.qStroke = null;
    }
    this.qCarry = budget;
  }

  get busy() { return !!this.qStroke || this.queue.length > 0; }

  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.busy) this.pumpQueue(dt);
    this.flush();
    if (!this.hover) {
      const t = now / 1000;
      this.lightT.set(Math.sin(t * 0.4) * 0.55, 0.32 + Math.cos(t * 0.3) * 0.12, 0.42);
    }
    this.light.lerp(this.lightT, 1 - Math.exp(-dt * (this.hover ? 14 : 2)));
    const r = this.renderer;
    r.setRenderTarget(null);
    r.render(this.displayScene, this.cam);
  };

  /** render the lit painting at full resolution and download it as PNG (with a small seal) */
  async save() {
    this.flush();
    const r = this.renderer;
    const out = new THREE.WebGLRenderTarget(this.W, this.H, { depthBuffer: false });
    r.setRenderTarget(out);
    r.render(this.displayScene, this.cam);
    const px = new Uint8Array(this.W * this.H * 4);
    r.readRenderTargetPixels(out, 0, 0, this.W, this.H, px);
    r.setRenderTarget(null);
    out.dispose();
    const c = document.createElement('canvas'); c.width = this.W; c.height = this.H;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.W, this.H);
    for (let y = 0; y < this.H; y++) img.data.set(px.subarray((this.H - 1 - y) * this.W * 4, (this.H - y) * this.W * 4), y * this.W * 4);
    ctx.putImageData(img, 0, 0);
    // vermilion seal
    const s = Math.round(this.H * 0.075), x = this.W - s * 1.6, y = this.H - s * 1.6;
    ctx.fillStyle = '#c23b22'; ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.roundRect(x, y, s, s, s * 0.12); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#fbf3d9';
    ctx.font = `${Math.round(s * 0.3)}px "Ma Shan Zheng", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ['向', '日', '葵'].forEach((ch, i) => ctx.fillText(ch, x + s / 2, y + s * (0.22 + i * 0.28)));
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sunflowers-my-stroke.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}
