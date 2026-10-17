import { store, useStore } from '../store';
import { ageToYear } from '../gl/Engine';
import { CALLIGRAPHY, CH3 } from '../content';
import { fitTitle } from '../lib/fitTitle';
import { coarse } from '../lib/input';

const fade = 'min(clamp(0, calc(var(--e, 0) * 2.2 - 1.2), 1), clamp(0, calc(1 - var(--l, 0) * 2.6), 1))';

export function Fade() {
  const age = useStore((s) => s.age), touched = useStore((s) => s.ageTouched);
  const year = ageToYear(age);
  const label = year <= 1892 ? CH3.marks[0].t : year >= 2016 && year <= 2036 ? CH3.marks[1].t : year >= 2140 ? CH3.marks[2].t : '';
  return (
    <section data-section="fade" className="relative h-[330vh]" aria-labelledby="ch3-title">
      <div className="sticky top-0 h-svh overflow-hidden pointer-events-none">
        <article data-ui data-vars="e l" className="@container card pointer-events-auto absolute left-[4vw] right-[4vw] top-[4.5rem] md:top-1/2 md:-translate-y-1/2 md:right-auto md:w-[25.5rem] p-5 md:p-7"
          style={{ opacity: fade }}>
          <p className="flex items-baseline gap-3 text-prussian/70">
            <span className="latin text-2xl font-semibold">{CH3.no}</span>
            <span className="latin-italic text-base md:text-lg">{CH3.en}</span>
          </p>
          <h2 id="ch3-title" className="brush text-prussian leading-tight mt-1" style={fitTitle(CALLIGRAPHY.ch3, '2.9rem')}>{CALLIGRAPHY.ch3}</h2>
          <p className="mt-3 text-[13.5px] md:text-[15px] leading-7 md:leading-8 text-umber/90 hidden sm:block">{CH3.body}</p>
          <blockquote className="vg mt-4 text-prussian">
            <p className="text-[15px] leading-7">{CH3.quote}</p>
            <footer className="mt-1 text-[12px] text-umber/60">{CH3.quoteBy}</footer>
          </blockquote>
          <p className="mt-4 text-[11.5px] leading-5 text-umber/60 hidden md:block">{CH3.note}</p>
        </article>

        {/* time machine */}
        <div data-ui data-vars="e l" className="card pointer-events-auto absolute left-[4vw] right-[4vw] bottom-[max(16px,env(safe-area-inset-bottom))] md:left-auto md:right-[8vw] md:bottom-[7vh] md:w-[24rem] px-5 pt-4 pb-3"
          style={{ opacity: fade }}>
          <div className="flex items-end justify-between gap-3">
            <p className="latin text-prussian leading-none tabular-nums text-[3.4rem] md:text-[4.6rem] font-light" aria-live="polite">{year}</p>
            <div className="text-right pb-2">
              <p className="text-[13px] font-semibold text-vermilion min-h-[1.2em]">{label}</p>
              <p className="text-[12px] text-umber/70">距完成 {year - 1888} 年</p>
            </div>
          </div>
          <label className="sr-only" htmlFor="age">时间</label>
          <input id="age" className="yellow-range mt-1" type="range" min={0} max={1000} step={1} value={Math.round(age * 1000)}
            onChange={(e) => store.set({ age: +e.target.value / 1000, ageTouched: true })} aria-valuetext={`${year} 年`} />
          <div className="relative h-5 text-[11px] text-umber/70 latin tabular-nums">
            <span className="absolute left-0">1888</span>
            <span className="absolute left-[55%] -translate-x-1/2">2026</span>
            <span className="absolute right-0">2150</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[11.5px] text-umber/60">{coarse ? '长按画面：用侧光看颜料' : '按住画面：用侧光看颜料'}</p>
            {touched && <button className="text-[12px] text-prussian underline underline-offset-4 min-h-11 px-1" onClick={() => store.set({ ageTouched: false })}>随滚动自动</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
