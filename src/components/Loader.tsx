import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { store, useStore } from '../store';
import { useEngine } from '../lib/engineContext';
import { synth } from '../audio/Synth';
import { AUTO, LOADER } from '../content';
import { autopilot, startPoint } from '../auto/autopilot';
import { SEED_COUNT, bootLoaderHtml } from '../lib/bootLoader';
import { CAPTURE, filmedProgress } from '../lib/capture';

/**
 * The loading screen (markup: lib/bootLoader.ts) is already painted by index.html before any
 * script runs. This component adopts that DOM rather than re-rendering it, then:
 *  · eases the shown progress towards the real, byte-accurate progress, so seeds pop in one by
 *    one at a steady pace instead of in jumps;
 *  · swaps the status line for the two entry buttons once the last seed is in;
 *  · plays the exit (seeds burst outwards while the screen dissolves) and removes the DOM.
 */
/** ?auto (or ?auto=loop): the gate looks just the same, but entering starts the guided tour — for recording */
const AUTO_GATE = typeof location !== 'undefined' && /[?&]auto\b/.test(location.search);

function bootEl() {
  let el = document.getElementById('boot');
  if (!el) {   // e.g. an index.html without the boot markup: create it on the fly
    const host = document.createElement('div');
    host.innerHTML = bootLoaderHtml();
    el = host.firstElementChild as HTMLElement;
    document.body.prepend(el);
  }
  return el;
}

export function Loader() {
  const ready = useStore((s) => s.ready), entered = useStore((s) => s.entered), webgl = useStore((s) => s.webgl);
  const engine = useEngine();
  const [boot] = useState(bootEl);
  const [full, setFull] = useState(false);     // shown progress reached 100 %
  const [gone, setGone] = useState(false);

  // seeds + percentage, driven per frame without React re-renders
  useLayoutEffect(() => {
    const dots = boot.querySelectorAll<SVGCircleElement>('circle.dot');
    const pct = boot.querySelector<HTMLElement>('#boot-pct');
    const reduced = store.get().reducedMotion;
    let shown = 0, disp = 0, last = performance.now(), raf = 0, lastPct = -1;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const s = store.get();
      const film = CAPTURE ? filmedProgress(now) : null;   // ?capture: the recorder's cue, not the wire
      const done = s.ready && film === null;
      const target = done ? 1 : film ?? s.loaded;
      if (reduced) disp = target;
      else if (target > disp) {
        // critically-damped approach with a floor speed: never jumps, never crawls
        const k = done ? 7 : 3.2, floor = done ? 0.9 : 0.035;
        disp = Math.min(target, disp + Math.max((target - disp) * (1 - Math.exp(-k * dt)), floor * dt));
      }
      const n = Math.min(SEED_COUNT, Math.floor(disp * SEED_COUNT + 1e-6));
      for (; shown < n; shown++) dots[shown]?.classList.add('on');
      const p = Math.round(disp * 100);
      if (pct && p !== lastPct) { pct.textContent = `${p}%`; lastPct = p; }
      if (done && disp >= 1) { setFull(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [boot]);

  useEffect(() => {
    if (!full) return;
    boot.querySelector<HTMLElement>('#boot-status')?.setAttribute('hidden', '');
  }, [full, boot]);

  useEffect(() => {
    if (!entered) return;
    boot.classList.add('loader-out');
    const t = setTimeout(() => setGone(true), 1300);
    return () => clearTimeout(t);
  }, [entered, boot]);

  useEffect(() => { if (gone) boot.remove(); }, [gone, boot]);

  // the "A" key starts the tour from the gate (handy when recording: no click needs to be filmed)
  useEffect(() => {
    if (!full || !ready || entered || !engine || !webgl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'a' && e.key !== 'A')) return;
      const r = boot.querySelector('#boot-cta .btn-primary')?.getBoundingClientRect();
      engine.enter(true);
      autopilot.start({ at: r ? [r.left + r.width / 2, r.top + r.height / 2] : undefined });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [full, ready, entered, engine, webgl, boot]);

  if (gone) return null;
  const enter = (sound: boolean, auto = false, at?: [number, number]) => {
    if (engine && webgl) {
      engine.enter(sound);
      if (auto) autopilot.start({ at });
    } else {
      synth.setEnabled(sound);
      store.set({ entered: true, enteredAt: performance.now(), sound });
      document.documentElement.classList.remove('locked');
    }
  };
  const cta = boot.querySelector('#boot-cta'), msg = boot.querySelector('#boot-msg');
  return (
    <>
      {cta && full && ready && createPortal(
        <div className="boot-cta-in relative flex flex-wrap items-center justify-center gap-3">
          <button className="btn btn-primary min-w-[9.5rem]" onClick={(e) => enter(true, AUTO_GATE, startPoint(e))} autoFocus>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>
            {LOADER.enterSound}
          </button>
          <button className="btn btn-ghost min-w-[9.5rem]" onClick={(e) => enter(false, AUTO_GATE, startPoint(e))}>{LOADER.enterMute}</button>
          {/* below the two, out of the flow, so the gate doesn't shift when the buttons arrive */}
          {!AUTO_GATE && engine && webgl && (
            <button className="absolute left-1/2 top-full mt-2 -translate-x-1/2 inline-flex items-center gap-1.5 whitespace-nowrap min-h-10 px-3 rounded-full text-[13px] tracking-wider text-umber/80 hover:text-prussian transition-colors"
              onClick={(e) => enter(true, true, startPoint(e))}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M10 8.4v7.2l5.6-3.6z" fill="currentColor" /></svg>
              {AUTO.gate}
            </button>
          )}
        </div>, cta)}
      {msg && !webgl && createPortal(<p className="mt-4 max-w-md text-sm text-vermilion">{LOADER.noWebgl}</p>, msg)}
    </>
  );
}
