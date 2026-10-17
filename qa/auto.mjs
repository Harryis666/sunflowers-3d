// Auto mode check: plays the whole guided tour (src/auto) on the virtual clock (qa/capture-clock.js)
// and asserts that every beat lands — the raking light, the poked flower, the colour-flower and the
// rail, the spirals, the dragged years, the picked colour, the painted strokes, every chapter — and
// that the page is handed back afterwards. Then the other ways in and out: starting from the page
// (it first glides back to the top), a stray click (shows the way out), and Esc in the middle of a hold.
//
//   node qa/serve.mjs 4174 dist &
//   node qa/auto.mjs [--url=http://127.0.0.1:4174/] [--w=1920 --h=1080] [--fps=10] [--shots=<dir> [--png]] [--to=<s>]
//
// --shots saves a frame at each beat for a look by eye (--png: lossless); --to stops the tour at that second and checks
// only the beats before it (a quick look at another screen size). Needs Playwright + Chromium as qa/quick.mjs.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(process.env.PW_NODE_MODULES || (existsSync('/vercel/sandbox/node_modules/playwright') ? '/vercel/sandbox/node_modules/' : import.meta.url));
const CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const URL_ = opt.url || 'http://127.0.0.1:4174/';
const W = Number(opt.w || 1920), H = Number(opt.h || 1080), FPS = Number(opt.fps || 10), DT = 1000 / FPS;
const SHOTS = opt.shots && opt.shots !== true ? opt.shots : null;
const TO = opt.to ? Number(opt.to) : Infinity;
const BEATS = { raking: 10.2, poke: 12.8, disc: 21.5, rail: 24.0, spirals: 34.0, years: 46.5, paint: 55.5, night: 61.5 };

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await ctx.addInitScript({ path: join(here, 'capture-clock.js') });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);   // screenshots straight from the compositor (Playwright's own wait for a frame that the frozen clock never schedules)
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '  ok ' : 'FAIL '} ${what}`); if (!ok) fails.push(what); };
const upTo = (t, ok, what) => (t <= TO ? check(typeof ok === 'function' ? ok() : ok, typeof what === 'function' ? what() : what) : console.log(`skip  ${typeof what === 'function' ? '…' : what}`));

await page.goto(URL_ + (URL_.includes('?') ? '&' : '?') + 'capture&auto&dpr=0.5', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => performance.getEntriesByName('sf:ready').length > 0 && performance.getEntriesByName('sf:studio').length > 0, null, { timeout: 600000, polling: 250 });
await page.evaluate(() => { window.__capture = { loaderAt: performance.now() - 5000 }; });   // the filmed loader: already full
await page.waitForSelector('#boot-cta .btn-primary', { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
await page.evaluate(() => window.__cap.freeze());

const step = (n = 1) => page.evaluate(async ([k, ms]) => { for (let i = 0; i < k; i++) await window.__cap.step(ms); }, [n, DT]);
const probe = () => page.evaluate(() => {
  const a = window.__autopilot, s = window.__store.get(), c = document.getElementById('sun-cursor');
  const blue = document.querySelector('section[data-section="studio"] [role="radio"][aria-label^="普鲁士蓝"]');
  return {
    phase: a.phase, t: a.t, y: scrollY, now: performance.now(), raking: s.raking, hoverYellow: s.hoverYellow, spirals: s.spirals,
    age: s.age, ageTouched: s.ageTouched, chapter: s.chapter, auto: s.auto, cursor: c?.dataset.state, press: !!c?.hasAttribute('data-press'),
    blue: blue?.getAttribute('aria-checked') === 'true', shield: !!document.getElementById('auto-shield'),
    skin: document.documentElement.classList.contains('autopilot'), nudge: document.documentElement.classList.contains('auto-nudge'),
  };
});
const capture = async (o) => Buffer.from((await cdp.send('Page.captureScreenshot', o)).data, 'base64');
const shot = async (name) => {
  if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true });
  writeFileSync(join(SHOTS, `${name}.${opt.png ? 'png' : 'jpg'}`), await capture(opt.png ? { format: 'png' } : { format: 'jpeg', quality: 80 }));
};
// mean colour difference of the studio canvas between two moments (has paint gone on?)
const canvasGrab = async () => {
  // (the clip is in document coordinates)
  const r = await page.evaluate(() => { const b = document.querySelector('section[data-section="studio"] canvas').getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; });
  return capture({ format: 'png', clip: { ...r, scale: 1 } });
};

// ---------------------------------------------------------------- 1. the whole tour, from the gate
const b = await page.locator('#boot-cta .btn-primary').boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down(); await step(1); await page.mouse.up();
const t0 = await page.evaluate(() => performance.now());
check(await page.evaluate(() => window.__autopilot.running), 'entering with ?auto starts the tour');
const tl = [];
let before = null, after = null;
const beats = Object.entries(BEATS).sort((p, q) => p[1] - q[1]);
for (let guard = 0; guard < 80 * FPS; guard++) {
  await step(1);
  const s = await probe();
  tl.push(s);
  if (beats.length && s.t >= beats[0][1] && s.phase === 'tour') await shot(`${String(beats[0][1]).padStart(4, '0')}-${beats.shift()[0]}`);
  if (!before && s.phase === 'tour' && s.t >= 51.3) before = await canvasGrab();
  if (!after && s.phase === 'tour' && s.t >= 56.4) after = await canvasGrab();
  if (s.phase === 'off' || (s.phase === 'tour' && s.t >= TO)) break;
}
const during = (a, z) => tl.filter((s) => s.phase === 'tour' && s.t >= a && s.t <= z);
const at = (t) => tl.find((s) => s.phase === 'tour' && s.t >= t);
upTo(11.6, () => during(9.4, 11.3).some((s) => s.raking) && !at(11.6)?.raking, 'press and hold: raking light on, then off');
const synth = await page.evaluate(() => (window.__synth?.log ?? []).map((e) => ({ t: e.t, k: e.k, a: e.a })));
const tau = (e) => (e.t - t0) / 1000;
// a poked flower answers with a little arpeggio: four forced notes at chroma 0.8, softer each time
const chord = synth.filter((e) => e.k === 'note' && e.a?.[1] === 0.8 && tau(e) > 12.4 && tau(e) < 13.2);
upTo(13.2, chord.length >= 4, `a big flower is poked (its chord sounds: ${chord.length} notes)`);
upTo(22.0, () => during(20.2, 22.0).some((s) => s.hoverYellow >= 0), 'the colour-flower answers the hover');
const rail = new Set(during(22.8, 24.8).map((s) => s.hoverYellow).filter((v) => v >= 0));
upTo(24.8, rail.size >= 8, `the rail sweep plays its yellows (${rail.size} distinct)`);
upTo(37, () => during(33.3, 37).every((s) => s.spirals) && during(33.3, 37).length > 0, 'the spirals are switched on');
upTo(45.95, () => at(45.95)?.ageTouched && at(45.95)?.age <= 0.02, () => `the years are dragged back to 1888 (age ${at(45.95)?.age})`);
upTo(47.0, () => Math.abs((at(47.0)?.age ?? 0) - 0.55) < 0.08, () => `…and forward again (age ${at(47.0)?.age?.toFixed(3)})`);
upTo(51.2, () => at(51.2)?.blue, 'Prussian blue is picked');
// the canvas also paints itself a sunflower meanwhile (it grows one the first time it is seen), so count
// what only the two strokes bring: Prussian-blue pixels
const blue = before && after ? await page.evaluate(async ([a, z]) => {
  const load = (b64) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
  const share = (img) => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
    g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 70 && d[i + 2] - d[i] > 25) n++;
    return n / (d.length / 4);
  };
  const [ia, iz] = await Promise.all([load(a), load(z)]);
  return share(iz) - share(ia);
}, [before.toString('base64'), after.toString('base64')]) : 0;
if (SHOTS && before && after) { writeFileSync(join(SHOTS, 'studio-before.png'), before); writeFileSync(join(SHOTS, 'studio-after.png'), after); }
upTo(56.4, blue > 0.015, `two Prussian-blue strokes are painted (${(blue * 100).toFixed(1)} % of the canvas turned blue)`);
const chapters = [...new Set(tl.filter((s) => s.phase === 'tour').map((s) => s.chapter))];
upTo(Infinity, chapters.join() === '0,1,2,3,4,5', `every chapter in order (${chapters.join(' → ')})`);
const tourFrames = tl.filter((s) => s.phase === 'tour' && s.t > 0.3);
check(tourFrames.every((s) => s.cursor !== 'off' && s.skin && s.shield), 'the sunflower cursor shows throughout, the shield holds');
const presses = tl.filter((s, i) => s.press && !tl[i - 1]?.press).length;
upTo(Infinity, presses === 7, `seven presses shown (${presses})`);
const end = tl[tl.length - 1];
upTo(Infinity, end.phase === 'off' && !end.auto && !end.shield && !end.skin && end.cursor === 'off', 'after the last beat it bows out and hands the page back');
console.log(`tour: ${((end.now - t0) / 1000).toFixed(1)} s, ${tl.length} frames`);

// ---------------------------------------------------------------- 2. from the page: glide back to the top, then the tour
if (TO === Infinity) {
  const y0 = await page.evaluate(() => scrollY);
  const hb = await page.locator('header button[aria-label="自动浏览"]').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down(); await step(1); await page.mouse.up(); await step(2);
  let s = await probe();
  check(s.phase === 'rewind' && s.y < y0, `the header button starts it from the outro: it first glides back up (${Math.round(y0)} → ${Math.round(s.y)} px)`);
  for (let i = 0; i < 6 * FPS && s.phase === 'rewind'; i++) { await step(1); s = await probe(); }
  check(s.phase === 'tour' && s.y < 2, 'then plays from the top');

  // a stray click: the way out shows, nothing else happens
  const yBefore = s.y;
  await page.mouse.move(W * 0.8, H * 0.3); await page.mouse.down(); await step(1); await page.mouse.up(); await step(1);
  s = await probe();
  check(s.nudge && s.phase === 'tour' && Math.abs(s.y - yBefore) < 1, 'a stray click only shows the way out');
  await page.mouse.wheel(0, 800); await step(2);
  s = await probe();
  check(s.y < 2, 'the wheel cannot scroll the tour away');

  // Esc in the middle of the raking-light hold: lets go and hands back at once
  for (let i = 0; i < 12 * FPS && !(s.phase === 'tour' && s.raking); i++) { await step(1); s = await probe(); }
  check(s.raking, 'the hold is under way again');
  await page.keyboard.press('Escape'); await step(2);
  s = await probe();
  check(s.phase === 'off' && !s.raking && !s.shield && !s.skin && !s.auto, 'Esc lets go of the hold and hands the page back');
}

console.log(logs.length ? logs.join('\n') : 'no console errors');
if (logs.length) fails.push('console errors');
await browser.close();
console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
