// "Hear the yellows": a small Web Audio instrument. Lighter yellows ring higher,
// more saturated yellows ring brighter. Pentatonic so every gesture is consonant.
const PENTA = [0, 2, 4, 7, 9];

/** one call to the instrument, as logged in capture mode (t = performance.now()) */
export interface SynthEvent { t: number; k: 'enable' | 'note'; on?: boolean; a?: [number, number, number, number] }

class Synth {
  /** the live context (created on the first gesture) */
  ctx: AudioContext | null = null;
  master!: GainNode;
  wet!: GainNode;
  enabled = false;
  /** capture mode (?capture): calls are logged with their time instead of played */
  log: SynthEvent[] | null = null;
  /** offline rendering: the time (s) the current call happens at */
  clock: number | null = null;
  private ac: BaseAudioContext | null = null;
  private last = 0;
  private pad: { stop: () => void } | null = null;

  private now() { return this.clock ?? this.ac!.currentTime; }

  init(offline?: BaseAudioContext) {
    if (this.ac || this.log) return;
    let ctx: BaseAudioContext;
    if (offline) ctx = offline;
    else {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      ctx = this.ctx = new AC();
    }
    this.ac = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master = ctx.createGain(); this.master.gain.value = 0.0;
    const rev = ctx.createConvolver(); rev.buffer = this.impulse(2.8, 2.6);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.32;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.wet.connect(rev); rev.connect(comp);
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ac!; const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setEnabled(on: boolean) {
    if (this.log) { this.log.push({ t: performance.now(), k: 'enable', on }); this.enabled = on; return; }
    this.init();
    if (!this.ac) return;
    this.enabled = on;
    if (on && this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.now();
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.25);
    if (on && !this.pad) this.startPad();
  }

  private startPad() {
    const ctx = this.ac!, t0 = this.now(); const out = ctx.createGain(); out.gain.value = 0.0;
    out.connect(this.master); out.connect(this.wet);
    out.gain.setTargetAtTime(0.035, t0, 3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out);
    const freqs = [130.81, 196.0, 261.63, 329.63];
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      const g = ctx.createGain(); g.gain.value = 0.25;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.031;
      const lg = ctx.createGain(); lg.gain.value = 0.18; lfo.connect(lg); lg.connect(g.gain); lfo.start(t0);
      o.connect(g); g.connect(lp); o.start(t0);
      return [o, lfo];
    });
    this.pad = { stop: () => oscs.forEach(([o, l]) => { o.stop(); l.stop(); }) };
  }

  /** rank 0..1 (dark→light), chroma 0..1, pan -1..1 */
  note(rank: number, chroma = 0.5, pan = 0, vel = 1, force = false) {
    if (!this.enabled || (!this.ac && !this.log)) return;
    const now = performance.now();
    if (!force && now - this.last < 70) return;
    this.last = now;
    if (this.log) { this.log.push({ t: now, k: 'note', a: [rank, chroma, pan, vel] }); return; }
    const ctx = this.ac!; const t = this.now() + 0.005;
    const steps = Math.round(rank * 14);
    const midi = 55 + 12 * Math.floor(steps / 5) + PENTA[steps % 5];
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p); p.connect(this.master); p.connect(this.wet);
    const peak = 0.16 * vel;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.6 + chroma);
    const partials: Array<[number, number, OscillatorType]> = [[1, 1, 'sine'], [2, 0.32 + chroma * 0.3, 'sine'], [3.01, 0.12 + chroma * 0.15, 'triangle'], [4.2, 0.05, 'sine']];
    for (const [mul, amp, type] of partials) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
      const og = ctx.createGain(); og.gain.value = amp;
      og.gain.setValueAtTime(amp, t); og.gain.exponentialRampToValueAtTime(0.0005, t + (mul > 1 ? 0.5 : 1.8));
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 2.6);
    }
  }

  /** a little sunburst arpeggio for clicked flowers */
  chord(rank: number, pan = 0) {
    if (!this.enabled) return;
    [0, 0.2, 0.4, 0.62].forEach((dr, i) => setTimeout(() => this.note(Math.min(1, rank * 0.5 + dr), 0.8, pan, 0.9 - i * 0.12, true), i * 85));
  }
}

export const synth = new Synth();

/**
 * Capture mode: play a logged session into an OfflineAudioContext — the very same instrument,
 * note for note, at the times the recorder's clock gave them (relative to `from`, in ms).
 */
export async function renderSession(log: SynthEvent[], from: number, seconds: number, rate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const s = new Synth(); s.init(ctx);
  for (const e of log) {
    s.clock = Math.max(0, (e.t - from) / 1000);
    if (e.k === 'enable') s.setEnabled(!!e.on);
    else if (e.a) s.note(e.a[0], e.a[1], e.a[2], e.a[3], true);
  }
  return ctx.startRendering();
}
