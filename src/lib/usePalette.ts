import { useEffect, useState } from 'react';
import { sharedPalette, type Palette } from './palette';

export interface PaletteInfo { pal: Palette; rank: Float32Array; chroma: Float32Array; }
let cache: Promise<PaletteInfo> | null = null;

function load() {
  return sharedPalette().then((pal) => {
    const order = pal.all.map((s, i) => ({ i, L: s.L })).sort((a, b) => a.L - b.L);
    const rank = new Float32Array(pal.all.length);
    order.forEach((o, k) => { rank[o.i] = k / (order.length - 1); });
    const maxC = Math.max(...pal.all.map((s) => s.C));
    return { pal, rank, chroma: Float32Array.from(pal.all.map((s) => s.C / maxC)) };
  });
}

/** palette.json is shared by the UI (rail, studio chips) and the engine; fetched once */
export function usePalette() {
  const [p, setP] = useState<PaletteInfo | null>(null);
  useEffect(() => {
    let alive = true;
    (cache ??= load()).then((v) => { if (alive) setP(v); }).catch(() => { cache = null; });
    return () => { alive = false; };
  }, []);
  return p;
}
