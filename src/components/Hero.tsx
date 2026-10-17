import { useStore } from '../store';
import { CALLIGRAPHY, HERO } from '../content';
import { coarse } from '../lib/input';

export function Hero() {
  const entered = useStore((s) => s.entered);
  const hints = coarse ? HERO.hintsTouch : HERO.hints;
  const ink = entered ? 'in' : '';
  return (
    <section data-section="hero" className="relative h-[175vh]" aria-labelledby="hero-title">
      <div data-vars="p" className="sticky top-0 h-svh overflow-hidden pointer-events-none"
        style={{ opacity: 'calc(1 - var(--p, 0) * 1.35)', transform: 'translate3d(0, calc(var(--p, 0) * -7vh), 0)' }}>

        {/* vertical calligraphy title + seal, read right-to-left like a hanging scroll */}
        <div className="absolute right-[6vw] md:right-[8vw] top-[10vh] md:top-[12vh] flex flex-row-reverse items-start gap-3 md:gap-5">
          <h1 id="hero-title" className={`reveal ${ink} brush vertical text-prussian ink-shadow leading-[0.92] text-[clamp(4rem,13vh,12rem)] md:text-[clamp(5rem,19vh,13rem)]`}
            style={{ transitionDelay: '0.5s' }}>
            {CALLIGRAPHY.title}
          </h1>
          <div className={`reveal ${ink} flex flex-col items-center gap-4 pt-3`} style={{ transitionDelay: '1.1s' }}>
            <span className="seal" aria-label="梵高">{CALLIGRAPHY.seal}</span>
            <span className="vertical-latin latin-italic text-prussian/80 text-[13px] md:text-[15px] tracking-[0.12em] ink-shadow">Vincent van Gogh · 1888</span>
          </div>
        </div>

        {/* lead */}
        <div data-ui className={`reveal ${ink} card pointer-events-auto absolute left-[4vw] right-[4vw] sm:right-auto bottom-[9vh] md:bottom-[13vh] sm:max-w-[31rem] p-5 md:p-7`}
          style={{ transitionDelay: '1.4s' }}>
          <p className="smallcaps text-prussian/70 !text-[10px] md:!text-xs">{HERO.kicker}</p>
          <p className="latin-italic text-prussian text-[2.6rem] md:text-[3.6rem] leading-[1.02] mt-1">{HERO.en}</p>
          <p className="smallcaps text-ochre mt-1 !text-[10px] md:!text-xs">{HERO.enSub}</p>
          <p className="mt-3 md:mt-4 text-[14px] md:text-[15.5px] leading-7 md:leading-8 text-umber/90">{HERO.lead}</p>
          <ul className="mt-4 pt-4 border-t border-prussian/15 grid grid-cols-3 gap-3" aria-label="玩法">
            {hints.map((h) => (
              <li key={h.k} className="leading-snug">
                <span className="block text-[13px] font-bold text-prussian tracking-wider">{h.k}</span>
                <span className="block text-[11.5px] md:text-[12px] text-umber/75 mt-0.5">{h.v}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`reveal ${ink} absolute left-1/2 -translate-x-1/2 bottom-[2.5vh] hidden md:flex flex-col items-center gap-2 text-prussian/85`} style={{ transitionDelay: '2.2s' }}>
          <span className="text-[12px] tracking-[0.3em] ink-shadow">{HERO.scroll}</span>
          <span className="scroll-line" />
        </div>
      </div>
    </section>
  );
}
