// Visual QA: drives the built site in headless Chromium (SwiftShader WebGL) and saves screenshots.
// usage: node qa/shoot.mjs [desktop|mobile] [names...]
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
// Playwright is not a project dependency: point PW_NODE_MODULES at any node_modules that has it,
// and CHROMIUM_PATH at a Chromium binary (defaults match the sandbox these screenshots were made in).
const require = createRequire(process.env.PW_NODE_MODULES || (existsSync('/vercel/sandbox/node_modules/playwright') ? '/vercel/sandbox/node_modules/' : import.meta.url));
const CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined);
const { chromium } = require('playwright');

const mode = process.argv[2] || 'desktop';
const only = process.argv.slice(3);
const URL = 'http://127.0.0.1:4173/?qa';
const vp = mode === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: mode === 'mobile', hasTouch: mode === 'mobile' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
const want = (n) => !only.length || only.some((o) => n.startsWith(o));
async function shot(name) { if (!want(name)) return; await page.screenshot({ path: `qa/shots/${mode}-${name}.png` }); console.log('shot', name); }
async function scrollTo(section, vh = 0, settle = 2600) {
  await page.evaluate(([s, v]) => {
    const e = window.__sunflowers; const el = document.querySelector(`[data-section="${s}"]`);
    const y = el.getBoundingClientRect().top + window.scrollY + v * innerHeight;
    if (e && e.lenis) e.lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
  }, [section, vh]);
  await wait(settle);
}

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await wait(1200);
await shot('00-loader');
await page.waitForSelector('text=静音进入', { timeout: 90000 });
console.log('ready after', ((Date.now() - t0) / 1000).toFixed(1), 's');
await shot('01-loader-ready');
await page.click('text=静音进入');
await wait(4200);
await page.mouse.move(vp.width * 0.62, vp.height * 0.33);
await wait(1500);
await shot('02-hero');
// hover a flower (crown) to see the glow + loupe
const info = await page.evaluate(() => {
  const e = window.__sunflowers; const f = e.diorama.flowers[0];
  const v = { x: (f.x / 1536 - 0.5) * 15.36, y: (0.5 - f.y / 1024) * 10.24 };
  const THREEv = e.cam.position.clone(); // project manually
  const p = e.cam.position.clone().set(v.x, v.y, 0).project(e.cam);
  return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
});
await page.mouse.move(info.x, info.y, { steps: 4 });
await wait(1200);
await shot('03-hero-hover');
if (mode === 'desktop') { await page.mouse.down(); await wait(1600); await shot('04-hero-raking'); await page.mouse.up(); await wait(400); }
await page.mouse.click(info.x, info.y); await wait(500); await shot('05-hero-click');

await scrollTo('hero', 0.6); await shot('06-hero-dolly');
await scrollTo('yellows', -0.5); await shot('07-swap');
await scrollTo('yellows', 0.3); await shot('08-morph');
await scrollTo('yellows', 1.8, 3500);
await page.mouse.move(vp.width * 0.7, vp.height * 0.45); await wait(800);
await shot('09-colorflower');
await page.evaluate(() => { const b = document.querySelectorAll('[data-section="yellows"] .chip'); b[20]?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' })); });
await page.hover('[data-section="yellows"] .chip >> nth=12').catch(() => {});
await wait(1200); await shot('10-colorflower-hl');
await page.mouse.move(vp.width * 0.5, vp.height * 0.2);
await scrollTo('yellows', 3.15); await shot('11-collapse');
await scrollTo('bloom', -0.1, 3000); await shot('12-bloom-seed');
await scrollTo('bloom', 0.1, 3000); await shot('13-bud');
await scrollTo('bloom', 1.2, 3000); await shot('14-bloom');
await page.click('[data-section="bloom"] button[aria-pressed]').catch((e) => console.log('spiral btn', e.message));
await wait(3500); await shot('15-spirals');
await page.click('[data-section="bloom"] button[aria-pressed]').catch(() => {});
await scrollTo('bloom', 2.3, 3000); await shot('16-wilt');
await scrollTo('bloom', 3.35, 3500); await shot('17-seed');
await scrollTo('fade', -0.25, 2500); await shot('18-repaint');
await scrollTo('fade', 0.2, 2500); await shot('19-1888');
await scrollTo('fade', 1.3, 2500); await shot('20-2026');
await scrollTo('fade', 2.2, 2500); await shot('21-2150');
await scrollTo('studio', 0, 6000); await shot('22-studio');
await scrollTo('outro', 0.0, 3000); await shot('23-outro-night');
await scrollTo('outro', 0.75, 2000); await shot('24-outro-text');
console.log(logs.slice(0, 30).join('\n') || 'no console errors');
await page.close(); await browser.close(); process.exit(0);
