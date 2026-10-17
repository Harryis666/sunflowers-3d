import { useEffect } from 'react';
import { store, useStore } from '../store';
import { useEngine } from '../lib/engineContext';
import { synth } from '../audio/Synth';
import { SECTIONS } from '../gl/Engine';
import { AUTO, CALLIGRAPHY, NAV } from '../content';
import { autopilot, startPoint } from '../auto/autopilot';

const DARK = new Set([1, 4, 5]);   // chapters drawn on Prussian blue / night → light chrome

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" fillOpacity="0.15" />
      {on ? (<><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></>) : (<path d="M17 9l5 6M22 9l-5 6" />)}
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.12" />
      <path d="M10 8.6v6.8l5.4-3.4z" fill="currentColor" />
    </svg>
  );
}

// ---- auto mode's cursor: a sunflower after the painting — two rings of pointed, slightly unruly
// petals in chrome yellow and ochre, each with a lighter brush-stroke down its middle, around an
// umber heart ringed in Prussian blue and dotted with seeds on the golden angle
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const petal = (len: number, w: number, curl: number, r0 = 5.6) => {
  const a = r0 + (len - r0) * 0.28, b = r0 + (len - r0) * 0.74;
  return `M${-w * 0.55},${-r0}C${-w},${-a} ${-w * 0.85 + curl},${-b} ${curl},${-len}C${w * 0.85 + curl},${-b} ${w},${-a} ${w * 0.55},${-r0}Z`;
};
const RING = (n: number, off: number, seed: number, len: [number, number], w: [number, number]) =>
  Array.from({ length: n }, (_, i) => ({
    a: ((i + off) * 360) / n + (rnd(seed + i) - 0.5) * 9,
    len: len[0] + rnd(seed + 50 + i) * (len[1] - len[0]),
    w: w[0] + rnd(seed + 90 + i) * (w[1] - w[0]),
    curl: (rnd(seed + 130 + i) - 0.5) * 3.2,
  }));
const BACK = RING(13, 0.5, 1, [19.5, 22.5], [3.9, 4.6]);
const FRONT = RING(13, 0, 7, [16.5, 19.5], [3.3, 4.0]);
const SEEDS = Array.from({ length: 26 }, (_, k) => {
  const r = 6.1 * Math.sqrt((k + 0.6) / 26), a = k * 2.39996;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, dark: k % 3 === 1 };
});

function SunflowerCursor() {
  return (
    <span className="sf" aria-hidden="true">
      <span className="sf-halo" />
      <span className="sf-sway">
        <svg className="sf-head" viewBox="-24 -24 48 48">
          <g fill="#d08613" stroke="#4f2c07" strokeWidth="1.25" strokeLinejoin="round">
            {BACK.map((p, i) => <path key={i} transform={`rotate(${p.a.toFixed(1)})`} d={petal(p.len, p.w, p.curl)} />)}
          </g>
          <g fill="#f7b81b" stroke="#6e3f08" strokeWidth="1.05" strokeLinejoin="round">
            {FRONT.map((p, i) => <path key={i} transform={`rotate(${p.a.toFixed(1)})`} d={petal(p.len, p.w, p.curl)} />)}
          </g>
          <g fill="none" stroke="#fde58a" strokeWidth="1.15" strokeLinecap="round" opacity="0.9">
            {FRONT.map((p, i) => <path key={i} transform={`rotate(${p.a.toFixed(1)})`} d={`M${(p.curl * 0.1).toFixed(2)},-7.6Q${(p.curl * 0.45).toFixed(2)},${(-p.len * 0.62).toFixed(2)} ${(p.curl * 0.75).toFixed(2)},${(-p.len + 3.4).toFixed(2)}`} />)}
          </g>
          <circle r="7.4" fill="#6a4416" stroke="#23405e" strokeWidth="1.3" />
          <circle r="5.3" fill="#8a6a1e" />
          <circle r="2.5" fill="#4e3010" />
          {SEEDS.map((s, i) => <circle key={i} cx={s.x.toFixed(2)} cy={s.y.toFixed(2)} r="0.62" fill={s.dark ? '#3f2a0f' : '#e8a52f'} />)}
        </svg>
      </span>
    </span>
  );
}

export function Hud() {
  const entered = useStore((s) => s.entered), sound = useStore((s) => s.sound), chapter = useStore((s) => s.chapter);
  const webgl = useStore((s) => s.webgl), auto = useStore((s) => s.auto);
  const engine = useEngine();
  const dark = DARK.has(chapter);

  useEffect(() => {
    if (entered && webgl && matchMedia('(pointer: fine)').matches) document.documentElement.classList.add('has-sun-cursor');
  }, [entered, webgl]);

  const toggle = () => { const on = !sound; synth.setEnabled(on); store.set({ sound: on }); };
  const go = (i: number) => {
    if (engine) engine.scrollTo(SECTIONS[i]);
    else document.querySelector(`[data-section="${SECTIONS[i]}"]`)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <header className={`fixed top-0 inset-x-0 z-40 flex items-center justify-between px-3 sm:px-7 h-16 transition-[opacity,color] duration-700 ${entered ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${dark ? 'text-cream' : 'text-prussian'}`}>
        <button data-ui onClick={() => go(0)} className="flex items-baseline gap-3 min-h-11 px-2 rounded-md" aria-label="回到开头">
          <span className="brush text-[1.65rem] leading-none">{CALLIGRAPHY.title}</span>
          <span className="smallcaps hidden sm:inline opacity-70 !text-[10px]">Sunflowers · Arles 1888</span>
        </button>
        <div className="flex items-center gap-1">
          {/* hidden while the tour plays, so a recording shows the site's own chrome */}
          {engine && webgl && (
            <button data-ui onClick={(e) => autopilot.start({ at: startPoint(e) })} aria-label={AUTO.start} tabIndex={auto ? -1 : 0}
              className={`flex items-center gap-2 h-11 px-3 rounded-full transition-[opacity,background-color] duration-500 ${dark ? 'hover:bg-white/10' : 'hover:bg-prussian/10'} ${auto ? 'opacity-0 pointer-events-none' : ''}`}>
              <PlayIcon />
              <span className="text-xs hidden sm:inline tracking-wider">{AUTO.start}</span>
            </button>
          )}
          <button data-ui onClick={toggle} aria-pressed={sound} aria-label={sound ? '关闭声音' : '开启声音'}
            className={`flex items-center gap-2 h-11 px-3 rounded-full transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-prussian/10'}`}>
            <SoundIcon on={sound} />
            <span className="text-xs hidden sm:inline tracking-wider">{sound ? '声音 开' : '声音 关'}</span>
          </button>
        </div>
      </header>

      <nav aria-label="章节" className={`fixed right-2 lg:right-5 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col transition-[opacity,color] duration-700 ${entered ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${dark ? 'text-cream' : 'text-prussian'}`}>
        {NAV.map((n, i) => {
          const on = chapter === i;
          return (
            <button key={n} data-ui onClick={() => go(i)} aria-current={on ? 'step' : undefined} aria-label={`跳到：${n}`}
              className="group flex items-center justify-end gap-3 h-11 pl-4 pr-2">
              <span className={`text-[13px] tracking-wider transition-all duration-500 ${dark ? 'drop-shadow-[0_1px_6px_rgba(7,13,30,0.95)]' : 'drop-shadow-[0_1px_6px_rgba(255,246,220,0.95)]'} ${on ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 group-hover:opacity-80 group-hover:translate-x-0'}`}>{n}</span>
              <span className={`block rounded-full transition-all duration-500 ${on ? 'w-3 h-3 bg-chrome shadow-[0_0_0_3px_rgba(240,180,25,0.3)]' : 'w-2 h-2 bg-current opacity-45'}`} />
            </button>
          );
        })}
      </nav>

      <div id="scroll-progress" className="fixed top-0 left-0 h-[3px] z-40 bg-chrome md:hidden origin-left" style={{ width: '100%', transform: 'scaleX(var(--scroll, 0))' }} aria-hidden="true" />

      <div id="sun-cursor" className="sun-cursor" data-state="off" aria-hidden="true">
        <svg className="sun" viewBox="-22 -22 44 44">
          <g className="rays" stroke="#16324f" strokeWidth="1.6" strokeLinecap="round">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2, r0 = i % 2 ? 9.5 : 8.5, r1 = i % 2 ? 13 : 15.5;
              return <line key={i} x1={Math.cos(a) * r0} y1={Math.sin(a) * r0} x2={Math.cos(a) * r1} y2={Math.sin(a) * r1} />;
            })}
          </g>
          <circle r="6" fill="#f0b419" stroke="#16324f" strokeWidth="1.4" />
          <circle r="2.4" fill="#5a3a12" />
        </svg>
        <SunflowerCursor />
        <span id="sun-cursor-label" className="sun-label" />
      </div>
    </>
  );
}
