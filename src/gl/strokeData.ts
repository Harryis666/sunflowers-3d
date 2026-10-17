// Pure stroke-field maths (no DOM, no three.js): runs in a Web Worker so the loader never
// stalls while 48 000 brush strokes are read off the painting and laid out as a sunflower.
import { nearestSwatch, type Palette } from '../lib/palette';

export const STROKE_R = 4.35, STROKE_GRID = 128;

export interface StrokeInput {
  px: Uint8ClampedArray; W: number; H: number;   // the painting, RGBA, W×H
  pal: Pick<Palette, 'all' | 'lab'>;
  N: number; R: number; gridN: number;
  PW: number; PH: number;                         // painting size in world units
}
export interface StrokeData {
  N: number;
  pos: Float32Array; col: Float32Array; d: Float32Array; aS: Float32Array;   // already in draw order
  aB: Float32Array; aT: Float32Array;
  grid: Int16Array; gridR: number;
}

const GA = Math.PI * (3 - Math.sqrt(5));   // golden angle

/** cheap deterministic PRNG so the flower is identical on every visit */
export function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lay the strokes out as a painted sunflower (disc-local units, petal tips ≈ 1.8 R):
 *  · the darkest 40 % become the seed-disc — a Vogel spiral of seed "rosettes", each a small swirl
 *    of dabs (dark rim, light core), domed towards the viewer; the parastichy spirals emerge by themselves;
 *  · the lighter 60 % become two whorls of ray-florets (21 behind, 13 in front), brushed along each
 *    petal's bent centre-line, curling back in depth and swaying.
 * rankLum: luminance of each stroke in draw (rank) order.
 */
export function layoutFlower(N: number, R: number, rankLum: Float32Array, rand: () => number) {
  const B = new Float32Array(N * 4), T = new Float32Array(N * 4);
  const Rd = R * 0.85;
  const nDisc = Math.round(N * 0.4);
  const S = N >= 36000 ? 377 : 233;
  const sp = Rd * Math.sqrt(Math.PI / S);
  const dome = (r: number) => 0.55 * (1 - (r / Rd) ** 2);
  const outerR = R * 1.8;

  // --- disc: jittered radial order, so every seed mixes a few neighbouring lightnesses
  const disc = Array.from({ length: nDisc }, (_, r) => ({ r, k: r / nDisc + (rand() - 0.5) * 0.28 })).sort((a, b) => a.k - b.k);
  let cursor = 0;
  for (let s = 0; s < S; s++) {
    const n = Math.floor(((s + 1) * nDisc) / S) - Math.floor((s * nDisc) / S);
    const group = disc.slice(cursor, cursor + n).map((o) => o.r).sort((a, b) => rankLum[a] - rankLum[b]);
    cursor += n;
    const rho = Rd * Math.sqrt((s + 0.5) / S) * 0.97, th = s * GA;
    const cx = rho * Math.cos(th), cy = rho * Math.sin(th);
    const small = 0.72 + 0.28 * (rho / Rd);            // florets are finer towards the eye of the flower
    group.forEach((r, j) => {
      const t = 1 - (j + 0.5) / n;                      // 1 = darkest (rim of the seed) … 0 = lightest (core)
      const off = sp * 0.56 * Math.sqrt(t) * small, phi = j * GA + s * 1.3;
      B[r * 4] = cx + off * Math.cos(phi); B[r * 4 + 1] = cy + off * Math.sin(phi);
      B[r * 4 + 2] = dome(rho) + (1 - t) * 0.06;
      B[r * 4 + 3] = rho / outerR;
      T[r * 4] = phi + Math.PI / 2 + (rand() - 0.5) * 0.35;  // tangential → each seed is a little swirl
      T[r * 4 + 1] = (0.5 + 0.32 * t) * small * (0.88 + rand() * 0.24);
      T[r * 4 + 2] = 0; T[r * 4 + 3] = 0;
    });
  }

  // --- petals: inverse CDF of the width profile so strokes fill each petal evenly
  const prof = (u: number) => Math.pow(u, 0.38) * Math.pow(1 - u, 0.62) / 0.53;
  const cdf = new Float32Array(257); for (let i = 1; i <= 256; i++) cdf[i] = cdf[i - 1] + prof((i - 0.5) / 256);
  for (let i = 0; i <= 256; i++) cdf[i] /= cdf[256];
  const inv = (q: number) => { let lo = 0, hi = 256; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cdf[m] < q) lo = m; else hi = m; } return (lo + (q - cdf[lo]) / Math.max(1e-6, cdf[hi] - cdf[lo])) / 256; };

  const rings = [
    { n: 21, share: 0.62, L: R * 0.92, W: R * 0.30, z0: -0.18, droop: 1.25, off: 0 },
    { n: 13, share: 0.38, L: R * 0.70, W: R * 0.26, z0: 0.06, droop: 0.65, off: 0.5 },
  ];
  type Petal = { a: number; L: number; W: number; bend: number; wave: number; ph: number; z0: number; droop: number; rows: number[] };
  const petals: Petal[] = [];
  rings.forEach((g) => {
    for (let k = 0; k < g.n; k++) petals.push({
      a: ((k + g.off + (rand() - 0.5) * 0.35) / g.n) * Math.PI * 2,
      L: g.L * (0.84 + rand() * 0.28), W: g.W * (0.85 + rand() * 0.3),
      bend: 0.05 + (rand() - 0.5) * 0.22,               // a common lean → a pinwheel, a "jumping" sun
      wave: (rand() - 0.5) * 0.12, ph: rand() * 6.283,
      z0: g.z0, droop: g.droop * (0.75 + rand() * 0.5), rows: [],
    });
  });
  const nP = N - nDisc;
  const pool = Array.from({ length: nP }, (_, i) => ({ r: nDisc + i, k: i / nP + (rand() - 0.5) * 0.3 })).sort((a, b) => a.k - b.k);
  const cut = Math.round(nP * rings[0].share);
  pool.forEach((o, m) => {
    const ring = m < cut ? 0 : 1, mm = ring ? m - cut : m;
    petals[(ring ? rings[0].n : 0) + (mm % rings[ring].n)].rows.push(o.r);
  });
  const rho0 = Rd * 0.93;
  petals.forEach((pt) => {
    pt.rows.sort((a, b) => rankLum[a] - rankLum[b]);
    const n = pt.rows.length;
    const ca = Math.cos(pt.a), sa = Math.sin(pt.a);
    pt.rows.forEach((r, j) => {
      const jn = (j + 0.5) / n;
      const u = Math.max(0.004, Math.min(0.996, inv(Math.min(1, Math.max(0, jn + (rand() - 0.5) * 0.55)))));
      const v = (rand() * 2 - 1);
      const lat = pt.bend * u * u * pt.L + pt.wave * pt.L * Math.sin(u * 4.2 + pt.ph);
      const dLat = 2 * pt.bend * u * pt.L + pt.wave * pt.L * 4.2 * Math.cos(u * 4.2 + pt.ph);
      // centre-line in the petal frame (x along the ray, y across), then its tangent/normal
      const px = rho0 + u * pt.L, py = lat;
      const tx = pt.L, ty = dLat, tl = Math.hypot(tx, ty);
      const nx = -ty / tl, ny = tx / tl;
      const w = prof(u) * pt.W * 0.5 * v;
      const lx = px + nx * w, ly = py + ny * w;
      B[r * 4] = lx * ca - ly * sa; B[r * 4 + 1] = lx * sa + ly * ca;
      B[r * 4 + 2] = pt.z0 + dome(Rd) - pt.droop * u * u + (rand() - 0.5) * 0.05;
      B[r * 4 + 3] = (rho0 + u * pt.L) / outerR;
      T[r * 4] = pt.a + Math.atan2(ty, tx) + v * 0.16 * (1 - u) + (rand() - 0.5) * 0.18;
      T[r * 4 + 1] = (0.92 + 0.42 * prof(u)) * (0.85 + rand() * 0.3);
      T[r * 4 + 2] = u; T[r * 4 + 3] = pt.ph;
    });
  });
  return { B, T };
}

export function computeStrokes({ px, W, H, pal, N, R, gridN, PW, PH }: StrokeInput): StrokeData {
  const Y = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) Y[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  // structure tensor -> local brush direction
  const Jxx = new Float32Array(W * H), Jxy = new Float32Array(W * H), Jyy = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = (Y[i - W + 1] + 2 * Y[i + 1] + Y[i + W + 1]) - (Y[i - W - 1] + 2 * Y[i - 1] + Y[i + W - 1]);
    const gy = (Y[i + W - 1] + 2 * Y[i + W] + Y[i + W + 1]) - (Y[i - W - 1] + 2 * Y[i - W] + Y[i - W + 1]);
    Jxx[i] = gx * gx; Jxy[i] = gx * gy; Jyy[i] = gy * gy;
  }
  const blur = (a: Float32Array, r: number) => {
    const tmp = new Float32Array(W * H);
    for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) { tmp[y * W + x] = s / (2 * r + 1); s += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; } }
    for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  };
  blur(Jxx, 5); blur(Jxy, 5); blur(Jyy, 5);

  const cols = Math.round(Math.sqrt(N * (W / H))), rows = Math.round(N / cols);
  N = cols * rows;
  const pos = new Float32Array(N * 2), col = new Float32Array(N * 3), d = new Float32Array(N * 4), clus = new Uint8Array(N), lum = new Float32Array(N);
  let k = 0;
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++, k++) {
    const fx = (gx + Math.random()) / cols * W, fy = (gy + Math.random()) / rows * H;
    const x = Math.min(W - 1, fx | 0), y = Math.min(H - 1, fy | 0), i = y * W + x;
    pos[k * 2] = (fx / W - 0.5) * PW; pos[k * 2 + 1] = (0.5 - fy / H) * PH;
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    col[k * 3] = r / 255; col[k * 3 + 1] = g / 255; col[k * 3 + 2] = b / 255;
    const a = Jxx[i], c2 = Jxy[i], e2 = Jyy[i];
    const theta = 0.5 * Math.atan2(2 * c2, a - e2);           // gradient orientation (image y down)
    const strokeDir = -(theta + Math.PI / 2);                 // perpendicular, flipped for GL y-up
    const energy = Math.sqrt(a + e2);
    const detail = Math.min(1, Math.max(0, (energy - 0.05) / 0.35));
    d[k * 4] = strokeDir + (Math.random() - 0.5) * 0.25;
    d[k * 4 + 1] = (0.105 - 0.045 * detail) * (0.85 + Math.random() * 0.3);
    d[k * 4 + 2] = Math.floor(Math.random() * 15);
    d[k * 4 + 3] = Math.random();
    clus[k] = nearestSwatch(pal, r, g, b);
    lum[k] = Y[i];
  }
  // order clusters dark -> light, then particles by luminance within each cluster
  const order = pal.all.map((s, i) => ({ i, L: s.L })).sort((p, q) => p.L - q.L).map((o) => o.i);
  const rankOf = new Map(order.map((ci, r) => [ci, r]));
  const idx = Array.from({ length: N }, (_, i) => i).sort((p, q) => (rankOf.get(clus[p])! - rankOf.get(clus[q])!) || (lum[p] - lum[q]));
  const aS = new Float32Array(N * 2);
  idx.forEach((p, rank) => { aS[p * 2] = rank; aS[p * 2 + 1] = clus[p]; });
  // draw dark strokes first, like an underpainting
  const sorted = (src: Float32Array, n: number) => { const out = new Float32Array(src.length); idx.forEach((p, r) => { for (let j = 0; j < n; j++) out[r * n + j] = src[p * n + j]; }); return out; };

  // lay the (rank-ordered) strokes out as a sunflower
  const rankLum = new Float32Array(N); idx.forEach((p, rank) => { rankLum[rank] = lum[p]; });
  const { B: aB, T: aT } = layoutFlower(N, R, rankLum, mulberry(1888));
  const gridR = R * 1.9;
  const grid = new Int16Array(gridN * gridN).fill(-1);
  idx.forEach((p, rank) => {   // draw order → the last (lightest) stroke in a cell is the visible one
    const gx = Math.floor((aB[rank * 4] / (2 * gridR) + 0.5) * gridN), gy = Math.floor((aB[rank * 4 + 1] / (2 * gridR) + 0.5) * gridN);
    if (gx >= 0 && gy >= 0 && gx < gridN && gy < gridN) grid[gy * gridN + gx] = clus[p];
  });
  return { N, pos: sorted(pos, 2), col: sorted(col, 3), d: sorted(d, 4), aS: sorted(aS, 2), aB, aT, grid, gridR };
}
