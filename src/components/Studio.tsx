import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useStore } from '../store';
import { usePalette } from '../lib/usePalette';
import { synth } from '../audio/Synth';
import { PaintStudio } from '../gl/PaintStudio';
import { CALLIGRAPHY, CH4 } from '../content';
import { coarse } from '../lib/input';
import { useEngine } from '../lib/engineContext';

interface Chip { hex: string; zh: string; en: string; L: number }
const LEAD_WHITE: Chip = { hex: '#f3ede0', zh: '铅白', en: 'Lead White', L: 0.95 };

export function Studio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<PaintStudio | null>(null);
  const info = usePalette();
  const webgl = useStore((s) => s.webgl);
  const [sel, setSel] = useState(3);
  const [size, setSize] = useState(45);
  const [busy, setBusy] = useState(false);

  // one chip per colour family + the blues/greens Van Gogh set against them
  const chips = useMemo<Chip[]>(() => {
    if (!info) return [];
    const seen = new Set<string>(); const out: Chip[] = [];
    [...info.pal.yellows].sort((a, b) => b.L - a.L).forEach((s) => { if (!seen.has(s.zh)) { seen.add(s.zh); out.push(s); } });
    const acc = info.pal.accents.filter((s) => ['普鲁士蓝', '维罗纳绿', '熟赭'].includes(s.zh));
    return [LEAD_WHITE, ...out, ...acc];
  }, [info]);

  // The studio has its own WebGL context. Bring it up in the first quiet moment once the scene is
  // ready — normally while the visitor is still on the gate — or after the intro has played if
  // they entered straight away; immediately if they are already scrolling towards it.
  const ready = useStore((s) => s.ready), entered = useStore((s) => s.entered);
  const engine = useEngine();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (armed || !webgl || !ready) return;
    // creating a context is a blocking call that queues behind whatever the GPU is still drawing
    let alive = true, fired = false;
    const go = () => {
      if (fired) return; fired = true;
      (engine ? engine.idle() : Promise.resolve()).then(() => { if (alive) setArmed(true); });
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let idle = 0;
    const t = window.setTimeout(() => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(go, { timeout: 2000 }); else go();
    }, entered ? 3200 : 250);
    const cv = canvasRef.current;
    const io = cv ? new IntersectionObserver(([e]) => { if (e.isIntersecting) go(); }, { rootMargin: '150% 0px' }) : null;
    if (cv && io) io.observe(cv);
    return () => { alive = false; clearTimeout(t); if (idle) w.cancelIdleCallback?.(idle); io?.disconnect(); };
  }, [armed, webgl, ready, entered, engine]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!info || !webgl || !cv || !armed) return;
    const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 640;
    const st = new PaintStudio(cv, info.pal, mobile);
    studioRef.current = st;
    st.onBrush = (x, y, r, vis) => {
      const el = ringRef.current; if (!el) return;
      el.style.opacity = vis ? '1' : '0';
      el.style.width = el.style.height = `${r * 2}px`;
      el.style.transform = `translate3d(${x - r}px, ${y - r}px, 0)`;
    };
    let io: IntersectionObserver | null = null;
    let alive = true;
    // never compete with the intro: at the gate run right away, after entering wait until it has played
    const quiet = () => new Promise<void>((res) => {
      const s = store.get();
      const wait = s.entered ? Math.max(0, s.enteredAt + 3200 - performance.now()) : 0;
      setTimeout(() => requestAnimationFrame(() => setTimeout(res, 0)), wait);
    });
    quiet().then(() => st.init()).then(() => st.warm(quiet)).then(() => {
      if (!alive) return;
      st.size = 0.045;
      io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { st.start(); if (!st.grown) { st.grow(); setBusy(true); } }
        else st.stop();
      }, { threshold: 0.2 });
      io.observe(cv);
    });
    const poll = setInterval(() => setBusy(st.busy), 400);
    return () => { alive = false; clearInterval(poll); io?.disconnect(); st.dispose(); studioRef.current = null; };
  }, [info, webgl, armed]);

  useEffect(() => { const i = chips.findIndex((c) => c.zh === '铬黄'); if (i >= 0) setSel(i); }, [chips]);
  useEffect(() => { const c = chips[sel]; if (c && studioRef.current) studioRef.current.setSwatch(c.hex); }, [sel, chips]);
  useEffect(() => { if (studioRef.current) studioRef.current.size = size / 1000; }, [size]);
  // auto mode starts each new round of its loop on a clean canvas
  useEffect(() => {
    const clear = () => studioRef.current?.clear();
    addEventListener('sf:studio-clear', clear);
    return () => removeEventListener('sf:studio-clear', clear);
  }, []);

  const pick = (i: number) => { setSel(i); const c = chips[i]; if (c) synth.note(Math.min(1, c.L), 0.6, 0, 0.8, true); };

  return (
    <section data-section="studio" className="relative min-h-svh bg-[#0d2034] text-cream overflow-hidden" aria-labelledby="ch4-title">
      <div className="absolute inset-0 opacity-60 pointer-events-none" aria-hidden="true"
        style={{ background: 'radial-gradient(ellipse at 70% 30%, rgba(52,103,125,0.45), transparent 60%), radial-gradient(ellipse at 10% 90%, rgba(200,134,17,0.18), transparent 55%)' }} />
      <div className="relative mx-auto max-w-[92rem] px-[4vw] py-20 md:py-24 grid gap-8 lg:grid-cols-[22rem_1fr] items-center min-h-svh">
        <div>
          <p className="flex items-baseline gap-3 text-lemon/80">
            <span className="latin text-2xl font-semibold">{CH4.no}</span>
            <span className="latin-italic text-base md:text-lg">{CH4.en}</span>
          </p>
          <h2 id="ch4-title" className="brush text-lemon text-[2.6rem] md:text-[3.4rem] leading-tight mt-1">{CALLIGRAPHY.ch4}</h2>
          <p className="mt-3 text-[14px] md:text-[15px] leading-7 md:leading-8 text-cream/85">{CH4.body}</p>

          <div className="mt-6" role="radiogroup" aria-label="颜料">
            <div className="flex flex-wrap gap-2">
              {chips.map((c, i) => (
                <button key={c.hex + i} role="radio" aria-checked={sel === i} aria-label={`${c.zh} ${c.en}`} title={`${c.zh} · ${c.en}`}
                  onClick={() => pick(i)}
                  className={`w-11 h-11 rounded-full transition-transform duration-300 ${sel === i ? 'scale-110 shadow-[0_0_0_3px_#0d2034,0_0_0_5px_#f2d95a]' : 'hover:scale-105 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]'}`}
                  style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), transparent 45%), ${c.hex}` }} />
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-cream/70 min-h-[1.25rem]">{chips[sel] ? `${chips[sel].zh} · ${chips[sel].en}` : ''}</p>
          </div>

          <label className="mt-4 flex items-center gap-4 text-[13px] text-cream/80">
            <span className="shrink-0">{CH4.size}</span>
            <input className="yellow-range" type="range" min={14} max={95} value={size} onChange={(e) => setSize(+e.target.value)} aria-label="笔触大小" />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary !bg-chrome !text-prussian" disabled={!webgl}
              onClick={() => { studioRef.current?.grow(); setBusy(true); synth.chord(0.6, 0); }}>{busy ? '正在作画…' : CH4.grow}</button>
            <button className="btn btn-ghost !bg-transparent !text-cream !border-cream/30 hover:!bg-white/10" disabled={!webgl}
              onClick={() => studioRef.current?.clear()}>{CH4.clear}</button>
            <button className="btn btn-ghost !bg-transparent !text-cream !border-cream/30 hover:!bg-white/10" disabled={!webgl}
              onClick={() => studioRef.current?.save()}>{CH4.save}</button>
          </div>
        </div>

        <div className="relative">
          <div className="studio-frame mx-auto w-full max-w-[min(100%,calc((100svh-9rem)*1.5))]">
            {webgl ? (
              <div className="relative">
                <canvas ref={canvasRef} className="studio-canvas" data-ui aria-label="颜料画布：拖动作画" />
                <div ref={ringRef} className="brush-ring" aria-hidden="true" />
              </div>
            ) : (
              <div className="studio-canvas grid place-items-center text-umber text-sm">需要 WebGL2 才能作画</div>
            )}
          </div>
          <p className="mt-3 text-center text-[12px] tracking-wider text-cream/55">{CH4.tip} · {coarse ? '侧光跟随你的手指' : '侧光跟随你的光标'}</p>
        </div>
      </div>
    </section>
  );
}
