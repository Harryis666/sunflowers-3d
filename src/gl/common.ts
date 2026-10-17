import * as THREE from 'three';

export const TEX_W = 1536, TEX_H = 1024;
export const PAINT_W = 15.36, PAINT_H = 10.24;   // world units (1 unit = 100 px)
export const CAM_D = 16;

export interface Pointer {
  x: number; y: number;      // NDC -1..1 (y up)
  sx: number; sy: number;    // smoothed
  cx: number; cy: number;    // client px
  down: boolean; downAt: number; type: string; inside: boolean;
  dragX: number; dragY: number; // accumulated drag deltas (consumed by scenes)
}

export interface Frame {
  t: number; dt: number; w: number; h: number; aspect: number; mobile: boolean; reduced: boolean;
  pointer: Pointer;
}

/** Vertical FOV (deg) so the painting frames nicely for any aspect ratio. */
export function framing(aspect: number) {
  let visH: number;
  if (aspect >= 1.5) visH = (PAINT_W * 0.93) / aspect;          // wide: fit width (slight overscan)
  else if (aspect >= 0.8) visH = PAINT_H * 0.93;                 // squarish: fit height, crop sides
  else visH = 10.4 / aspect;                                     // portrait: keep the bouquet, extend wall
  visH = Math.max(visH, 6.2);
  const fov = (2 * Math.atan(visH / 2 / CAM_D) * 180) / Math.PI;
  return { fov, visH, visW: visH * aspect };
}

export function loadTex(loader: THREE.TextureLoader, url: string, opts: { mip?: boolean; repeat?: boolean; mirror?: boolean } = {}) {
  return new Promise<THREE.Texture>((res, rej) => {
    loader.load(url, (t) => {
      t.colorSpace = THREE.NoColorSpace;
      t.generateMipmaps = opts.mip !== false;
      t.minFilter = opts.mip === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 4;
      if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (opts.mirror) t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
      t.needsUpdate = true;
      res(t);
    }, undefined, rej);
  });
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Intersect the pointer ray with the plane z = zPlane (world). */
export function pointerOnPlane(camera: THREE.PerspectiveCamera, ndcX: number, ndcY: number, zPlane: number, out = new THREE.Vector3()) {
  const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
  const dir = v.sub(camera.position).normalize();
  const t = (zPlane - camera.position.z) / dir.z;
  return out.copy(camera.position).addScaledVector(dir, t);
}
