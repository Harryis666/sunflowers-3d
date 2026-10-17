import { useEffect, useRef, useState } from 'react';
import { store, useStore } from './store';
import { Engine } from './gl/Engine';
import { autopilot } from './auto/autopilot';
import { EngineCtx } from './lib/engineContext';
import { Loader } from './components/Loader';
import { Hud } from './components/Hud';
import { Hero } from './components/Hero';
import { Yellows } from './components/Yellows';
import { Bloom } from './components/Bloom';
import { Fade } from './components/Fade';
import { Studio } from './components/Studio';
import { Outro } from './components/Outro';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const webgl = useStore((s) => s.webgl);

  useEffect(() => {
    const fail = (err?: unknown) => {
      if (err) console.error(err);
      store.set({ webgl: false, ready: true, loaded: 1 });
    };
    if (!canvasRef.current || !Engine.supported()) { fail(); return; }
    const e = new Engine(canvasRef.current);
    Object.assign(window, { __sunflowers: e, __store: store });   // handy for QA / the console
    autopilot.attach(e);
    setEngine(e);
    e.init().catch((err) => { autopilot.attach(null); setEngine(null); fail(err); });
    return () => { autopilot.attach(null); e.dispose(); };
  }, []);

  return (
    <EngineCtx.Provider value={engine}>
      <canvas ref={canvasRef} id="gl" aria-hidden="true" style={{ display: webgl ? 'block' : 'none' }} />
      {!webgl && <div className="static-bg" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}assets/master.webp)` }} aria-hidden="true" />}
      <main className="relative z-10">
        <Hero />
        <Yellows />
        <Bloom />
        <Fade />
        <Studio />
        <Outro />
      </main>
      <Hud />
      <Loader />
    </EngineCtx.Provider>
  );
}
