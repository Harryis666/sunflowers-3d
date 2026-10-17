import { store, useStore } from '../store';
import { usePalette } from '../lib/usePalette';
import { useEngine } from '../lib/engineContext';
import { synth } from '../audio/Synth';
import { CALLIGRAPHY, CH1 } from '../content';
import { fitTitle } from '../lib/fitTitle';
import { coarse } from '../lib/input';

const fade = 'min(clamp(0, calc(var(--e, 0) * 2.2 - 1.1), 1), clamp(0, calc(1 - var(--l, 0) * 2.6), 1))';
const railFade = 'min(clamp(0, calc((var(--p, 0) - 0.1) * 7), 1), clamp(0, calc(1 - var(--l, 0) * 3), 1))';

export function Yellows() {
  const info = usePalette();
  const hover = useStore((s) => s.hoverYellow), pin = useStore((s) => s.pinYellow);
  const engine = useEngine();
  useStore((s) => s.ready);   // re-render once the stroke field exists (real stroke count)
  const active = hover >= 0 ? hover : pin;
  const sw = info && active >= 0 ? info.pal.all[active] : null;
  const strokes = engine?.strokes?.N ?? 60000;

  const play = (i: number) => { if (info) synth.note(info.rank[i], info.chroma[i], (i / info.pal.all.length) * 2 - 1, 0.9, true); };
  const enter = (i: number) => { store.set({ hoverYellow: i }); play(i); };
  const leave = () => store.set({ hoverYellow: -1 });
  const toggle = (i: number) => { store.set({ pinYellow: pin === i ? -1 : i }); play(i); };

  return (
    <section data-section="yellows" className="relative h-[430vh]" aria-labelledby="ch1-title">
      <div className="sticky top-0 h-svh overflow-hidden pointer-events-none">
        <article data-ui data-vars="e l" className="@container card-dark pointer-events-auto absolute left-[4vw] right-[4vw] bottom-[13.5rem] md:bottom-auto md:right-auto md:top-1/2 md:-translate-y-1/2 md:w-[25.5rem] p-5 md:p-7"
          style={{ opacity: fade }}>
          <p className="flex items-baseline gap-3 text-lemon/80">
            <span className="latin text-2xl font-semibold">{CH1.no}</span>
            <span className="latin-italic text-base md:text-lg">{CH1.en}</span>
          </p>
          <h2 id="ch1-title" className="brush text-lemon leading-tight mt-1" style={fitTitle(CALLIGRAPHY.ch1, '3.4rem')}>{CALLIGRAPHY.ch1}</h2>
          <p className="mt-3 text-[14px] md:text-[15px] leading-7 md:leading-8 text-cream/90">{CH1.body}</p>
          <blockquote className="vg mt-4 text-lemon/90 hidden sm:block">
            <p className="text-[15px] leading-7">{CH1.quote}</p>
            <footer className="mt-1 text-[12px] text-cream/60">{CH1.quoteBy}</footer>
          </blockquote>
          <p className="hidden md:block mt-5 pt-4 border-t border-cream/15 text-[12px] leading-5 text-cream/65 latin tabular-nums">
            {info ? info.pal.yellows.length : 33} 种黄 · 共占画面 {info ? (info.pal.yellow_share * 100).toFixed(1) : '90.2'}% 的像素<br />
            11 个色族 · {strokes.toLocaleString('en-US')} 笔真实笔触
          </p>
        </article>

        {/* the 33 yellows (+ 8 accents) measured from the painting */}
        <div data-vars="p l" className="absolute inset-x-0 bottom-0 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 px-[4vw] md:pr-[7vw]" style={{ opacity: railFade }}>
          <div data-ui className="pointer-events-auto flex items-end justify-between gap-4 mb-3 text-cream min-h-[3.4rem]">
            {sw ? (
              <div className="flex items-center gap-3" aria-live="polite">
                <span className="w-10 h-10 rounded-full shrink-0 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.25)]" style={{ background: sw.hex }} />
                <div className="leading-tight">
                  <p className="text-[15px] font-semibold">{sw.zh}{sw.n ? <span className="latin text-lemon/80"> {toRoman(sw.n)}</span> : null}
                    <span className="latin-italic text-cream/70 font-normal"> · {sw.en}</span></p>
                  <p className="latin text-[12px] text-cream/70 tabular-nums">{sw.hex.toUpperCase()} · L {sw.L.toFixed(2)} C {sw.C.toFixed(2)} h {Math.round(sw.h)}° · 占画面 {(sw.share * 100).toFixed(2)}%</p>
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] md:text-[13px] text-cream/80 tracking-wide">{coarse ? CH1.hintTouch : CH1.hint}</p>
            )}
          </div>
          {/* the hover is released when the pointer leaves the rail, not each chip — sweeping across
              the rail would otherwise flash the hint in every gap between two chips */}
          <div data-ui className="pointer-events-auto flex items-end gap-[3px] md:gap-1 overflow-x-auto no-scrollbar pt-4" role="group" aria-label="三十三种黄"
            onPointerLeave={leave}>
            {info?.pal.all.map((s, i) => (
              <button key={s.id} className={`chip ${s.kind === 'accent' && info.pal.all[i - 1]?.kind === 'yellow' ? 'ml-3 md:ml-5' : ''}`}
                style={{ backgroundColor: s.hex, flexGrow: s.kind === 'accent' ? 0.6 : 1 }}
                data-active={active === i} aria-pressed={pin === i}
                aria-label={`${s.zh} ${s.en} ${s.hex}`}
                onPointerEnter={(e) => { if (e.pointerType !== 'touch') enter(i); }}
                onFocus={() => enter(i)} onBlur={leave} onClick={() => toggle(i)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function toRoman(n: number) {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n] ?? String(n);
}
