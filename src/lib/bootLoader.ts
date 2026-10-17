// The loading screen is itself a sunflower: 233 seeds placed by Vogel's model (137.5°),
// filled in from the dark heart outwards as the yellows are "mixed".
//
// Its markup is generated here once and written straight into index.html at build time
// (see vite.config.ts), so the very first paint — before any JavaScript has arrived — is
// already the finished loader. React then adopts this DOM (components/Loader.tsx) instead
// of re-creating it, so nothing flickers or restarts when the app takes over.
// Pure module: no DOM access, importable from the Vite config.
import { CALLIGRAPHY, LOADER } from '../content';

export const SEED_COUNT = 233;
const GA = Math.PI * (3 - Math.sqrt(5));
const SEEDS = ['#3d2a10', '#4a2f12', '#5c3a14', '#4d4a22', '#6b5a1e', '#6b4316'];
const PETALS = ['#9b4811', '#b8621c', '#c88611', '#e09a12', '#f0b419', '#f2c53d', '#f2d95a', '#f6e488'];

export function seedDots() {
  return Array.from({ length: SEED_COUNT }, (_, k) => {
    const i = k + 1, f = i / SEED_COUNT, r = 6.1 * Math.sqrt(i), th = i * GA;
    const c = f < 0.62 ? SEEDS[(i * 7) % SEEDS.length] : PETALS[Math.min(PETALS.length - 1, Math.floor(((f - 0.62) / 0.38) * PETALS.length + ((i * 3) % 2)))];
    return { x: r * Math.cos(th), y: r * Math.sin(th), r: f < 0.62 ? 2.3 + f * 1.6 : 3.4 + (f - 0.62) * 2.5, c };
  });
}

/** Static loader markup (ids are the hooks React uses to take it over). */
export function bootLoaderHtml() {
  const dots = seedDots().map((d) => `<circle class="dot" cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${d.r.toFixed(2)}" fill="${d.c}"/>`).join('');
  return `<div id="boot" class="loader fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center" role="dialog" aria-modal="true" aria-label="向日葵 · 加载中" data-ui>
      <div class="burst"><svg viewBox="-104 -104 208 208" class="sunburst w-[min(62vw,40vh)] h-[min(62vw,40vh)]" aria-hidden="true">${dots}</svg></div>
      <h1 class="brush mt-6 text-prussian text-[clamp(3rem,9vh,5.5rem)] leading-none">${CALLIGRAPHY.title}</h1>
      <p class="latin-italic mt-2 text-prussian/80 text-lg">Sunflowers — a symphony in yellow</p>
      <div id="boot-cta" class="mt-8 min-h-[52px] flex items-center justify-center">
        <p id="boot-status" class="text-sm tracking-widest text-umber/80" aria-live="polite">${LOADER.mixing} · <span id="boot-pct" class="latin tabular-nums">0%</span></p>
      </div>
      <div id="boot-msg"></div>
      <p class="smallcaps absolute bottom-6 inset-x-0 text-umber/50 !text-[10px]">Vincent van Gogh · Arles · 1888 — an interactive homage</p>
    </div>`;
}
