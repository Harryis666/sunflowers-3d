// Loading-smoothness probe.
//   node qa/load.mjs <desktop|mobile> [net=none|fast|4g|slow] [cpu=1] [film=0] [url]
// Measures (fresh, cache-less context): first paint, time until the "enter" buttons appear,
// main-thread long tasks and rAF frame gaps while loading, while idling on the gate, and for 4 s
// after entering. `film=1` additionally saves a filmstrip of the loading screen to qa/shots/.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
const require = createRequire(process.env.PW_NODE_MODULES || (existsSync('/vercel/sandbox/node_modules/playwright') ? '/vercel/sandbox/node_modules/' : import.meta.url));
const CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined);
const { chromium } = require('playwright');

const [mode = 'desktop', netName = 'none', cpuArg = '1', filmArg = '0', url = 'http://127.0.0.1:4174/'] = process.argv.slice(2);
const NET = { none: null, fast: { latency: 40, down: 10e6 / 8 }, '4g': { latency: 90, down: 4e6 / 8 }, slow: { latency: 150, down: 1.6e6 / 8 } };
const net = NET[netName]; const cpu = Number(cpuArg); const film = filmArg === '1';
const vp = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
// warm the server's compression cache so the first request doesn't measure the server
try {
  const html = await (await fetch(url)).text();
  for (const m of html.matchAll(/assets\/[^"']+\.(?:js|css)/g)) await fetch(new URL(m[0], url), { headers: { 'accept-encoding': 'br' } }).then((r) => r.arrayBuffer());
} catch { /* server will cope */ }
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: mode === 'mobile', hasTouch: mode === 'mobile' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.down, uploadThroughput: 750e3 / 8 });
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
await page.addInitScript(() => {
  const P = (window.__perf = { lt: [], fr: [] });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const f = (t) => { P.fr.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f);
});

await page.goto(url, { waitUntil: 'commit' });
const shots = [];
if (film) {
  mkdirSync('qa/shots', { recursive: true });
  for (let k = 0; k < 40; k++) {
    const t = await page.evaluate(() => performance.now()).catch(() => 0);
    const p = `qa/shots/film-${mode}-${netName}-${String(k).padStart(2, '0')}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 55 }).catch(() => {});
    shots.push([Math.round(t), p]);
    if (await page.$('text=静音进入')) break;
    await page.waitForTimeout(netName === 'none' ? 120 : 380);
  }
}
await page.waitForSelector('text=静音进入', { timeout: 240000 });
const tReady = await page.evaluate(() => performance.now());
await page.waitForTimeout(2000);
const tEnter = await page.evaluate(() => performance.now());
await page.click('text=静音进入');
await page.waitForTimeout(4000);
const tEnd = await page.evaluate(() => performance.now());
const r = await page.evaluate(() => ({
  P: window.__perf,
  fp: performance.getEntriesByName('first-paint')[0]?.startTime ?? null,
  fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
  marks: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('sf:')).map((m) => [m.name, Math.round(m.startTime)]),
  measures: performance.getEntriesByType('measure').filter((m) => m.name.startsWith('sf:')).map((m) => [m.name, Math.round(m.duration)]),
}));
const win = (a, b) => {
  const fr = r.P.fr.filter((t) => t >= a && t <= b); const gaps = fr.slice(1).map((t, i) => t - fr[i]);
  const lt = r.P.lt.filter(([s]) => s >= a && s <= b);
  return {
    frames: fr.length, fps: +(fr.length / ((b - a) / 1000)).toFixed(1),
    'gap>50': gaps.filter((g) => g > 50).length, 'gap>100': gaps.filter((g) => g > 100).length, maxGap: Math.round(Math.max(0, ...gaps)),
    longTasks: lt.length, ltTotal: Math.round(lt.reduce((s, [, d]) => s + d, 0)), ltMax: Math.round(Math.max(0, ...lt.map(([, d]) => d))),
  };
};
const out = {
  mode, net: netName, cpu, firstPaint: r.fp && Math.round(r.fp), fcp: r.fcp && Math.round(r.fcp), ready: Math.round(tReady), kB: Math.round(bytes / 1024),
  loading: win(0, tReady), gate: win(tReady, tEnter), afterEnter: win(tEnter, tEnd),
  marks: r.marks, measures: r.measures, errors,
  lt: r.P.lt.map(([s, d]) => [Math.round(s), Math.round(d)]),
};
console.log(JSON.stringify(out, null, 1));
if (film) console.log('FILM', JSON.stringify(shots));
await browser.close();
process.exit(0);
