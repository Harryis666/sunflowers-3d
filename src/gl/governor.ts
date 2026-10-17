/**
 * Resolution governor: picks the render resolution (device-pixel ratio) from measured frame times.
 *
 * The scene's cost is almost all fragment shading, so resolution is the one knob that buys frame
 * time without touching the look. The governor never guesses; it tries, and keeps what works.
 *  · Frames are judged in windows of 30. A frame is "late" when it misses the display's pace
 *    (1.5 refresh intervals, at least 25 ms). The refresh interval is learnt while the loader gate
 *    idles and refined from the quickest frames, so a browser held at 30 Hz is not taken for a
 *    slow GPU.
 *  · Two slow windows in a row → one step down the grid (max, max − 0.25, … : 1.75 · 1.5 · 1.25 · 1
 *    on desktop), judged one window later: clearly better → keep it; no better → one more step;
 *    no better even at the floor → the frames are not limited by pixels (CPU-bound, or the browser
 *    pacing frames): the full resolution comes back, that pace becomes the yardstick, and any
 *    further attempt waits (45 s → 5 min).
 *  · Calm for 8 windows → one step up, on trial: the moment it produces 8 late frames it is
 *    taken back, so a retry costs a few frames instead of seconds of stutter.
 *  · Each chapter remembers the most it could afford: coming back to a heavy chapter steps down
 *    at once instead of stuttering first, and a level that failed there is retried only after a
 *    pause that doubles with every failure (30 s → 4 min) and resets once a retry holds.
 * Pure logic, no DOM: qa/governor.mjs replays synthetic devices through it.
 */
const WINDOW = 30;          // frames per verdict (≈ 0.5 s at 60 Hz)
const LATE_MS = 25;         // a frame is late beyond max(this, 1.5 refresh intervals)
const SLOW = 8;             // late frames that make a window slow (or fail a step up)
const CALM = 1;             // at most this many late frames in a calm window
const STEP = 0.25;          // resolution grid: max − k·STEP
const CALM_WINDOWS = 8;     // calm windows in a row before trying one step sharper
const UP_WAIT = 30000, UP_WAIT_MAX = 240000;      // per chapter, before retrying a level that failed there
const DROP_WAIT = 45000, DROP_WAIT_MAX = 300000;  // after a step down that did not help at all

/** the next grid level under `eff`, never below `floor` */
const below = (eff: number, max: number, floor: number) =>
  Math.max(floor, max - (Math.floor((max - eff) / STEP + 1e-6) + 1) * STEP);
/** the next grid level over `eff`, never above `top` */
const above = (eff: number, max: number, top: number) =>
  Math.min(top, max - Math.max(0, Math.ceil((max - eff) / STEP - 1e-6) - 1) * STEP);

export class Governor {
  private n = 0; private late = 0; private sum = 0; private prevAvg = 0;
  private buf = new Float32Array(WINDOW);
  private idleBuf = new Float32Array(48); private idleN = 0;
  private refresh = 0; private lateMs = LATE_MS;
  private slow = 0; private calm = 0;
  /** a step down under test: windows since, its chapter, the frame time before it, the level to undo to */
  private check = 0; private checkScene = -1; private base = 0; private undo = 0;
  private noDropUntil = 0; private dropWait = DROP_WAIT;
  /** a step up under test: windows since, the level it came from, late frames since */
  private trial = 0; private trialFrom = 0; private trialLate = 0;
  /** per chapter: the most it could afford (0 = no limit known), and when to try for more again */
  private need = new Float64Array(8); private noUpUntil = new Float64Array(8);
  private upWait = new Float64Array(8).fill(UP_WAIT);
  private scene = -1;

  /** a frame interval measured while nothing heavy is drawn (the loader gate): the display's own pace */
  idle(ms: number) {
    if (ms > 4 && ms < 100) this.idleBuf[this.idleN++ % this.idleBuf.length] = ms;
  }

  /** the display's refresh interval as measured so far (ms; 0 before the first frame) */
  get pace() { return this.refresh; }

  /**
   * Feed one rendered frame. `level` is the current DPR, `top` the most this screen may use (pixel
   * budget), `max` the grid's anchor, `scene` the chapter. Returns a new DPR, or 0 to keep it.
   */
  frame(ms: number, now: number, level: number, top: number, max: number, scene = 0): number {
    if (!this.refresh) {
      const k = Math.min(this.idleN, this.idleBuf.length);
      if (k >= 6) {
        const s = Array.from(this.idleBuf.subarray(0, k)).sort((a, b) => a - b);
        this.refresh = s[Math.floor(k * 0.25)];
      } else this.refresh = 1000 / 60;
      this.lateMs = Math.max(LATE_MS, 1.5 * this.refresh);
    }
    const eff = Math.min(level, top), floor = Math.min(1, top), sc = scene & 7;

    if (sc !== this.scene) {                        // a new chapter: fresh evidence
      this.scene = sc; this.trial = 0; this.slow = this.calm = 0;
      const need = this.need[sc];
      if (need && !this.check && eff > Math.min(need, top) + 0.01) {
        this.n = this.late = this.sum = 0;
        return need;                                // known to need less: go there before it stutters
      }
    }

    this.buf[this.n++] = ms; this.sum += ms;
    if (ms > this.lateMs) {
      this.late++;
      if (this.trial && ++this.trialLate >= SLOW) { // the step up is too much here: take it back now
        this.trial = 0; this.n = this.late = this.sum = 0; this.slow = this.calm = 0;
        this.need[sc] = this.trialFrom;
        this.upWait[sc] = Math.min(this.upWait[sc] * 2, UP_WAIT_MAX);
        this.noUpUntil[sc] = now + this.upWait[sc];
        return this.trialFrom;
      }
    }
    if (this.n < WINDOW) return 0;
    const avg = this.sum / WINDOW, late = this.late, prev = this.prevAvg;
    this.prevAvg = avg; this.n = this.late = this.sum = 0;
    this.buf.sort();
    const quick = this.buf[3];                      // a display faster than assumed shows in its quickest frames
    if (quick > 4 && quick < this.refresh * 0.85) { this.refresh = quick; this.lateMs = Math.max(LATE_MS, 1.5 * quick); }

    if (this.trial && ++this.trial > 2) {           // two windows without trouble: the step up holds
      this.trial = 0; this.upWait[sc] = UP_WAIT;
      if (this.need[sc] && level > this.need[sc] + 0.01) this.need[sc] = 0;
    }
    if (this.check && ++this.check > 1) {           // verdict on the step down
      this.check = 0;
      if (late >= SLOW && avg > this.base * 0.9) {
        this.slow = this.calm = 0;
        if (eff > floor + 0.01) { this.check = 1; return below(eff, max, floor); }   // no better yet: one more
        // not even the floor helped: pixels are not the limit (CPU-bound, or the browser paces frames),
        // so give the sharpness back and take this pace as the device's own
        if (sc === this.checkScene) {
          const pace = this.buf[WINDOW >> 1];
          if (pace > this.refresh) { this.refresh = pace; this.lateMs = Math.max(LATE_MS, 1.5 * pace); }
        }
        this.noDropUntil = now + this.dropWait; this.dropWait = Math.min(this.dropWait * 2, DROP_WAIT_MAX);
        return this.undo;
      }
      if (sc === this.checkScene) { this.need[sc] = level; this.noUpUntil[sc] = now + this.upWait[sc]; }
    }

    if (late >= SLOW) {
      this.calm = 0;
      if (++this.slow >= 2 && !this.check && !this.trial && eff > floor + 0.01 && now >= this.noDropUntil) {
        this.slow = 0; this.check = 1; this.checkScene = sc; this.base = (avg + prev) / 2; this.undo = level;
        return below(eff, max, floor);
      }
      return 0;
    }
    this.slow = 0;
    if (late > CALM) { this.calm = 0; return 0; }
    if (++this.calm >= CALM_WINDOWS && !this.check && !this.trial && level < top - 0.01 && now >= this.noUpUntil[sc]) {
      this.calm = 0; this.trial = 1; this.trialFrom = level; this.trialLate = 0;
      return above(eff, max, top);
    }
    return 0;
  }
}
