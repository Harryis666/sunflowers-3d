import { createRoot } from 'react-dom/client';
import App from './App';
import { prefetchScene } from './gl/assets';
import { sharedPalette } from './lib/palette';
import { CAPTURE } from './lib/capture';
import { renderSession, synth } from './audio/Synth';
import './styles.css';

// kick off the downloads before the first React render (they stream into the loader's progress)
if (typeof WebGL2RenderingContext !== 'undefined') { prefetchScene(); sharedPalette().catch(() => {}); }

// ?capture (qa/record.mjs films the demo): log the sound for an offline render instead of playing it
if (CAPTURE) { synth.log = []; Object.assign(window, { __synth: { log: synth.log, render: renderSession } }); }

createRoot(document.getElementById('root')!).render(<App />);
