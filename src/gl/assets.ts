import * as THREE from 'three';

// Shared, byte-accurate asset pipeline for the engine and the paint studio.
//  · every file is fetched once (the HTML <link rel=preload as=fetch> already started it) and
//    streamed, so loading progress moves with every network chunk instead of in 13 jumps;
//  · images are decoded off the main thread (createImageBitmap) into exactly the pixels WebGL
//    would have received from an <img> (no premultiply, no colour conversion, flipped for GL),
//    so the first GPU upload is a plain copy rather than a synchronous re-decode.

const BASE = import.meta.env.BASE_URL + 'assets/';
const SIZES: Record<string, number> = typeof __ASSET_BYTES__ !== 'undefined' ? __ASSET_BYTES__ : {};

// ---------------------------------------------------------------- bytes
const got = new Map<string, number>();       // bytes received per file
const want = new Map<string, number>();      // expected bytes per file
type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const bytes = {
  /** register files up front, so the total is known before the first byte arrives */
  expect(names: string[]) { for (const n of names) if (!want.has(n)) want.set(n, SIZES[n] || 160_000); },
  get fraction() {
    let a = 0, b = 0;
    want.forEach((w, n) => { b += w; a += Math.min(w, got.get(n) || 0); });
    return b ? a / b : 1;
  },
  onChange(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

const blobs = new Map<string, Promise<Blob>>();
export function fetchAsset(name: string): Promise<Blob> {
  let p = blobs.get(name);
  if (p) return p;
  bytes.expect([name]);
  p = (async () => {
    const res = await fetch(BASE + name);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    const len = Number(res.headers.get('content-length')) || 0;
    if (len && !res.headers.get('content-encoding')) want.set(name, len);
    if (!res.body || typeof res.body.getReader !== 'function') {
      const b = await res.blob(); got.set(name, want.get(name)!); emit(); return b;
    }
    const reader = res.body.getReader(); const parts: Uint8Array[] = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); n += value.byteLength; got.set(name, n); emit();
    }
    want.set(name, Math.max(n, 1)); got.set(name, n); emit();
    return new Blob(parts as BlobPart[], { type });
  })();
  blobs.set(name, p);
  p.catch(() => blobs.delete(name));
  return p;
}

// ---------------------------------------------------------------- images
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const safari = /^((?!chrome|android).)*safari/i.test(ua);
const safariV = safari ? Number((ua.match(/Version\/(\d+)/) || [])[1] || 0) : 0;
const firefoxV = Number((ua.match(/Firefox\/(\d+)/) || [])[1] || 0);
// same guard three.js' GLTFLoader uses: older Safari / Firefox ignore some ImageBitmap options
const BITMAPS = typeof createImageBitmap === 'function' && !(safari && safariV < 17) && !(firefoxV && firefoxV < 98);

/** a decoded <img>, without blocking the main thread on the decode */
export async function imageFromBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    if (img.decode) await img.decode();
    else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

export interface TexSource { image: ImageBitmap | HTMLImageElement; flipY: boolean }
const sources = new Map<string, Promise<TexSource>>();

/** GPU-ready pixels for a texture file; decoded once and shared by every WebGL context */
export function textureSource(name: string): Promise<TexSource> {
  let p = sources.get(name);
  if (p) return p;
  p = fetchAsset(name).then(async (blob) => {
    if (BITMAPS) {
      try {
        const image = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        return { image, flipY: false };
      } catch { /* fall back to <img> */ }
    }
    return { image: await imageFromBlob(blob), flipY: true };
  });
  sources.set(name, p);
  p.catch(() => sources.delete(name));
  return p;
}

const images = new Map<string, Promise<HTMLImageElement>>();
/** decoded <img> for CPU-side sampling (2D canvas), exactly as before */
export function imageAsset(name: string) {
  let p = images.get(name);
  if (!p) { p = fetchAsset(name).then(imageFromBlob); images.set(name, p); p.catch(() => images.delete(name)); }
  return p;
}

export interface TexOpts { mip?: boolean; repeat?: boolean; mirror?: boolean; anisotropy?: number }
/** same sampling set-up the scenes have always used (linear data, trilinear + 4× aniso) */
export function makeTexture(src: TexSource, opts: TexOpts = {}) {
  const t = new THREE.Texture(src.image as THREE.Texture['image']);
  t.flipY = src.flipY;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = opts.mip !== false;
  t.minFilter = opts.mip === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = opts.anisotropy ?? 4;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.mirror) t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export async function loadTexture(name: string, opts: TexOpts = {}) {
  return makeTexture(await textureSource(name), opts);
}

/** the scene's textures, in the order they are needed */
export const SCENE_TEXTURES = ['bg.webp', 'mid.webp', 'mid_form.webp', 'table.webp', 'table_form.webp', 'fg.webp',
  'strokes.webp', 'petals.webp', 'seedhead.webp', 'canvas.webp'];

/** start every download + decode as soon as the bundle runs (before React has even rendered) */
export function prefetchScene() {
  bytes.expect([...SCENE_TEXTURES, 'master.webp']);
  imageAsset('master.webp').catch(() => {});
  for (const n of SCENE_TEXTURES) textureSource(n).catch(() => {});
}

export const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));
/** yield to the browser so it can paint (the loader keeps animating between heavy steps) */
export const yieldToPaint = () => new Promise<void>((r) => {
  requestAnimationFrame(() => setTimeout(r, 0));
});

/**
 * Resolves once the GPU process has worked through every command issued so far, without ever
 * blocking this thread: a fence is polled between tasks. Drivers compile and link shaders — and
 * some build whole pipelines on first draw — asynchronously; without this the next query that
 * needs the result (three.js reads a program's uniforms on first use) would stall the page until
 * that backlog is done. Browsers lacking KHR_parallel_shader_compile benefit most.
 */
export function gpuIdle(r: THREE.WebGLRenderer, timeout = 30000): Promise<void> {
  const gl = r.getContext() as WebGL2RenderingContext;
  const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
  if (!sync) return Promise.resolve();
  gl.flush();
  const t0 = performance.now();
  return new Promise<void>((resolve) => {
    const poll = () => {
      if (gl.isContextLost() || performance.now() - t0 > timeout || gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED) {
        if (!gl.isContextLost()) gl.deleteSync(sync);
        resolve();
      } else setTimeout(poll, 8);
    };
    setTimeout(poll, 0);
  });
}
