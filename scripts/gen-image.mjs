// Image generation / edit client for an OpenAI-compatible Images API.
// Usage:
//   node scripts/gen-image.mjs art/prompts/<job>.json
// Job JSON: { name, prompt, size?, quality?, background?, inputs?: [paths], model?, output_format? }
// When `inputs` is present the /images/edits endpoint is used (reference-guided edit),
// otherwise /images/generations. Reads IMAGE_API_BASE / IMAGE_API_KEY / IMAGE_MODEL
// from the environment or from .env.local (never committed).
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const f = path.resolve('.env.local');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}
loadEnv();
const BASE = process.env.IMAGE_API_BASE;
const KEY = process.env.IMAGE_API_KEY;
const MODEL_DEFAULT = process.env.IMAGE_MODEL || 'gpt-image-2.5-sunburst';
if (!BASE || !KEY) { console.error('Missing IMAGE_API_BASE / IMAGE_API_KEY'); process.exit(2); }

const jobPath = process.argv[2];
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const outDir = path.resolve(job.outDir || 'art/raw');
fs.mkdirSync(outDir, { recursive: true });
const model = job.model || MODEL_DEFAULT;
const t0 = Date.now();

async function call() {
  let res;
  if (job.inputs && job.inputs.length) {
    const fd = new FormData();
    fd.append('model', model);
    fd.append('prompt', job.prompt);
    if (job.size) fd.append('size', job.size);
    if (job.quality) fd.append('quality', job.quality);
    if (job.background) fd.append('background', job.background);
    if (job.output_format) fd.append('output_format', job.output_format);
    if (job.input_fidelity) fd.append('input_fidelity', job.input_fidelity);
    fd.append('n', '1');
    for (const p of job.inputs) {
      const buf = fs.readFileSync(p);
      const type = p.endsWith('.webp') ? 'image/webp' : p.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
      fd.append(job.inputs.length > 1 ? 'image[]' : 'image', new Blob([buf], { type }), path.basename(p));
    }
    if (job.mask) fd.append('mask', new Blob([fs.readFileSync(job.mask)], { type: 'image/png' }), 'mask.png');
    res = await fetch(`${BASE}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd });
  } else {
    const body = { model, prompt: job.prompt, n: 1 };
    for (const k of ['size', 'quality', 'background', 'output_format', 'moderation']) if (job[k]) body[k] = job[k];
    res = await fetch(`${BASE}/images/generations`, {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

let json, attempt = 0;
while (true) {
  try { json = await call(); break; }
  catch (e) {
    attempt++;
    console.error(`[${job.name}] attempt ${attempt} failed: ${e.message}`);
    if (attempt >= (job.retries ?? 3)) process.exit(1);
    await new Promise(r => setTimeout(r, 4000 * attempt));
  }
}
const item = json.data && json.data[0];
if (!item) { console.error('No data in response', JSON.stringify(json).slice(0, 500)); process.exit(1); }
let buf;
if (item.b64_json) buf = Buffer.from(item.b64_json, 'base64');
else if (item.url) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
const ext = (job.output_format || 'png');
const outFile = path.join(outDir, `${job.name}.${ext}`);
fs.writeFileSync(outFile, buf);
const meta = { name: job.name, model, endpoint: job.inputs ? 'images/edits' : 'images/generations', size: job.size, quality: job.quality,
  background: job.background, inputs: job.inputs || [], prompt: job.prompt, revised_prompt: item.revised_prompt || null,
  usage: json.usage || null, seconds: (Date.now() - t0) / 1000, created: new Date().toISOString(), output: path.relative(process.cwd(), outFile) };
fs.writeFileSync(path.join(outDir, `${job.name}.meta.json`), JSON.stringify(meta, null, 2));
console.log(`[${job.name}] ok ${buf.length} bytes in ${meta.seconds}s -> ${meta.output}`);
