/**
 * `?capture` — the page is being filmed frame by frame by qa/record.mjs (the demo film):
 *  · the recorder drives the clock itself (performance.now, timers, rAF, CSS animations);
 *  · sound is logged with its timestamps instead of played, then rendered offline into the
 *    film's soundtrack (audio/Synth.ts → renderSession);
 *  · the loader plays its fill on cue (window.__capture.loaderAt) at the pace of a typical
 *    connection, instead of following a local download that has long finished.
 * Nothing else about the site changes.
 */
export const CAPTURE = typeof location !== 'undefined' && /[?&]capture\b/.test(location.search);

declare global { interface Window { __capture?: { loaderAt?: number } } }

/** how long the filmed loader takes to fill (ms) */
export const FILM_LOAD_MS = 3000;

/**
 * Progress of the filmed loader at `now`: bytes stream in quickly at first and taper off
 * (82 %), then the GPU preparation steps tick through (18 %) — the shape of a real visit.
 */
export function filmedProgress(now: number): number | null {
  const at = typeof window !== 'undefined' ? window.__capture?.loaderAt : undefined;
  if (at === undefined) return 0;
  const u = Math.max(0, (now - at) / FILM_LOAD_MS);
  if (u >= 1) return null;                          // done: hand back to the real (finished) state
  return u < 0.8 ? 0.82 * (1 - Math.pow(1 - u / 0.8, 1.7)) : 0.82 + 0.18 * ((u - 0.8) / 0.2);
}
