#!/usr/bin/env node
// Decode assets-encoded/*.b64 back into the binary files listed in assets-encoded/manifest.json,
// verifying each sha256. Files that already exist with the right checksum are left alone.
//   node scripts/restore-assets.mjs          (also runs automatically before dev / build)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAN = join(ROOT, 'assets-encoded', 'manifest.json');
const sha = (b) => createHash('sha256').update(b).digest('hex');

if (!existsSync(MAN)) {
  console.log('[assets] no assets-encoded/manifest.json — using files already on disk');
  process.exit(0);
}
const { files } = JSON.parse(readFileSync(MAN, 'utf8'));
let restored = 0, ok = 0;
for (const f of files) {
  const dest = join(ROOT, f.path);
  if (existsSync(dest) && sha(readFileSync(dest)) === f.sha256) { ok++; continue; }
  const missing = f.parts.filter((p) => !existsSync(join(ROOT, p)));
  if (missing.length) { console.error(`[assets] missing ${missing.join(', ')} for ${f.path}`); process.exit(1); }
  const buf = Buffer.from(f.parts.map((p) => readFileSync(join(ROOT, p), 'utf8')).join('').replace(/\s+/g, ''), 'base64');
  if (sha(buf) !== f.sha256) { console.error(`[assets] checksum mismatch for ${f.path}`); process.exit(1); }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  restored++;
}
console.log(`[assets] ${restored} restored, ${ok} already up to date`);
