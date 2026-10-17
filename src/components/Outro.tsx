import { useEngine } from '../lib/engineContext';
import { AUTO, CALLIGRAPHY, OUTRO, SOURCES } from '../content';
import { autopilot, startPoint } from '../auto/autopilot';
import { fitTitle } from '../lib/fitTitle';

const LINKS: Array<[string, string]> = [
  ['英国国家美术馆 · Sunflowers (1888)', SOURCES.ng],
  ['梵高书信 666 · 致提奥', SOURCES.let666],
  ['梵高书信 743 · 致提奥', SOURCES.let743],
  ['梵高书信 765 · 致提奥', SOURCES.let765],
  ['梵高书信 806 · 致提奥', SOURCES.let806],
  ['npj Heritage Science, 2021', SOURCES.npj],
  ['Monico 等, Angew. Chem. 2015', SOURCES.monico],
  ['Vanmeert 等, 2018（C&EN 报道）', SOURCES.vanmeert],
];

export function Outro() {
  const engine = useEngine();
  return (
    <section data-section="outro" className="relative min-h-[190vh] text-cream" aria-labelledby="outro-title">
      <div className="relative px-[6vw] pt-[78vh] pb-24 flex flex-col items-center text-center">
        {/* a soft night-blue scrim so the words stay legible over the candle-lit painting */}
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[68vh] -translate-x-1/2 w-[min(66rem,124vw)] h-[40rem]"
          style={{ background: 'radial-gradient(closest-side, rgba(7,13,30,0.74), rgba(7,13,30,0.46) 60%, transparent)' }} />
        <h2 id="outro-title" className="relative brush text-lemon leading-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)]" style={fitTitle(CALLIGRAPHY.outro, '4.2rem', '88vw')}>{CALLIGRAPHY.outro}</h2>
        <blockquote className="relative mt-8 max-w-[44rem]">
          <p className="text-[16px] md:text-[20px] leading-9 md:leading-[2.6rem] text-cream/95 drop-shadow-[0_1px_12px_rgba(0,0,0,0.8)]">{OUTRO.quote}</p>
          <footer className="mt-3 text-[12.5px] text-cream/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">{OUTRO.quoteBy}</footer>
        </blockquote>
        <blockquote className="relative mt-10 max-w-[40rem]">
          <p className="latin-italic text-[15px] md:text-[17px] text-lemon drop-shadow-[0_1px_10px_rgba(0,0,0,0.9)]">{OUTRO.quote2}</p>
          <footer className="mt-2 text-[12px] text-cream/75 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">{OUTRO.quote2By}</footer>
        </blockquote>

        <div data-ui className="card-dark mt-16 w-full max-w-[52rem] text-left p-6 md:p-8">
          <h3 className="smallcaps text-lemon/80 !text-[11px]">Credits · 说明</h3>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-cream/85">
            {OUTRO.credits.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <h3 className="smallcaps text-lemon/80 !text-[11px] mt-6">Sources · 资料来源</h3>
          <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 text-[13px]">
            {LINKS.map(([t, u]) => (
              <li key={u}><a className="inline-flex items-center min-h-11 text-cream/85 underline decoration-lemon/40 underline-offset-4 hover:text-lemon" href={u} target="_blank" rel="noreferrer">{t}</a></li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary !bg-chrome !text-prussian" onClick={() => engine ? engine.scrollTo('hero') : window.scrollTo({ top: 0, behavior: 'smooth' })}>{OUTRO.again}</button>
              {engine && (
                <button className="btn btn-ghost !bg-transparent !text-cream !border-cream/30 hover:!bg-white/10" onClick={(e) => autopilot.start({ at: startPoint(e) })}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M10 8.4v7.2l5.6-3.6z" fill="currentColor" /></svg>
                  {AUTO.start}
                </button>
              )}
            </div>
            <p className="text-[12px] text-cream/55 latin">Harry Li × Notion AI · 2026</p>
          </div>
        </div>
      </div>
    </section>
  );
}
