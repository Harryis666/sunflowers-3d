import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
// Playwright is not a project dependency: point PW_NODE_MODULES at any node_modules that has it,
// and CHROMIUM_PATH at a Chromium binary (defaults match the sandbox these screenshots were made in).
const require = createRequire(process.env.PW_NODE_MODULES || (existsSync('/vercel/sandbox/node_modules/playwright') ? '/vercel/sandbox/node_modules/' : import.meta.url));
const CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4173/');
await page.waitForSelector('text=静音进入', { timeout: 90000 });
await page.click('text=静音进入');
const fps = async (label) => { const f = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else r(n / 3); }; requestAnimationFrame(tick); })); console.log(label, f.toFixed(1), 'fps'); };
await page.waitForTimeout(3000); await fps('hero');
for (const [s, v] of [['yellows', 1.8], ['bloom', 1.2], ['fade', 1.0]]) {
  await page.evaluate(([s, v]) => { const e = window.__sunflowers; const el = document.querySelector(`[data-section="${s}"]`); e.lenis.scrollTo(el.getBoundingClientRect().top + scrollY + v * innerHeight, { immediate: true, force: true }); }, [s, v]);
  await page.waitForTimeout(1500); await fps(s);
}
await browser.close(); process.exit(0);
