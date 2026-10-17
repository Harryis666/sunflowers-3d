// Replays synthetic devices through the resolution governor (src/gl/governor.ts), no browser needed.
//   node qa/governor.mjs [--verbose] [--compare]
// Each scenario models a display (refresh, vsync quantisation, jitter), how long a frame takes at a
// given resolution (GPU-bound work scales with pixel count, CPU-bound work does not) and which
// chapter is on screen; the governor sees exactly what Engine.adapt feeds it. Reports the final and
// time-averaged resolution, the share of late frames and how often the resolution changed, checked
// against what a good governor should do. --compare also runs the previous one-way rule.
import { Governor } from '../src/gl/governor.ts';

const verbose = process.argv.includes('--verbose');
const compare = process.argv.includes('--compare');

/** the rule before the governor: every 90 frames, average over 26 ms → 0.25 lower, never back up */
class Previous {
  n = 0; sum = 0;
  idle() {}
  frame(ms, now, level) {
    this.sum += ms;
    if (++this.n < 90) return 0;
    const avg = this.sum / this.n; this.n = this.sum = 0;
    return avg > 26 && level > 1 ? Math.max(1, level - 0.25) : 0;
  }
}

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** GPU-bound: `ms` at resolution `base`, scaling with the pixel count */
const px = (ms, base = 1.62) => (t, eff) => ms * (eff / base) ** 2;

function run({ secs = 300, hz = 60, cap = 0, gate = 60, top = 1.62, max = 1.75, work, scene = () => 0, seed = 7 }, G) {
  const g = new G(), rnd = mulberry32(seed);
  const vs = 1000 / (cap || hz);                    // the pace frames are actually presented at
  for (let i = 0; i < gate; i++) g.idle(vs + (rnd() - 0.5) * 0.6);
  const lateAt = Math.max(25, 1.5 * vs);
  let now = 0, level = max, changes = 0, late = 0, frames = 0, area = 0, awake = 0;
  const log = [];
  while (now < secs * 1000) {
    const eff = Math.min(level, top);
    const ms = work(now / 1000, eff, rnd) * (1 + (rnd() - 0.5) * 0.08);
    const dt = Math.max(1, Math.ceil(ms / vs - 0.03)) * vs + (rnd() - 0.5) * 0.5;
    now += dt;
    if (now < 4000) continue;                       // Engine.adapt sleeps through the first 4 s (the intro)
    frames++; area += eff * dt; awake += dt;
    if (dt > lateAt) late++;
    const next = g.frame(dt, now, level, top, max, scene(now / 1000));
    if (next && Math.abs(next - level) > 1e-6) {
      changes++; log.push(`${(now / 1000).toFixed(1)}s ${Math.min(level, top).toFixed(2)}→${Math.min(next, top).toFixed(2)}`);
      level = next;
    }
  }
  return { final: Math.min(level, top), mean: area / awake, late: late / frames, changes, log };
}

const hitchy = (t, eff, rnd) => (rnd() < 1 / 240 ? 70 : 9);   // a lone 70 ms hitch every ~4 s
const S = [
  ['fast desktop, 60 Hz', { work: () => 9 }, (r) => r.changes === 0],
  ['fast desktop, 120 Hz', { hz: 120, work: () => 5 }, (r) => r.changes === 0],
  ['fast, with lone hitches', { work: hitchy }, (r) => r.changes === 0],
  ['GPU-bound (30 ms at full res)', { work: px(30) }, (r) => r.final < 1.01 && r.late < 0.015 && r.changes <= 10],
  ['mildly GPU-bound (20 ms)', { work: px(20) }, (r) => Math.abs(r.final - 1.25) < 0.01 && r.late < 0.01 && r.changes <= 10],
  ['browser held at 30 Hz (fast GPU)', { cap: 30, work: () => 9 }, (r) => r.changes === 0],
  ['30 Hz, gate clicked through at once', { cap: 30, gate: 2, work: () => 9 }, (r) => r.mean > 1.55 && r.changes <= 4],
  ['CPU-bound (28 ms whatever the res)', { work: () => 28 }, (r) => r.mean > 1.55 && r.changes <= 4],
  ['phone, 30 Hz, 45 ms at full res', { cap: 30, top: 1.6, max: 1.6, work: px(45, 1.6) }, (r) => r.final < 1.36 && r.late < 0.015 && r.changes <= 8],
  ['heavy for 8 s, same chapter', { work: (t, e) => (t > 60 && t < 68 ? px(30)(t, e) : 9) }, (r) => r.final > 1.61 && r.mean > 1.5 && r.changes <= 6],
  ['heavy chapter, then a light one', { secs: 90, scene: (t) => (t < 40 ? 1 : 2), work: (t, e) => (t < 40 ? px(30)(t, e) : 9) }, (r) => r.final > 1.61 && r.late < 0.03 && r.changes <= 8],
  ['heavy / light chapters, 20 s each', { scene: (t) => (Math.floor(t / 20) % 2 ? 2 : 1), work: (t, e) => (Math.floor(t / 20) % 2 ? 9 : px(24)(t, e)) }, (r) => r.late < 0.01 && r.mean > 1.35],
  ['a full story pass', {
    secs: 150,
    scene: (t) => (t < 15 ? 0 : t < 45 ? 1 : t < 75 ? 2 : t < 115 ? 3 : 4),
    work: (t, e) => (t < 15 ? 9 : t < 45 ? px(26)(t, e) : t < 75 ? px(19)(t, e) : t < 115 ? 9 : px(17)(t, e)),
  }, (r) => r.changes <= 10 && r.late < 0.02 && r.mean > 1.45],
  ['huge screen (pixel budget 0.96)', { top: 0.96, work: px(30, 0.96) }, (r) => r.changes === 0],
];

const f = (r) => `final ${r.final.toFixed(2)} · mean ${r.mean.toFixed(2)} · late ${(r.late * 100).toFixed(1)} % · ${r.changes} changes`;
let fails = 0;
for (const [name, o, ok] of S) {
  const r = run(o, Governor), pass = ok(r);
  if (!pass) fails++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name.padEnd(38)} ${f(r)}`);
  if (verbose && r.log.length) console.log('       ' + r.log.join(' · '));
  if (compare) { const p = run(o, Previous); console.log(`     ${'previous rule'.padEnd(38)} ${f(p)}`); }
}
console.log(fails ? `${fails} scenario(s) failed` : `all ${S.length} scenarios behave`);
process.exit(fails ? 1 : 0);
