// Verifies that the off-thread ImageBitmap path uploads exactly the same texels as the old
// <img> path (UNPACK_FLIP_Y, no premultiply, no colour conversion). node qa/texcheck.mjs [url]
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(process.env.PW_NODE_MODULES || (existsSync('/vercel/sandbox/node_modules/playwright') ? '/vercel/sandbox/node_modules/' : import.meta.url));
const CHROMIUM = process.env.CHROMIUM_PATH || (existsSync('/usr/local/bin/chromium') ? '/usr/local/bin/chromium' : undefined);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:4174/';
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto(url + 'assets/palette.json');
await page.evaluate(() => { document.baseURI; });
const res = await page.evaluate(async () => {
  const names = ['bg.webp', 'mid.webp', 'mid_form.webp', 'table.webp', 'table_form.webp', 'fg.webp', 'strokes.webp', 'petals.webp', 'seedhead.webp', 'canvas.webp'];
  const gl = document.createElement('canvas').getContext('webgl2');
  const read = (src, w, h, viaImg) => {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, viaImg); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.deleteFramebuffer(fb); gl.deleteTexture(tex); return px;
  };
  const out = [];
  for (const n of names) {
    const blob = await (await fetch('/assets/' + n)).blob();
    const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();
    const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const w = img.naturalWidth, h = img.naturalHeight;
    const a = read(img, w, h, true), b = read(bmp, w, h, false);
    let diff = 0, max = 0, alphaPx = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) { diff++; if (d > max) max = d; } }
    for (let i = 3; i < a.length; i += 4) if (a[i] < 255) alphaPx++;
    out.push({ n, w, h, bytes: a.length, differing: diff, maxDiff: max, translucentPx: alphaPx });
  }
  return out;
});
console.table(res);
await browser.close();
process.exit(res.every((r) => r.differing === 0) ? 0 : 1);
