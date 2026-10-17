// Film the demo: the site's own auto mode (src/auto — a guided visit of every chapter), captured
// frame by frame on a virtual clock (qa/capture-clock.js), with the site's own instrument rendered
// offline as the soundtrack. (With a real GPU you can simply screen-record ?auto instead: README.)
//
//   node qa/serve.mjs 4174 dist &          # any static server for dist/
//   node qa/record.mjs                      # → qa/video/sunflowers-demo.mp4 (1920×1080, 30 fps)
//   node qa/record.mjs --fps=10 --dpr=0.5 --out=qa/video-preview   # quick storyboard check (~12 min)
//
// Options: --url --fps --w --h --dpr --out --to=<seconds> --jpeg=<quality> --crf=<x264 crf> --no-encode
//          --encode-only (re-encode the frames + audio.wav already in --out, without filming again)
// Needs Playwright + Chromium (PW_NODE_MODULES / CHROMIUM_PATH as in qa/quick.mjs) and ffmpeg.
// The page runs with ?capture&auto (src/lib/capture.ts): sound is logged instead of played, the
// loader fills on cue and entering starts the tour; everything else is the site as a visitor gets it.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(process.env.PW_NODE_MODULES || (existsSync('/vercel/sandbox/node_modules/playwright') ? '/vercel/sandbox/node_modules/' : import.meta.url));
const CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const URL_ = opt.url || 'http://127.0.0.1:4174/';
const FPS = Number(opt.fps || 30), W = Number(opt.w || 1920), H = Number(opt.h || 1080);
const OUT = opt.out || join(here, 'video');
const JPEG = Number(opt.jpeg || 93);
const CRF = Number(opt.crf || 21);              // visually transparent on this footage (SSIM 0.983), ~half the size of 18
const DPR = opt.dpr ? `&dpr=${opt.dpr}` : '';            // e.g. --dpr=0.5 for a quick, soft preview
const FRAMES = join(OUT, 'frames');

// ------------------------------------------------------------------ easing & paths
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);          // in-out cubic
const easeSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const bez = (p0, c1, c2, p1, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1; };

// ------------------------------------------------------------------ the storyboard (seconds)
// The film is auto mode (src/auto): this script only plays the gate — the cursor drifts in while the
// seeds fill, settles on 带声音进入 and clicks it (with ?auto, entering starts the guided tour) — and
// the page's own storyboard (src/auto/storyboard.ts) does all the rest, one frame per clock step.
// Mouse: moves {t, d, to, bend} (to = [x,y] in 0..1 of the viewport, or an anchor name resolved
// from the live layout when the move starts), buttons [t, 'down'|'up'].
const MOVES = [
  { t: 2.4, d: 1.4, to: [0.6, 0.8], bend: 0.12 },
  { t: 3.95, d: 0.75, to: 'enterSound', bend: -0.1 },
];
const BUTTONS = [[5.0, 'down'], [5.1, 'up']];        // 带声音进入 → the tour starts on the click
const TOUR_AT = 5.1;
const CUES = [[0.25, 'loader']];

const ANCHORS = { enterSound: () => box('#boot-cta button.btn-primary', 0.5, 0.55) };

// ------------------------------------------------------------------ browser
let page;
const pageFn = (fn, arg) => page.evaluate(fn, arg);
const box = (sel, fx, fy) => page.evaluate(([s, x, y]) => {
  const el = document.querySelector(s); if (!el) throw new Error('anchor not found: ' + s);
  const r = el.getBoundingClientRect(); return [(r.left + r.width * x) / innerWidth, (r.top + r.height * y) / innerHeight];
}, [sel, fx, fy]);

const ENCODE_ONLY = !!opt['encode-only'];   // re-encode an existing take (frames + audio.wav) without filming again
if (!ENCODE_ONLY) await film();
encode();
process.exit(0);

// ------------------------------------------------------------------ film: load, freeze the clock, roll
async function film() {
  if (existsSync(FRAMES)) rmSync(FRAMES, { recursive: true });
  mkdirSync(FRAMES, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript({ path: join(here, 'capture-clock.js') });
  page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const cdp = await ctx.newCDPSession(page);

  const t00 = Date.now();
  await page.goto(URL_ + (URL_.includes('?') ? '&' : '?') + 'capture&auto' + DPR, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => performance.getEntriesByName('sf:ready').length > 0 && performance.getEntriesByName('sf:studio').length > 0, null, { timeout: 600000, polling: 250 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  console.log(`loaded in ${((Date.now() - t00) / 1000).toFixed(1)} s`);

  // a plain arrow for the gate (the site draws its own sun cursor once you are in)
  await page.addStyleTag({ content: `
    #cap-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; will-change: transform; }
    html.has-sun-cursor #cap-cursor { display: none; }
    #cap-cursor svg { position: absolute; left: -2px; top: -1px; filter: drop-shadow(0 2px 2.5px rgba(40,25,5,.35)); }
    #cap-cursor i { position: absolute; left: -16px; top: -16px; width: 32px; height: 32px; border-radius: 50%; border: 2px solid rgba(255,248,226,.95); box-shadow: 0 0 0 1px rgba(60,40,10,.25); opacity: 0; }` });
  await page.evaluate(() => {
    const c = document.createElement('div'); c.id = 'cap-cursor';
    c.innerHTML = '<i></i><svg width="22" height="26" viewBox="0 0 22 26"><path d="M1.5 1.5 L1.5 20 L6 15.8 L9.2 23 L12.4 21.6 L9.3 14.6 L15.4 14.6 Z" fill="#fffdf6" stroke="#2b2112" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    c.style.transform = 'translate3d(-60px,-60px,0)';
    document.body.appendChild(c);
  });

  const tour = await page.evaluate(() => window.__autopilot?.duration ?? 0);
  if (!tour) throw new Error('this build has no auto mode (window.__autopilot)');
  const END = Number(opt.to || TOUR_AT + tour);
  const v0 = await page.evaluate(() => window.__cap.freeze());
  const dtMs = 1000 / FPS;
  const N = Math.round(END * FPS);

  // ------------------------------------------------------------------ timeline evaluation
  let mouse = [1.05, 1.05];          // off-screen until the first move
  const started = new Map();
  async function mouseAt(t) {
    let active = null;
    for (const m of MOVES) if (t >= m.t && t <= m.t + m.d) active = m;
    if (!active) {
      // hold the end of the last finished move (or path)
      let last = null; for (const m of MOVES) if (t > m.t + m.d) last = m;
      if (last && started.has(last)) { const s = started.get(last); mouse = last.path ? last.path(1) : s.to; }
      return mouse;
    }
    if (!started.has(active)) {
      const to = active.path ? null : (typeof active.to === 'string' ? await ANCHORS[active.to]() : active.to);
      started.set(active, { from: [...mouse], to });
    }
    const s = started.get(active), u = clamp01((t - active.t) / active.d);
    if (active.path) return (mouse = active.path(u));
    const [x0, y0] = s.from, [x1, y1] = s.to;
    const dx = (x1 - x0) * W, dy = (y1 - y0) * H, len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (active.bend || 0) * len / W, ny = (dx / len) * (active.bend || 0) * len / H;
    const e = easeSine(u) * 0.35 + ease(u) * 0.65;
    return (mouse = [bez(x0, lerp(x0, x1, 0.3) + nx, lerp(x0, x1, 0.7) + nx, x1, e), bez(y0, lerp(y0, y1, 0.3) + ny, lerp(y0, y1, 0.7) + ny, y1, e)]);
  }

  // ------------------------------------------------------------------ roll
  const t0 = Date.now();
  let down = false, lastPx = null, pressT = -1, toured = false;
  const btnQueue = [...BUTTONS], cueQueue = [...CUES];
  for (let f = 0; f < N; f++) {
    const t = f / FPS;
    while (cueQueue.length && cueQueue[0][0] <= t) {
      const [, cue] = cueQueue.shift();
      if (cue === 'loader') await page.evaluate(() => { window.__capture = { loaderAt: performance.now() }; });
    }
    if (!toured && t > TOUR_AT + 0.2) {
      toured = true;
      if (!(await page.evaluate(() => window.__autopilot?.running))) logs.push('[film] the click did not start the tour');
    }
    const [mx, my] = await mouseAt(t);
    const px = [Math.round(mx * W * 10) / 10, Math.round(my * H * 10) / 10];
    if (!lastPx || px[0] !== lastPx[0] || px[1] !== lastPx[1]) { await page.mouse.move(px[0], px[1]); lastPx = px; }
    while (btnQueue.length && btnQueue[0][0] <= t) {
      const [, b] = btnQueue.shift();
      if (b === 'down' && !down) { await page.mouse.down(); down = true; pressT = t; }
      if (b === 'up' && down) { await page.mouse.up(); down = false; }
    }
    const ring = pressT >= 0 ? clamp01(1 - (t - pressT) / 0.45) : 0;
    await page.evaluate(async ([ms, x, yy, r]) => {
      const c = document.getElementById('cap-cursor');
      if (c) { c.style.transform = `translate3d(${x}px, ${yy}px, 0)`; const i = c.firstElementChild; i.style.opacity = String(r); i.style.transform = `scale(${0.35 + 0.9 * (1 - r)})`; }
      await window.__cap.step(ms);
    }, [dtMs, px[0], px[1], ring]);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: JPEG, optimizeForSpeed: true });
    writeFileSync(join(FRAMES, `f${String(f).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
    if (f % FPS === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`t=${t.toFixed(1)}s frame ${f}/${N}  ${(el / (f + 1)).toFixed(2)} s/frame  eta ${((N - f - 1) * el / (f + 1) / 60).toFixed(1)} min`);
    }
  }

  // ------------------------------------------------------------------ soundtrack: the same instrument, offline
  const seconds = N / FPS + 2;
  const wav = await page.evaluate(async ([from, secs]) => {
    const s = window.__synth; if (!s) return null;
    const buf = await s.render(s.log, from, secs);
    const ch = [buf.getChannelData(0), buf.getChannelData(1)], n = buf.length, rate = buf.sampleRate;
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, x) => { for (let i = 0; i < x.length; i++) out.setUint8(o + i, x.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, rate, true);
    out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < 2; c++, o += 2) out.setInt16(o, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
    const bytes = new Uint8Array(out.buffer); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { b64: btoa(bin), notes: s.log.length };
  }, [v0 + dtMs, seconds]);
  if (wav) { writeFileSync(join(OUT, 'audio.wav'), Buffer.from(wav.b64, 'base64')); console.log(`soundtrack: ${wav.notes} logged events`); }
  console.log(logs.length ? logs.join('\n') : 'no console errors');
  await browser.close();
}

// ------------------------------------------------------------------ encode
function encode() {
  if (opt['no-encode']) return;
  const frames = readdirSync(FRAMES).filter((f) => f.endsWith('.jpg')).length;
  const wavPath = join(OUT, 'audio.wav'), hasWav = existsSync(wavPath);
  const mp4 = join(OUT, 'sunflowers-demo.mp4');
  const dur = frames / FPS, fadeOut = Math.max(0, dur - 1.4);
  const ff = (args) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', ...args], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 << 20 });
    if (r.status !== 0) { console.error(String(r.stderr).slice(-2000)); process.exit(1); }
    return String(r.stderr);
  };
  // two-pass loudness normalisation: measure first, then apply one linear gain (keeps the instrument's dynamics)
  let af = '';
  if (hasWav) {
    const fades = `afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOut}:d=1.4`, target = 'I=-18:TP=-1.5:LRA=11';
    const m = JSON.parse(ff(['-i', wavPath, '-t', String(dur), '-af', `${fades},loudnorm=${target}:print_format=json`, '-f', 'null', '-']).match(/\{[\s\S]*?\}/g).pop());
    af = `${fades},loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    console.log(`soundtrack loudness ${m.input_i} LUFS → -18 LUFS`);
  }
  const args = ['-y', '-framerate', String(FPS), '-i', join(FRAMES, 'f%05d.jpg')];
  if (hasWav) args.push('-i', wavPath);
  args.push('-vf', `fade=t=in:st=0:d=0.6,fade=t=out:st=${fadeOut}:d=1.4,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-profile:v', 'high', '-tune', 'film', '-movflags', '+faststart');
  if (hasWav) args.push('-af', af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest');
  args.push(mp4);
  ff(args);
  console.log('wrote', mp4, `(${frames} frames, crf ${CRF})`);
}
