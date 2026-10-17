export interface Swatch {
  id: string; kind: 'yellow' | 'accent'; hex: string; L: number; C: number; h: number;
  share: number; zh: string; en: string; n?: number;
}
export interface Palette { yellows: Swatch[]; accents: Swatch[]; yellow_share: number; all: Swatch[]; lab: Float32Array }

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const toLin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export async function loadPalette(url: string): Promise<Palette> {
  const p = await (await fetch(url)).json();
  const all: Swatch[] = [...p.yellows, ...p.accents];
  const lab = new Float32Array(all.length * 3);
  all.forEach((s, i) => {
    const [r, g, b] = hexToRgb(s.hex);
    const o = rgbToOklab(r, g, b);
    lab[i * 3] = o[0]; lab[i * 3 + 1] = o[1]; lab[i * 3 + 2] = o[2];
  });
  return { yellows: p.yellows, accents: p.accents, yellow_share: p.yellow_share, all, lab };
}

/** Index (into palette.all) of the perceptually nearest swatch. */
export function nearestSwatch(pal: Pick<Palette, 'all' | 'lab'>, r: number, g: number, b: number): number {
  const [L, A, B] = rgbToOklab(r, g, b);
  let best = 0, bd = 1e9;
  for (let i = 0; i < pal.all.length; i++) {
    const dl = (L - pal.lab[i * 3]) * 1.6, da = A - pal.lab[i * 3 + 1], db = B - pal.lab[i * 3 + 2];
    const d = dl * dl + da * da + db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

let shared: Promise<Palette> | null = null;
/** palette.json is used by the engine and the UI (rail, studio chips): fetch and parse it once */
export function sharedPalette() {
  shared ??= loadPalette(import.meta.env.BASE_URL + 'assets/palette.json');
  shared.catch(() => { shared = null; });
  return shared;
}
