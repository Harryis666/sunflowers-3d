#!/usr/bin/env node
// Encode every binary asset as wrapped base64 text (+ sha256 manifest) under assets-encoded/.
// The repository is synced through a text-only API, so binaries travel as .b64 parts and are
// decoded again by scripts/restore-assets.mjs (runs automatically before `npm run dev/build`).
//   node scripts/encode-assets.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets-encoded');
const GROUPS = [
  ['public/assets', /\.(webp|png|jpe?g)$/i, 'site textures'],
  ['src/assets/fonts', /\.woff2$/i, 'subset web fonts'],
  ['art/raw', /\.webp$/i, 'archived AI generations (WebP q90 of the original PNGs)'],
];
const WRAP = 100;          // chars per line
const PART = 600_000;      // max chars per .b64 part (keeps every upload well under 1 MiB)

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const files = [];
let total = 0;
for (const [dir, re, note] of GROUPS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const name of readdirSync(abs).filter((n) => re.test(n)).sort()) {
    const rel = `${dir}/${name}`;
    const buf = readFileSync(join(abs, name));
    const b64 = buf.toString('base64');
    const lines = b64.match(new RegExp(`.{1,${WRAP}}`, 'g')) ?? [];
    const perPart = Math.floor(PART / (WRAP + 1));
    const parts = [];
    for (let i = 0, k = 0; i < lines.length; i += perPart, k++) {
      const id = rel.replace(/[\\/]/g, '__') + (lines.length > perPart ? `.part${k}` : '') + '.b64';
      writeFileSync(join(OUT, id), lines.slice(i, i + perPart).join('\n') + '\n');
      parts.push(`assets-encoded/${id}`);
    }
    files.push({ path: rel, group: note, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), parts });
    total += buf.length;
  }
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ version: 1, encoding: 'base64', wrap: WRAP, files }, null, 2) + '\n');
console.log(`encoded ${files.length} files (${(total / 1024 / 1024).toFixed(2)} MB) -> assets-encoded/`);
