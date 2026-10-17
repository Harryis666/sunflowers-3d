import { defineConfig, type Plugin, type HtmlTagDescriptor } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync, statSync } from 'node:fs';
import { bootLoaderHtml } from './src/lib/bootLoader';

// Byte size of every runtime asset, baked into the bundle so the loader can show true,
// byte-accurate progress from the first chunk on (even if a host omits Content-Length).
const ASSET_DIR = new URL('./public/assets/', import.meta.url);
const assetBytes: Record<string, number> = {};
try { for (const f of readdirSync(ASSET_DIR)) assetBytes[f] = statSync(new URL(f, ASSET_DIR)).size; } catch { /* restored on demand */ }

// Textures are deliberately *not* preloaded from the HTML: on a slow line they would compete with
// the JavaScript for bandwidth and the progress display could not start until much later. The
// bundle requests them itself the moment it is evaluated (see gl/assets.ts → prefetchScene).
const PRELOAD = ['palette.json'];

/** Writes the static sunflower loader into index.html and adds font/asset preloads. */
function bootScreen(): Plugin {
  return {
    name: 'sunflowers-boot-screen',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const tags: HtmlTagDescriptor[] = [];
        // the loader's Latin + calligraphy faces (title, subtitle, figures): requested in parallel
        // with the CSS instead of after it, so the first screen appears already typeset
        const order = ['mashanzheng', 'fraunces-italic', 'fraunces-latin'];
        const rank = (n: string) => order.findIndex((k) => n.includes(k));
        const fonts = ctx.bundle ? Object.values(ctx.bundle).filter((f) => f.type === 'asset' && f.fileName.endsWith('.woff2') && rank(f.fileName) >= 0).map((f) => f.fileName) : [];
        fonts.sort((a, b) => rank(a) - rank(b)).forEach((f, i) => tags.push({
          tag: 'link', injectTo: 'head',
          attrs: { rel: 'preload', href: './' + f, as: 'font', type: 'font/woff2', crossorigin: '', ...(i === 0 ? { fetchpriority: 'high' } : {}) },
        }));
        for (const a of PRELOAD) if (assetBytes[a]) tags.push({ tag: 'link', injectTo: 'head', attrs: { rel: 'preload', href: './assets/' + a, as: 'fetch', crossorigin: '' } });
        return { html: html.replace('<!--boot-loader-->', bootLoaderHtml()), tags };
      },
    },
  };
}

// `base: './'` keeps the build relocatable (open dist/ from any sub-path or static host).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), bootScreen()],
  define: { __ASSET_BYTES__: JSON.stringify(assetBytes) },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  server: { host: true },
});
