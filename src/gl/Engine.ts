import * as THREE from 'three';
import Lenis from 'lenis';
import { store, type Stage } from '../store';
import { synth } from '../audio/Synth';
import { nearestSwatch, sharedPalette, type Palette } from '../lib/palette';
import {
  CAM_D, PAINT_W, PAINT_H, TEX_W, TEX_H, framing, clamp01, smoothstep, lerp, damp, easeInOut, pointerOnPlane,
  type Frame,
} from './common';
import { Diorama } from './Diorama';
import { Atmosphere } from './Atmosphere';
import { StrokeField, strokeWorker } from './StrokeField';
import { CAPTURE } from '../lib/capture';
import { SCENE_TEXTURES, bytes, gpuIdle, imageAsset, loadTexture, yieldToPaint, type TexOpts } from './assets';
import { Sunflower } from './Sunflower';
import { Backdrop } from './Backdrop';
import { Governor } from './governor';

export const SECTIONS = ['hero', 'yellows', 'bloom', 'fade', 'studio', 'outro'] as const;
export type SectionName = (typeof SECTIONS)[number];

const seg = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
/** 0..1 -> 0..n with a plateau at every integer, so each life stage can be read while scrolling */
const stair = (u: number, n: number) => { const x = u * n; const k = Math.min(n - 1, Math.floor(x)); return k + smoothstep(0.2, 0.8, x - k); };
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/** 1888 → 2026 (today) → 2150; the slider spends 55 % of its travel on the past */
export const ageToYear = (a: number) => Math.round(a <= 0.55 ? 1888 + (a / 0.55) * 138 : 2026 + ((a - 0.55) / 0.45) * 124);
export const yearToAge = (y: number) => (y <= 2026 ? ((y - 1888) / 138) * 0.55 : 0.55 + ((y - 2026) / 124) * 0.45);

const isUi = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, select, textarea, label, [data-ui]');
type ScrollVar = 'p' | 'e' | 'l';
const perSection = <T>(f: () => T) => Object.fromEntries(SECTIONS.map((n) => [n, f()])) as Record<SectionName, T>;

export class Engine {
  /** cheap feature test; a context that still fails to come up makes init() reject → static fallback */
  static supported() {
    return typeof WebGL2RenderingContext !== 'undefined';
  }

  readonly canvas: HTMLCanvasElement;
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  diorama!: Diorama; atmos!: Atmosphere; strokes!: StrokeField; flower!: Sunflower; backdrop!: Backdrop;
  palette!: Palette;
  lenis: Lenis | null = null;
  rank!: Float32Array; chroma!: Float32Array;

  private restCam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private bdScene = new THREE.Scene(); private bdCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bdRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false });
  private bdQuad!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private bdScale = 0.5;
  private master!: { data: Uint8ClampedArray; w: number; h: number };
  private els: Partial<Record<SectionName, HTMLElement>> = {};
  private rel: Record<SectionName, number> = { hero: 0, yellows: -2, bloom: -3, fade: -4, studio: -5, outro: -6 };
  private len: Record<SectionName, number> = { hero: 1.7, yellows: 4, bloom: 4, fade: 3, studio: 1, outro: 1.4 };
  /** section boxes in document coordinates: re-read only after something changed size (ResizeObserver) */
  private geo = perSection(() => ({ top: 0, h: 0 }));
  private geoDirty = true; private docH = 1;
  private ro: ResizeObserver | null = null;
  /** this frame's scroll variables per section, already formatted */
  private sv = perSection(() => ({ p: '0', e: '0', l: '0' }));
  /** the few elements that read --p / --e / --l (marked data-vars), and the bar that reads --scroll */
  private fx: { el: HTMLElement; sec: SectionName; vars: ScrollVar[]; props: string[] }[] = [];
  private progress: HTMLElement | null = null;
  private css = new WeakMap<HTMLElement, Record<string, string>>();
  private cursor: HTMLElement | null = null; private cursorLabel: HTMLElement | null = null; private cursorState = '';
  private raf = 0; private last = 0; private started = 0; private gateFrames = 0;
  readonly fr: Frame;
  readonly mobile: boolean;
  private dpr = 1; private maxDpr = 1.75; private topDpr = 1.75;
  /** picks the render resolution from measured frame times (see governor.ts) */
  private gov = new Governor(); private pinnedDpr = false;
  private intro = 0; private introOn = false; private introAt = 0;
  private visible = true;
  private piloted = false;
  /** called at the top of every drawn frame, before the scroll is read (auto mode drives the page from here) */
  beforeFrame: ((now: number) => void) | null = null;
  private ptr = { downX: 0, downY: 0, lastX: 0, lastY: 0, dragging: false, hold: 0, overUi: false };
  private lastMove = -1e9;
  private hovered = -1; private swatch = -1; private discCluster = -1; private discOwnsHover = false;
  private camZ = CAM_D + 1.5; private rake = 0;
  private discPos = new THREE.Vector3(); private discNdc = new THREE.Vector2();
  private light = new THREE.Vector3(); private lightNdc = new THREE.Vector2(); private center = new THREE.Vector2();
  private mixV = new THREE.Vector4(1, 0, 0, 0);
  private tmpV = new THREE.Vector3(); private tmpN = new THREE.Vector3(); private ndc = new THREE.Vector2();
  private ray = new THREE.Raycaster(); private plane = new THREE.Plane();
  private mode: SectionName = 'hero';
  private lastStage = -1; private lastChapter = -1;
  private lastPixel = 800;
  private qaSteps = /[?&]qa\b/.test(location.search) ? 8 : 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
    this.fr = {
      t: 0, dt: 0, w: innerWidth, h: innerHeight, aspect: innerWidth / innerHeight, mobile: this.mobile,
      reduced: store.get().reducedMotion,
      pointer: { x: 0.2, y: 0.3, sx: 0.2, sy: 0.3, cx: innerWidth / 2, cy: innerHeight / 2, down: false, downAt: 0, type: 'mouse', inside: false, dragX: 0, dragY: 0 },
    };
  }

  async init() {
    performance.mark('sf:init');
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
    THREE.ColorManagement.enabled = false;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.autoClear = false;
    r.setClearColor(0xe9cf72, 1);
    r.debug.checkShaderErrors = import.meta.env.DEV;   // the error log is a blocking round-trip per program
    this.renderer = r;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.6 : 1.75);
    const qaDpr = Number(/[?&]dpr=([\d.]+)/.exec(location.search)?.[1]);   // ?dpr=0.5: quick film previews / QA probes
    if (qaDpr > 0) this.maxDpr = qaDpr;
    this.pinnedDpr = qaDpr > 0 || CAPTURE;   // a requested resolution, or a film on a virtual clock: hold it
    this.dpr = this.maxDpr;
    r.setPixelRatio(this.dpr);
    this.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

    // ---- progress: 82 % bytes on the wire (streamed), 18 % GPU / CPU preparation steps
    let work = 0; const WORK = 23;
    const report = () => store.set({ loaded: Math.min(0.995, 0.82 * bytes.fraction + 0.18 * (work / WORK)) });
    const step = () => { work++; report(); };
    const offBytes = bytes.onChange(report);

    // ---- 1 · everything is already downloading (main.tsx → prefetchScene); each piece is decoded
    // off the main thread and handed to the GPU as soon as it lands, one per frame
    bytes.expect([...SCENE_TEXTURES, 'master.webp']);
    const sw = strokeWorker();
    let gpu: Promise<unknown> = Promise.resolve();
    const tex = (name: string, o?: TexOpts) => {
      const p = loadTexture(name, o);
      gpu = gpu.then(() => p).then(async (t) => { await yieldToPaint(); r.initTexture(t); step(); });
      return p;
    };
    const T = {
      bg: tex('bg.webp'), mid: tex('mid.webp'), midForm: tex('mid_form.webp'), table: tex('table.webp'), tableForm: tex('table_form.webp'),
      fg: tex('fg.webp'), strokes: tex('strokes.webp'), petals: tex('petals.webp'), seed: tex('seedhead.webp'), canvas: tex('canvas.webp', { repeat: true }),
    };
    gpu.catch(() => {});
    const palP = sharedPalette(), imgP = imageAsset('master.webp');
    const strokeP = Promise.all([imgP, palP]).then(([img, pal]) => sw.run(img, pal, this.mobile ? 24000 : 48000));
    strokeP.catch(() => sw.dispose());
    const fontsP = document.fonts ? document.fonts.ready.then(() => undefined) : Promise.resolve();

    // palette ranks + a small CPU copy of the painting for the colour loupe (in parallel with the rest)
    const sampling = (async () => {
      const pal = await palP;
      this.palette = pal;
      const order = pal.all.map((s, i) => ({ i, L: s.L })).sort((a, b) => a.L - b.L);
      this.rank = new Float32Array(pal.all.length);
      order.forEach((o, k) => { this.rank[o.i] = k / (order.length - 1); });
      const maxC = Math.max(...pal.all.map((s) => s.C));
      this.chroma = Float32Array.from(pal.all.map((s) => s.C / maxC));
      const img = await imgP;
      const mc = document.createElement('canvas'); mc.width = 384; mc.height = 256;
      const mctx = mc.getContext('2d', { willReadFrequently: true })!;
      mctx.drawImage(img, 0, 0, 384, 256);
      this.master = { data: mctx.getImageData(0, 0, 384, 256).data, w: 384, h: 256 };
    })();

    // ---- 2 · build each scene as soon as its own textures are in, then compile it and draw it
    // once into the very target it will use (the backdrop's own target, or the multisampled canvas
    // through a tiny viewport): programs link, uniforms resolve, buffers upload and lazy drivers
    // build their pipelines now, while the downloads continue — not when the visitor arrives.
    const warm = async (obj: THREE.Object3D, cam: THREE.Camera, rt: THREE.WebGLRenderTarget | null = null) => {
      await r.compileAsync(obj, cam, obj instanceof THREE.Scene ? obj : this.scene).catch(() => {});
      await gpuIdle(r);                             // links finish over there while this thread stays free
      const undo: (() => void)[] = [];
      obj.traverse((o) => {
        if (!o.visible) { o.visible = true; undo.push(() => { o.visible = false; }); }
        if (o.frustumCulled) { o.frustumCulled = false; undo.push(() => { o.frustumCulled = true; }); }
      });
      const size = r.getSize(new THREE.Vector2());
      r.setRenderTarget(rt);
      if (!rt) r.setViewport(0, 0, 8, 8);
      r.render(obj, cam);
      if (!rt) r.setViewport(0, 0, size.x, size.y);
      r.setRenderTarget(null);
      undo.forEach((f) => f());
      await gpuIdle(r);                             // …and so do the pipelines that first draw just built
      step();
    };
    // the main scene keeps its original construction order (diorama → strokes → atmosphere), so
    // every object id — and with it the draw order — is exactly what it always was
    const mainScene = (async () => {
      const [bg, mid, midForm, table, tableForm, fg] = await Promise.all([T.bg, T.mid, T.midForm, T.table, T.tableForm, T.fg]);
      await yieldToPaint();
      this.diorama = new Diorama({ bg, mid, midForm, table, tableForm, fg }); step();
      await warm(this.diorama.group, this.cam);
      const [strokeData, strokesT] = await Promise.all([strokeP, T.strokes]);
      step();
      await yieldToPaint();
      this.strokes = new StrokeField(strokeData, strokesT); step();
      this.strokes.mesh.renderOrder = -1;           // under the painting: the painting dissolves into its strokes
      await warm(this.strokes.mesh, this.cam);
      const petals = await T.petals;
      await yieldToPaint();
      this.atmos = new Atmosphere(petals, this.mobile); step();
      await warm(this.atmos.group, this.cam);
    })();
    // the flower and the painted backdrop live in scenes of their own: no ordering to preserve
    const flowerScene = (async () => {
      const [seed, petals, strokesT] = await Promise.all([T.seed, T.petals, T.strokes]);
      await yieldToPaint();
      this.flower = new Sunflower(seed, petals, strokesT); step();
      await warm(this.flower.scene, this.flower.camera);
    })();
    const backdropScene = (async () => {
      const canvasT = await T.canvas;
      await yieldToPaint();
      this.backdrop = new Backdrop(canvasT, this.mobile); step();
      this.bdScene.add(this.backdrop.mesh);
      await warm(this.bdScene, this.bdCam, this.bdRT);
    })();
    await Promise.all([sampling, mainScene, flowerScene, backdropScene]);

    // the painted backdrop is soft by nature: shade it at reduced resolution, then composite
    this.bdScale = this.mobile ? 0.5 : 0.6;
    this.bdQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D uMap; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0); }',
      uniforms: { uMap: { value: this.bdRT.texture } }, depthTest: false, depthWrite: false,
    }));
    this.bdQuad.frustumCulled = false; this.bdQuad.renderOrder = -100;
    this.scene.add(this.bdQuad, this.strokes.mesh, this.diorama.group, this.atmos.group);
    await warm(this.bdQuad, this.cam);
    performance.mark('sf:built');

    this.collectDom();
    this.resize();
    await gpu;                                      // every texture handed over…
    await gpuIdle(r);                               // …uploaded, mip-mapped, and every pipeline built
    performance.mark('sf:gpu');
    await fontsP; step();
    offBytes();
    performance.mark('sf:ready');
    performance.measure('sf:init→ready', 'sf:init', 'sf:ready');

    this.bind();
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    this.started = performance.now();
    this.last = this.started / 1000;
    this.raf = requestAnimationFrame(this.loop);
    store.set({ loaded: 1, ready: true });
  }

  /** resolves once this context's GPU queue has drained (never blocks the page) */
  idle() { return this.renderer ? gpuIdle(this.renderer) : Promise.resolve(); }

  /** called from the loader's buttons (a user gesture, so audio may start) */
  enter(sound: boolean) {
    synth.setEnabled(sound);
    store.set({ entered: true, enteredAt: performance.now(), sound });
    document.documentElement.classList.remove('locked');
    this.introOn = true; this.introAt = performance.now();
    this.started = this.introAt;            // adaptive resolution only judges frames after the gate
    if (!this.fr.reduced) {
      this.lenis = new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.3, syncTouch: false });
    }
  }

  collectDom() {
    this.els = {};
    document.querySelectorAll<HTMLElement>('[data-section]').forEach((el) => {
      this.els[el.dataset.section as SectionName] = el;
    });
    this.cursor = document.getElementById('sun-cursor');
    this.cursorLabel = document.getElementById('sun-cursor-label');
    this.progress = document.getElementById('scroll-progress');
    // the scroll variables go only to the elements that read them (registered as non-inherited in
    // styles.css), so a scroll step restyles a handful of nodes instead of whole chapters
    this.fx = [];
    document.querySelectorAll<HTMLElement>('[data-section] [data-vars]').forEach((el) => {
      const sec = el.closest<HTMLElement>('[data-section]')!.dataset.section as SectionName;
      const vars = (el.dataset.vars ?? '').split(/\s+/).filter((v): v is ScrollVar => v === 'p' || v === 'e' || v === 'l');
      this.fx.push({ el, sec, vars, props: vars.map((v) => '--' + v) });
    });
    // section boxes only move when something changes size (viewport, fonts, content): watch for
    // that instead of reading every box each frame, which forced a synchronous layout per scroll step
    this.ro?.disconnect();
    this.ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { this.geoDirty = true; });
    if (this.ro) {
      for (const n of SECTIONS) { const el = this.els[n]; if (el) this.ro.observe(el); }
      this.ro.observe(document.body);
    }
    this.geoDirty = true;
  }

  /** a chapter's top from the cached layout (re-read only after something changed size) */
  sectionTop(name: SectionName) {
    if (this.geoDirty || !this.ro) this.readGeometry(window.scrollY);
    return this.geo[name].top;
  }

  absTop(name: SectionName) {
    const el = this.els[name];
    return el ? el.getBoundingClientRect().top + window.scrollY : 0;
  }

  scrollTo(target: SectionName | number, offsetVh = 0) {
    const y = typeof target === 'number' ? target : this.absTop(target) + offsetVh * innerHeight;
    if (this.lenis) this.lenis.scrollTo(y, { duration: 1.9 });
    else window.scrollTo({ top: y, behavior: this.fr.reduced ? 'auto' : 'smooth' });
  }

  /** scroll so the bloom chapter shows life stage k (0..3) */
  scrollToStage(k: number) {
    const LB = Math.max(0.5, this.len.bloom - 1);
    const u = [0.02, 1 / 3, 2 / 3, 0.985][k] ?? 0;
    this.scrollTo('bloom', 0.06 + u * (LB * 0.94 - 0.06));
  }

  private bind() {
    addEventListener('resize', this.onResize);
    visualViewport?.addEventListener('resize', this.onResize);
    addEventListener('pointermove', this.onMove, { passive: true });
    addEventListener('pointerdown', this.onDown, { passive: true });
    addEventListener('pointerup', this.onUp, { passive: true });
    addEventListener('pointercancel', this.onCancel, { passive: true });
    document.addEventListener('pointerleave', this.onLeave);
    addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVis);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect(); this.ro = null;
    removeEventListener('resize', this.onResize);
    visualViewport?.removeEventListener('resize', this.onResize);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointerup', this.onUp);
    removeEventListener('pointercancel', this.onCancel);
    document.removeEventListener('pointerleave', this.onLeave);
    removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVis);
    this.lenis?.destroy();
    this.renderer?.dispose();
  }

  private onVis = () => {
    const ctx = synth.ctx; if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (store.get().sound) ctx.resume();
  };

  private resizeQueued = false;
  private onResize = () => {
    this.geoDirty = true;
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(() => { this.resizeQueued = false; this.resize(); });
  };

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    // keep the drawing buffer around ~3.4 megapixels whatever the screen
    const cap = Math.max(0.85, Math.min(this.maxDpr, Math.sqrt(3.4e6 / (w * h))));
    this.topDpr = cap;
    if (Math.abs(this.renderer.getPixelRatio() - Math.min(this.dpr, cap)) > 0.01) this.renderer.setPixelRatio(Math.min(this.dpr, cap));
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    this.bdRT.setSize(Math.max(4, Math.round(w * pr * this.bdScale)), Math.max(4, Math.round(h * pr * this.bdScale)));
    const aspect = w / h;
    const f = framing(aspect);
    this.cam.fov = f.fov; this.cam.aspect = aspect; this.cam.updateProjectionMatrix();
    this.fr.w = w; this.fr.h = h; this.fr.aspect = aspect;
    this.diorama.resize(f.visH);
    this.flower.resize(aspect);
    this.flower.camera.updateMatrixWorld();
    this.flower.root.updateMatrixWorld(true);
    // put the colour-flower exactly where the 3D sunflower will later grow
    this.restCam.copy(this.cam);
    this.restCam.position.set(0, 0, CAM_D); this.restCam.lookAt(0, 0, 0); this.restCam.updateMatrixWorld();
    const head = this.flower.root.getWorldPosition(new THREE.Vector3()).project(this.flower.camera);
    pointerOnPlane(this.restCam, head.x, head.y, 0, this.discPos);
    this.discNdc.set(head.x, head.y);
    const wide = aspect >= 1;
    const rOut = wide
      ? Math.min(f.visH * 0.4, f.visW / 2 - Math.abs(this.discPos.x) + 0.45, f.visW * 0.28)
      : Math.min(f.visW * 0.36, f.visH * 0.235);   // petal tips reach ~1.17 rOut; leave room for parallax
    this.strokes.scale = Math.max(0.15, rOut / (this.strokes.R * 1.8));
    this.strokes.offset.copy(this.discPos);
    this.strokes.mesh.material.uniforms.uSpiralSize.value = 0.085 * this.strokes.scale * (this.mobile ? 2.1 : 1.6);
    this.lastPixel = (h * pr) / (2 * Math.tan((f.fov * Math.PI) / 360));
  }

  // ---------------------------------------------------------------- pointer
  private setPointer(e: PointerEvent) {
    const p = this.fr.pointer;
    p.cx = e.clientX; p.cy = e.clientY;
    p.x = (e.clientX / innerWidth) * 2 - 1;
    p.y = -(e.clientY / innerHeight) * 2 + 1;
    p.type = e.pointerType; p.inside = true;
    this.lastMove = performance.now();
  }
  private onMove = (e: PointerEvent) => {
    this.setPointer(e);
    this.ptr.overUi = isUi(e.target);
    const p = this.fr.pointer;
    if (!p.down) return;
    const dx = e.clientX - this.ptr.lastX, dy = e.clientY - this.ptr.lastY;
    this.ptr.lastX = e.clientX; this.ptr.lastY = e.clientY;
    if (!this.ptr.dragging && Math.hypot(e.clientX - this.ptr.downX, e.clientY - this.ptr.downY) > 7) {
      this.ptr.dragging = true;
      clearTimeout(this.ptr.hold);
      if (store.get().raking && e.pointerType === 'touch') store.set({ raking: false });
    }
    if (this.ptr.dragging) {
      p.dragX += dx / innerWidth;
      p.dragY += e.pointerType === 'touch' ? 0 : dy / innerHeight;
    }
  };
  private onDown = (e: PointerEvent) => {
    if (isUi(e.target) || !store.get().entered) return;
    if (e.button !== undefined && e.button > 0) return;
    this.setPointer(e);
    const p = this.fr.pointer;
    p.down = true; p.downAt = performance.now();
    this.ptr.downX = this.ptr.lastX = e.clientX; this.ptr.downY = this.ptr.lastY = e.clientY; this.ptr.dragging = false;
    clearTimeout(this.ptr.hold);
    this.ptr.hold = window.setTimeout(() => {
      if (p.down && !this.ptr.dragging && this.paintingVisible()) store.set({ raking: true });
    }, e.pointerType === 'touch' ? 380 : 200);
  };
  private onUp = (e: PointerEvent) => {
    const p = this.fr.pointer;
    if (!p.down) return;
    p.down = false; clearTimeout(this.ptr.hold);
    const raked = store.get().raking;
    if (raked) store.set({ raking: false });
    if (!this.ptr.dragging && !raked && performance.now() - p.downAt < 450) { this.setPointer(e); this.click(); }
    this.ptr.dragging = false;
  };
  private onCancel = () => {
    const p = this.fr.pointer; p.down = false; this.ptr.dragging = false; clearTimeout(this.ptr.hold);
    if (store.get().raking) store.set({ raking: false });
  };
  // while auto mode holds the pointer, the real mouse leaving the window (or the window losing
  // focus to a screen recorder) must not drop the tour's hover or let go of its held button
  private onLeave = () => { if (!this.piloted) this.fr.pointer.inside = false; };
  private onBlur = () => { if (!this.piloted) this.onCancel(); };

  /** auto mode takes (on) or hands back (off) the pointer; handing back lets go and hides the cursor until the mouse moves */
  pilot(on: boolean) {
    this.piloted = on;
    if (!on) { this.onCancel(); this.fr.pointer.inside = false; this.lastMove = -1e9; }
  }

  /** where the colour-flower sits on screen (viewport fractions) */
  discPoint(): [number, number] { return [(this.discNdc.x + 1) / 2, (1 - this.discNdc.y) / 2]; }

  /** the flowers in the middle of the screen right now, biggest first: centre (viewport fractions) and size (samples hit) — for auto mode to click */
  flowerSpots(): Array<{ x: number; y: number; n: number }> {
    const hits = new Map<number, [number, number, number]>();
    for (let y = -0.2; y <= 0.85; y += 0.025) for (let x = -0.5; x <= 0.3; x += 0.0125) {
      const { i } = this.pickAt(x, y); if (i < 0) continue;
      const a = hits.get(i) ?? [0, 0, 0]; a[0] += x; a[1] += y; a[2]++; hits.set(i, a);
    }
    return [...hits.values()].sort((p, q) => q[2] - p[2]).map(([sx, sy, n]) => ({ x: (sx / n + 1) / 2, y: (1 - sy / n) / 2, n }));
  }

  private revealNow = 0;
  private paintingVisible() { return this.revealNow > 0.85; }

  /** flower index under the given NDC position (painting plane z = 0) */
  private pickAt(x: number, y: number) {
    const w = pointerOnPlane(this.cam, x, y, 0, this.tmpV);
    const px = (w.x / PAINT_W + 0.5) * TEX_W, py = (0.5 - w.y / PAINT_H) * TEX_H;
    return { i: this.diorama.pick(px, py), px, py };
  }

  private click() {
    const p = this.fr.pointer, s = store.get();
    if (this.paintingVisible()) {
      const { i } = this.pickAt(p.x, p.y);
      if (i >= 0) {
        const f = this.diorama.flowers[i];
        this.diorama.poke(i);
        const wx = (f.x / TEX_W - 0.5) * PAINT_W, wy = (0.5 - f.y / TEX_H) * PAINT_H;
        this.atmos.burst(new THREE.Vector3(wx, wy, 0.5), this.fr.t, 24, (f.r / 100) * 0.55);
        synth.chord(1 - f.y / TEX_H, (f.x / TEX_W) * 2 - 1);
      }
    } else if (this.mode === 'yellows' && this.discCluster >= 0) {
      store.set({ pinYellow: s.pinYellow === this.discCluster ? -1 : this.discCluster });
      synth.note(this.rank[this.discCluster], this.chroma[this.discCluster], p.x, 1, true);
    }
  }

  /** index into palette.all of the yellow under painting px (or -1) */
  private sampleSwatch(px: number, py: number) {
    const m = this.master;
    const x = Math.floor((px / TEX_W) * m.w), y = Math.floor((py / TEX_H) * m.h);
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return -1;
    const i = (y * m.w + x) * 4;
    return nearestSwatch(this.palette, m.data[i], m.data[i + 1], m.data[i + 2]);
  }

  private setCss(el: HTMLElement, k: string, v: string) {
    let c = this.css.get(el);
    if (!c) { c = {}; this.css.set(el, c); }
    if (c[k] === v) return;
    c[k] = v;
    el.style.setProperty(k, v);
  }

  /** one layout read for all sections, only after something changed size */
  private readGeometry(y: number) {
    for (const n of SECTIONS) {
      const el = this.els[n]; if (!el) continue;
      const r = el.getBoundingClientRect(), g = this.geo[n];
      g.top = r.top + y; g.h = r.height;
    }
    this.docH = document.documentElement.scrollHeight;
    this.geoDirty = false;
  }

  /**
   * Scroll position → each chapter's progress. All reads come first (and from cached geometry), then
   * all style writes, so a scroll step never forces a synchronous style + layout pass.
   */
  private measure() {
    const vh = innerHeight, y = window.scrollY;
    for (const c of this.fx) if (!c.el.isConnected) { this.collectDom(); break; }   // re-mounted (dev / HMR)
    if (this.geoDirty || !this.ro) this.readGeometry(y);
    for (const n of SECTIONS) {
      if (!this.els[n]) continue;
      const g = this.geo[n], s = this.sv[n];
      const rel = (y - g.top) / vh, len = g.h / vh, L = Math.max(0.0001, len - 1);
      this.rel[n] = rel; this.len[n] = len;
      s.p = clamp01(rel / L).toFixed(4);
      s.e = clamp01(rel + 1).toFixed(4);
      s.l = clamp01(rel - L).toFixed(4);
    }
    for (const c of this.fx) {
      const s = this.sv[c.sec];
      for (let i = 0; i < c.vars.length; i++) this.setCss(c.el, c.props[i], s[c.vars[i]]);
    }
    if (this.progress) this.setCss(this.progress, '--scroll', clamp01(y / Math.max(1, this.docH - vh)).toFixed(4));
    const st = this.els.studio;
    if (st) { const g = this.geo.studio, top = g.top - y; this.visible = !(top <= 1 && top + g.h >= vh - 1); }
    let ch = 0;
    for (let i = 0; i < SECTIONS.length; i++) if (this.rel[SECTIONS[i]] >= -0.5) ch = i;
    this.mode = SECTIONS[ch];
    if (ch !== this.lastChapter) { this.lastChapter = ch; store.set({ chapter: ch }); }
  }

  private updateCursor() {
    const c = this.cursor; if (!c) return;
    const p = this.fr.pointer;
    c.style.transform = `translate3d(${p.cx}px, ${p.cy}px, 0)`;
    const st = !p.inside || p.type === 'touch' ? 'off' : this.ptr.overUi ? 'ui' : store.get().raking ? 'rake' : this.hovered >= 0 ? 'flower' : this.swatch >= 0 ? 'loupe' : 'idle';
    if (st !== this.cursorState) { this.cursorState = st; c.dataset.state = st; }
  }

  // ---------------------------------------------------------------- frame
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    // behind the opaque loader there is nothing to see: draw a couple of frames to settle, then
    // idle until the visitor enters, so the gate itself stays perfectly fluid (and cool)
    if (!store.get().entered && ++this.gateFrames > 2) {
      this.gov.idle(now - this.last * 1000);   // meanwhile, learn the display's own frame pace
      this.last = now / 1000;
      return;
    }
    const t = now / 1000;
    const dt = Math.min(0.1, Math.max(0, t - this.last));
    this.last = t;
    this.beforeFrame?.(now);
    this.lenis?.raf(now);
    this.measure();
    const fr = this.fr; fr.t = t; fr.dt = dt;
    const p = fr.pointer;
    const idle = performance.now() - this.lastMove > 3500 || !p.inside;
    let tx = p.x, ty = p.y;
    if (idle) {
      tx = fr.reduced ? 0.25 : Math.sin(t * 0.21) * 0.5 + Math.sin(t * 0.13 + 2) * 0.2;
      ty = fr.reduced ? 0.35 : 0.3 + Math.sin(t * 0.17 + 1.3) * 0.3;
    }
    p.sx = damp(p.sx, tx, idle ? 1.1 : 10, dt);
    p.sy = damp(p.sy, ty, idle ? 1.1 : 10, dt);
    if (this.visible) {
      // choose the resolution before drawing: resizing after would blank the finished frame
      this.adapt(dt, now);
      // ?qa: extra simulation sub-steps per rendered frame so software-rendered test runs settle quickly
      for (let i = 1; i < this.qaSteps; i++) this.direct(1 / 30);
      this.direct(dt);
      this.render();
    } else {
      p.dragX = p.dragY = 0;
    }
    this.updateCursor();
  };

  private direct(dt: number) {
    const fr = this.fr, s = store.get(), p = fr.pointer;
    const rel = this.rel, L = (n: SectionName) => Math.max(0.5, this.len[n] - 1);
    const H = rel.hero, Y = rel.yellows, B = rel.bloom, F = rel.fade, O = rel.outro;
    const LH = L('hero'), LY = L('yellows'), LB = L('bloom'), LF = L('fade');

    if (this.introOn) this.intro = clamp01((performance.now() - this.introAt) / (fr.reduced ? 600 : 2800));   // wall-clock, so slow GPUs don't drag it out
    const intro = easeOut(this.intro);

    // --- choreography (all driven by scroll position, in viewport heights)
    const dolly = easeInOut(seg(H, 0, LH + 0.8));
    const swap = seg(Y, -0.8, -0.25);                       // painting dissolves into its own strokes
    const morph = seg(Y, -0.32, LY * 0.42);                 // strokes fly into the colour-flower
    const collapse = seg(Y, LY * 0.86, LY + 0.62);          // ... and fall into a single seed
    const strokesOn = seg(Y, -0.98, -0.82) * (1 - seg(Y, LY + 0.58, LY + 0.72));
    const appear = seg(B, -0.42, 0.25);                     // the seed becomes a real sunflower
    const flowerOn = seg(B, -0.45, -0.32) * (1 - seg(F, -0.6, -0.2));
    const life = stair(seg(B, 0.06, LB * 0.94), 3);
    const repaint = easeInOut(seg(F, -0.5, 0.15));          // the painting paints itself back in
    const night = seg(O, -0.75, 0.05);                      // candle-lit coda
    const reveal = Math.max(intro * (1 - swap), repaint);
    this.revealNow = reveal;

    // ageing: scroll-driven unless the visitor took the slider
    const autoAge = seg(F, 0.12, LF * 0.82);
    if (s.ageTouched && (F < -1.2 || F > LF + 0.8)) store.set({ ageTouched: false });
    if (!s.ageTouched && F > -1 && F < LF + 0.5 && Math.abs(s.age - autoAge) > 0.0005) store.set({ age: autoAge });
    let age = s.ageTouched ? s.age : autoAge;
    age *= 1 - seg(O, -0.9, -0.2);

    const stage = Math.min(3, Math.round(life)) as Stage;
    if (stage !== this.lastStage) { this.lastStage = stage; store.set({ stage }); }

    // --- camera: walk into the painting, then step back for the colour-flower
    let zT: number;
    if (Y < LY * 0.4) zT = lerp(CAM_D - 3.6 * dolly, CAM_D, seg(Y, -0.3, LY * 0.35)) + (1 - intro) * 1.6;
    else if (O < -0.9) zT = CAM_D - 0.9 * seg(F, 0, LF);
    else zT = CAM_D - 0.9 - 0.7 * night;
    this.camZ = damp(this.camZ, zT, 4.5, dt);
    const flowerFocus = Math.max(seg(Y, -0.3, LY * 0.3) * (1 - seg(F, -0.5, 0)), 0);
    const par = fr.reduced ? 0 : 1 - 0.75 * flowerFocus;
    this.cam.position.set(p.sx * 0.5 * par, p.sy * 0.3 * par, this.camZ);
    this.cam.lookAt(p.sx * 0.1 * par, p.sy * 0.06 * par, 0);
    this.cam.updateMatrixWorld();

    // --- the cursor is the sun of Arles
    const rakeT = Math.max(s.raking ? 1 : 0, night * 0.62);
    this.rake = damp(this.rake, rakeT, 6, dt);
    pointerOnPlane(this.cam, p.sx, p.sy, 0, this.light);
    this.light.z = lerp(3.2, 0.55, this.rake);
    this.diorama.shared.uLight.value.copy(this.light);
    this.lightNdc.set(p.sx, p.sy);

    // --- hover: flowers & the colour loupe (painting), or yellows on the colour-flower
    let hovered = -1, swatch = -1, cluster = -1;
    const fine = p.type !== 'touch';
    if (fine && p.inside && !this.ptr.overUi && !this.ptr.dragging && s.entered) {
      if (reveal > 0.85) {
        const hit = this.pickAt(p.x, p.y);
        hovered = hit.i;
        if (this.mode === 'hero' && H < LH + 0.2) swatch = this.sampleSwatch(hit.px, hit.py);
      } else if (this.mode === 'yellows' && morph > 0.85 && collapse < 0.05) {
        this.ndc.set(p.x, p.y);
        this.ray.setFromCamera(this.ndc, this.cam);
        this.plane.setFromNormalAndCoplanarPoint(this.strokes.normal(this.tmpN), this.strokes.offset);
        const hitP = this.ray.ray.intersectPlane(this.plane, this.tmpV);
        if (hitP) {
          const lp = this.strokes.localPoint(hitP, this.tmpV);
          cluster = this.strokes.clusterAt(lp.x, lp.y);
        }
      }
    }
    if (hovered !== this.hovered) {
      if (hovered >= 0) { const f = this.diorama.flowers[hovered]; synth.note(1 - f.y / TEX_H, 0.7, (f.x / TEX_W) * 2 - 1, 0.55); }
      this.hovered = hovered;
      store.set({ hoverFlower: hovered });
    }
    if (swatch !== this.swatch) {
      this.swatch = swatch;
      if (swatch >= 0) {
        const sw = this.palette.all[swatch];
        synth.note(this.rank[swatch], this.chroma[swatch], p.x, 0.32);
        if (this.cursorLabel) {
          this.cursorLabel.textContent = `${sw.zh} · ${sw.hex.toUpperCase()}`;
          this.cursorLabel.style.setProperty('--sw', sw.hex);
        }
      }
    }
    if (cluster !== this.discCluster) {
      this.discCluster = cluster;
      if (cluster >= 0) {
        synth.note(this.rank[cluster], this.chroma[cluster], p.x, 0.8);
        store.set({ hoverYellow: cluster }); this.discOwnsHover = true;
      } else if (this.discOwnsHover) {
        store.set({ hoverYellow: -1 }); this.discOwnsHover = false;
      }
    }

    // --- drags rotate whichever flower is on stage
    if (p.dragX || p.dragY) {
      if (this.mode === 'yellows' && morph > 0.5) this.strokes.drag(p.dragX * 5, p.dragY * 4);
      else if (this.mode === 'bloom' || flowerOn > 0.5) this.flower.drag(p.dragX * 4, p.dragY * 3);
      p.dragX = p.dragY = 0;
    }

    // --- update scenes
    const hl = s.hoverYellow >= 0 ? s.hoverYellow : s.pinYellow;
    this.diorama.update(fr, hovered, { opacity: 1, reveal, age, raking: rakeT, candles: night, night: easeInOut(night) });
    this.strokes.update(fr, { morph, collapse, opacity: strokesOn, hl: morph > 0.6 && collapse < 0.3 ? hl : -1 });

    const wTeal = seg(B, -0.75, 0.05) * (1 - seg(F, -0.5, 0.1));
    const wBlue = seg(Y, -0.45, LY * 0.25) * (1 - seg(B, -0.75, 0.05));
    const wNight = night;
    const wWarm = Math.max(0, 1 - wBlue - wTeal - wNight);
    this.mixV.set(wWarm, wBlue, wTeal, wNight);
    const halo = Math.max(seg(Y, LY * 0.15, LY * 0.45) * (1 - collapse), wTeal * appear * 0.7);
    this.center.copy(this.discNdc);
    this.backdrop.update(fr, { mix: this.mixV, center: this.center, halo, light: this.lightNdc, visible: reveal < 0.999 });
    this.bdQuad.visible = reveal < 0.999;

    const atm = (1 - 0.3 * wBlue - 0.5 * wTeal) * intro;
    this.atmos.update(fr, this.light, this.lastPixel, atm);
    if (flowerOn > 0.003) this.flower.update(fr, { stageT: life, opacity: flowerOn, spirals: s.spirals, appear, lightNdc: this.lightNdc });
    this.flowerOn = flowerOn;
  }
  private flowerOn = 0;

  private render() {
    const r = this.renderer;
    if (this.bdQuad.visible) {
      r.setRenderTarget(this.bdRT);
      r.render(this.bdScene, this.bdCam);
    }
    r.setRenderTarget(null);
    r.clear(true, true, false);
    r.render(this.scene, this.cam);
    if (this.flowerOn > 0.003) {
      r.clearDepth();
      r.render(this.flower.scene, this.flower.camera);
    }
  }

  /** adaptive resolution: the governor watches real frame times and moves along the DPR grid */
  private adapt(dt: number, now: number) {
    if (this.pinnedDpr || now - this.started < 4000) return;
    const next = this.gov.frame(dt * 1000, now, this.dpr, this.topDpr, this.maxDpr, this.lastChapter);
    if (next) { this.dpr = next; this.resize(); }
  }
}
