import { store, useStore } from '../store';
import { useEngine } from '../lib/engineContext';
import { synth } from '../audio/Synth';
import { CALLIGRAPHY, CH2 } from '../content';
import { fitTitle } from '../lib/fitTitle';

const fade = 'min(clamp(0, calc(var(--e, 0) * 2.2 - 1.1), 1), clamp(0, calc(1 - var(--l, 0) * 2.6), 1))';
const STAGE_CH = CALLIGRAPHY.stages; // 蓓蕾盛放凋萎结籽

export function Bloom() {
  const stage = useStore((s) => s.stage), spirals = useStore((s) => s.spirals);
  const engine = useEngine();
  const st = CH2.stages[stage];
  const toggleSpirals = () => {
    store.set({ spirals: !spirals });
    if (!spirals) synth.chord(0.75, 0.3);
  };
  return (
    <section data-section="bloom" className="relative h-[450vh]" aria-labelledby="ch2-title">
      <div className="sticky top-0 h-svh overflow-hidden pointer-events-none">
        <article data-ui data-vars="e l" className="@container card pointer-events-auto absolute left-[4vw] right-[4vw] bottom-[10.5rem] md:bottom-auto md:right-auto md:top-1/2 md:-translate-y-1/2 md:w-[25.5rem] p-5 md:p-7"
          style={{ opacity: fade }}>
          <p className="flex items-baseline gap-3 text-prussian/70">
            <span className="latin text-2xl font-semibold">{CH2.no}</span>
            <span className="latin-italic text-base md:text-lg">{CH2.en}</span>
          </p>
          <h2 id="ch2-title" className="brush text-prussian leading-tight mt-1" style={fitTitle(CALLIGRAPHY.ch2, '3.1rem')}>{CALLIGRAPHY.ch2}</h2>
          <p className="mt-3 text-[14px] md:text-[15px] leading-7 md:leading-8 text-umber/90 hidden sm:block">{CH2.body}</p>
          <blockquote className="vg mt-4 text-prussian hidden md:block">
            <p className="text-[15px] leading-7">“{CH2.ng}”</p>
            <footer className="mt-1 text-[12px] text-umber/60">—— {CH2.ngBy}</footer>
          </blockquote>
          <button className={`btn mt-4 md:mt-5 ${spirals ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={spirals} onClick={toggleSpirals}>
            <svg width="18" height="18" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M0 0c2-1 4 1 3 3s-5 3-7 0 0-8 5-8 9 5 7 10" /><path d="M0 0c-2 1-4-1-3-3s5-3 7 0 0 8-5 8-9-5-7-10" opacity="0.6" />
            </svg>
            {spirals ? '隐藏螺线' : CH2.spiral}
          </button>
          {spirals && (
            <p className="mt-3 text-[12.5px] text-umber/80 leading-6">
              <span className="inline-block w-3 h-3 rounded-full align-middle mr-1" style={{ background: '#e8b820' }} />34 条向一侧旋
              <span className="inline-block w-3 h-3 rounded-full align-middle ml-3 mr-1" style={{ background: '#3d8fd1' }} />55 条向另一侧 · 共 987 粒种子
            </p>
          )}
        </article>

        {/* life cycle */}
        <div data-vars="e l" className="absolute inset-x-0 bottom-[max(18px,env(safe-area-inset-bottom))] md:bottom-[5vh] flex flex-col items-center md:items-end md:pr-[3.6vw] gap-2.5" style={{ opacity: fade }}>
          <p className="hidden sm:block max-w-[22rem] text-left text-[13px] md:text-[13.5px] leading-6 text-umber/90 rounded-2xl bg-cream/80 backdrop-blur-sm px-4 py-2.5 shadow-[0_6px_20px_rgba(43,33,18,0.12)]" aria-live="polite">
            <span className="text-prussian font-semibold">{st.zh} · <span className="latin-italic font-normal">{st.en}</span></span><br /><span>{st.text}</span>
          </p>
          <ol data-ui className="pointer-events-auto flex items-stretch gap-1 rounded-full bg-cream/70 px-2 py-1 shadow-[0_6px_20px_rgba(43,33,18,0.12)]" aria-label="生命周期">
            {CH2.stages.map((s, i) => (
              <li key={s.zh}>
                <button onClick={() => engine?.scrollToStage(i)} aria-current={stage === i ? 'step' : undefined}
                  className={`h-11 min-w-[4.2rem] px-3 rounded-full flex items-center justify-center gap-1 transition-colors ${stage === i ? 'bg-prussian text-lemon' : 'text-prussian hover:bg-prussian/10'}`}>
                  <span className="brush text-[1.25rem] leading-none">{STAGE_CH.slice(i * 2, i * 2 + 2)}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="text-[11.5px] tracking-wider text-umber/70 hidden md:block">{CH2.hint}</p>
        </div>
      </div>
    </section>
  );
}
