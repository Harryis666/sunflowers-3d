// Quick targeted QA: node qa/quick.mjs <desktop|mobile> section:vh:name[:mx,my] ...
// QA_URL=http://127.0.0.1:4174/ QA_TAG=new → shots/q-new-<mode>-<name>.png (default: the preview server on 4173)
// Loads the built site once, enters muted, then visits each scroll position and screenshots it.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
// Playwright is not a project dependency: point PW_NODE_MODULES at any node_modules that has it,
// and CHROMIUM_PATH at a Chromium binary (defaults match the sandbox these screenshots were made in).
const require = createRequire(process.env.PW_NODE_MODULES || (existsSync('/vercel/sandbox/node_modules/playwright') ? '/vercel/sandbox/node_modules/' : import.meta.url));
const CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined);
const { chromium } = require('playwright');

const mode = process.argv[2] || 'desktop';
const stops = process.argv.slice(3);
const vp = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: mode === 'mobile', hasTouch: mode === 'mobile' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const base = process.env.QA_URL || 'http://127.0.0.1:4173/';
const tag = process.env.QA_TAG ? process.env.QA_TAG + '-' : '';
await page.goto(base + '?qa', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=静音进入', { timeout: 90000 });
await page.click('text=静音进入');
await page.waitForTimeout(3500);
for (const stop of stops) {
  const [section, vh, name, mxy, settle] = stop.split(':');
  await page.evaluate(([s, v]) => {
    const e = window.__sunflowers; const el = document.querySelector(`[data-section="${s}"]`);
    const y = el.getBoundingClientRect().top + window.scrollY + Number(v) * innerHeight;
    if (e && e.lenis) e.lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
  }, [section, vh]);
  if (mxy) { const [mx, my] = mxy.split(',').map(Number); await page.mouse.move(vp.width * mx, vp.height * my, { steps: 3 }); }
  await page.waitForTimeout(Number(settle || 3000));
  await page.screenshot({ path: `qa/shots/q-${tag}${mode}-${name}.png` });
  console.log('shot', name);
}
console.log(logs.length ? logs.join('\n') : 'no console errors');
await browser.close();
process.exit(0);
