// Runtime-smoothness probe: where does each frame's time go while a visitor scrolls and plays?
//   node qa/smooth.mjs [desktop|mobile] [url] [dpr]
// Records a Chrome trace for each scripted scene (pointer moving, Lenis scrolling, slider, rail …)
// and reports per frame: main-thread busy time split into script / style / layout / paint, how much
// of the style + layout was *forced* from script (layout thrash), raster work, GC, and GPU-process
// busy time. Pass dpr=0.25 to make the (software) GPU nearly free so main-thread costs stand out.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(process.env.PW_NODE_MODULES || (existsSync('/vercel/sandbox/node_modules/playwright') ? '/vercel/sandbox/node_modules/' : import.meta.url));
const CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined);
const { chromium } = require('playwright');

const [mode = 'desktop', url = 'http://127.0.0.1:4174/', dprArg = ''] = process.argv.slice(2);
const vp = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: mode === 'mobile', hasTouch: mode === 'mobile' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
await page.goto(url + (dprArg ? `?dpr=${dprArg}` : ''), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => performance.getEntriesByName('sf:ready').length > 0, null, { timeout: 300000, polling: 250 });
await page.waitForTimeout(800);
await page.click('#boot-cta button.btn-ghost');
// let the paint studio finish warming its pipelines in the background before measuring
await page.waitForFunction(() => performance.getEntriesByName('sf:studio').length > 0, null, { timeout: 120000, polling: 250 }).catch(() => {});
await page.waitForTimeout(4500);

const top = (s) => page.evaluate((s) => document.querySelector(`[data-section="${s}"]`).getBoundingClientRect().top + scrollY, s);
const scrollTo = (y, duration) => page.evaluate(([y, d]) => window.__sunflowers.lenis.scrollTo(y, d ? { duration: d } : { immediate: true, force: true }), [y, duration]);
const H = vp.height, W = vp.width;
async function wander(ms, cx = 0.5, cy = 0.45, rx = 0.18, ry = 0.12) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const u = (Date.now() - t0) / 1000;
    await page.mouse.move(W * (cx + rx * Math.sin(u * 1.7)), H * (cy + ry * Math.sin(u * 2.3)));
    await page.waitForTimeout(16);
  }
}

const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu', 'viz', 'v8', 'toplevel', 'disabled-by-default-devtools.timeline.frame'];
async function trace(name, body) {
  if (process.env.SMOOTH_ONLY && !name.includes(process.env.SMOOTH_ONLY)) return;
  const events = [];
  const onData = (d) => { for (const e of d.value) events.push(e); };
  cdp.on('Tracing.dataCollected', onData);
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: CATS, recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  const f0 = await page.evaluate(() => (window.__fr = 0, (function f() { window.__fr++; requestAnimationFrame(f); })(), performance.now()));
  await body();
  const [frames, t1] = await page.evaluate(() => [window.__fr, performance.now()]);
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end'); await done;
  cdp.off('Tracing.dataCollected', onData);
  report(name, events, frames, (t1 - f0) / 1000);
}

function report(name, ev, frames, secs) {
  const tname = new Map(), pname = new Map();
  for (const e of ev) if (e.ph === 'M') { if (e.name === 'thread_name') tname.set(`${e.pid}:${e.tid}`, e.args.name); if (e.name === 'process_name') pname.set(e.pid, e.args.name); }
  const byThread = new Map();
  for (const e of ev) if (e.ph === 'X' && e.dur !== undefined) { const k = `${e.pid}:${e.tid}`; (byThread.get(k) || byThread.set(k, []).get(k)).push(e); }
  // renderer main thread = the CrRendererMain that ran our animation frames
  let mainKey = null, best = -1;
  for (const [k, list] of byThread) if (tname.get(k) === 'CrRendererMain') { const n = list.filter((e) => e.name === 'FireAnimationFrame').length; if (n > best) { best = n; mainKey = k; } }
  const main = (byThread.get(mainKey) || []).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const sum = { busy: 0, script: 0, style: 0, layout: 0, forced: 0, paint: 0, gc: 0, commit: 0 };
  const stack = [];
  const JS = new Set(['FireAnimationFrame', 'FunctionCall', 'EventDispatch', 'TimerFire', 'v8.run', 'V8.Execute']);
  for (const e of main) {
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) stack.pop();
    const inJs = stack.some((s) => JS.has(s.name));
    if (!stack.length && (e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask')) sum.busy += e.dur;
    if (JS.has(e.name) && !inJs) sum.script += e.dur;
    if (e.name === 'UpdateLayoutTree' || e.name === 'RecalculateStyles') { if (inJs) sum.forced += e.dur; else sum.style += e.dur; }
    if (e.name === 'Layout') { if (inJs) sum.forced += e.dur; else sum.layout += e.dur; }
    if (['Paint', 'PrePaint', 'Layerize', 'UpdateLayer', 'PaintImage'].includes(e.name) && !stack.some((s) => s.name === 'Paint')) sum.paint += e.dur;
    if (e.name === 'Commit' || e.name === 'ProxyMain::BeginMainFrame::commit') sum.commit += e.dur;
    if (/^(MinorGC|MajorGC|V8\.GC_SCAVENGER$|V8\.GC_MARK_COMPACTOR$|BlinkGC\.AtomicPhase)/.test(e.name) && !stack.some((s) => /GC/.test(s.name))) sum.gc += e.dur;
    stack.push(e);
  }
  let raster = 0, gpu = 0;
  for (const [k, list] of byThread) {
    const n = tname.get(k) || '';
    if (/CompositorTileWorker/.test(n)) for (const e of list) if (e.name === 'RasterTask') raster += e.dur;
    if (n === 'CrGpuMain') { const s = list.slice().sort((a, b) => a.ts - b.ts); let end = 0; for (const e of s) { if (e.ts >= end) { gpu += e.dur; end = e.ts + e.dur; } else if (e.ts + e.dur > end) { gpu += e.ts + e.dur - end; end = e.ts + e.dur; } } }
  }
  if (process.env.SMOOTH_GPU) {   // what the GPU process spends its time on (top-level and second-level events)
    const agg = new Map();
    for (const [k, list] of byThread) {
      const n = tname.get(k) || ''; if (!/CrGpuMain|VizCompositor/.test(n)) continue;
      const s = list.slice().sort((a, b) => a.ts - b.ts || b.dur - a.dur); const st = [];
      for (const e of s) {
        while (st.length && st[st.length - 1].ts + st[st.length - 1].dur <= e.ts) st.pop();
        if (st.length <= 1) { const key = `${n.slice(0, 8)} ${'  '.repeat(st.length)}${e.name}`; agg.set(key, (agg.get(key) || 0) + e.dur); }
        st.push(e);
      }
    }
    for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`   ${(v / 1000 / Math.max(1, frames)).toFixed(2).padStart(8)} ms/frame  ${k}`);
  }
  const pf = (us) => (us / 1000 / Math.max(1, frames)).toFixed(2).padStart(6);
  console.log(`${name.padEnd(16)} ${(frames / secs).toFixed(1).padStart(5)} fps | per frame ms: main ${pf(sum.busy)}  script ${pf(sum.script)}  style ${pf(sum.style)}  layout ${pf(sum.layout)}  FORCED ${pf(sum.forced)}  paint ${pf(sum.paint)}  raster ${pf(raster)}  gc ${pf(sum.gc)}  gpu ${pf(gpu)}`);
}

const yT = await top('yellows'), bT = await top('bloom'), fT = await top('fade'), oT = await top('outro');
await trace('hero pointer', () => wander(3500));
await trace('hero→yellows', async () => { await scrollTo(yT + 1.2 * H, 3.2); await wander(3500, 0.6, 0.45, 0.1, 0.1); });
await trace('yellows rail', async () => {
  await scrollTo(yT + 1.6 * H); await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const b = document.querySelectorAll('[aria-label="三十三种黄"] button'); const a = b[2].getBoundingClientRect(), z = b[24].getBoundingClientRect(); return [a.x + a.width / 2, z.x + z.width / 2, a.y + a.height * 0.6]; });
  for (let i = 0; i <= 120; i++) { await page.mouse.move(r[0] + (r[1] - r[0]) * (0.5 - 0.5 * Math.cos((i / 120) * Math.PI * 2)), r[2]); await page.waitForTimeout(25); }
});
await trace('bloom scroll', async () => { await scrollTo(bT - 0.5 * H); await page.waitForTimeout(400); await scrollTo(bT + 2.4 * H, 3.5); await wander(3600, 0.65, 0.45, 0.08, 0.08); });
await trace('fade scroll', async () => { await scrollTo(fT - 0.2 * H); await page.waitForTimeout(400); await scrollTo(fT + 1.9 * H, 3.5); await wander(3600, 0.5, 0.4, 0.15, 0.1); });
await trace('outro', async () => { await scrollTo(oT - 0.8 * H); await page.waitForTimeout(400); await scrollTo(oT + 0.3 * H, 3); await wander(3200, 0.45, 0.4, 0.15, 0.08); });
if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
await browser.close(); process.exit(0);
