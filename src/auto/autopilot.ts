import { store } from '../store';
import type { Engine } from '../gl/Engine';
import { AUTO } from '../content';
import { END, MOVES, PRESSES, SCROLL, type Move, type Point, type ScrollTarget } from './storyboard';

/**
 * Auto mode — a hands-free visit of the whole site, for a screen in a room or a screen recording.
 *
 * It plays the storyboard (storyboard.ts) one step per drawn frame, from inside the engine's own
 * frame (Engine.beforeFrame: the display's pace, or the filming clock under ?capture). It scrolls,
 * and it steers a visible sunflower cursor that hovers, clicks, holds and drags by sending the very
 * pointer events a mouse would to whatever lies under it — so every effect, sound included, runs
 * through the site's ordinary code, exactly as for a visitor.
 *
 * Meanwhile a transparent shield holds off the real mouse, wheel, touch and scrolling keys (a stray
 * nudge can't spoil a recording); a click shows how to leave: Esc, or the pill. ?auto=loop plays it
 * over and over (a kiosk); otherwise the cursor bows out after the last beat and the page is yours.
 */

type Phase = 'off' | 'rewind' | 'tour' | 'rest' | 'bow';

const PID = 9;   // a pointer id no real device uses (so setPointerCapture can never grab the real mouse)
const STEPS = PRESSES.flatMap(([a, b]): Array<[number, boolean]> => [[a, true], [b, false]]).sort((p, q) => p[0] - q[0]);
const UI = 'button, a, input, select, textarea, label, [data-ui]';   // what the engine treats as interface, not painting
const SCROLL_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Tab']);
const valueSetter = typeof HTMLInputElement === 'undefined' ? undefined : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
const bez = (p0: number, c1: number, c2: number, p1: number, t: number) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1; };
const thumbW = (el: HTMLInputElement) => (el.classList.contains('yellow-range') ? 30 : 16);
const sharedAncestor = (a: Element, b: Element) => { for (let n: Element | null = a; n; n = n.parentElement) if (n.contains(b)) return n; return null; };
const chain = (el: Element | null) => { const a: Element[] = []; for (let n = el; n; n = n.parentElement) a.push(n); return a; };

/** where a click/keypress that starts the tour happened (a keyboard "click" has no position: use the control's centre) */
export function startPoint(e?: { clientX: number; clientY: number; detail: number; currentTarget: EventTarget | null }): [number, number] | undefined {
  if (!e) return undefined;
  if (e.detail > 0) return [e.clientX, e.clientY];
  const el = e.currentTarget instanceof Element ? e.currentTarget : null;
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

class Autopilot {
  /** ?auto=loop: play the tour over and over */
  readonly loop = typeof location !== 'undefined' && /[?&]auto=loop\b/.test(location.search);
  /** seconds from the start to the last beat */
  readonly duration = END;

  private engine: Engine | null = null;
  private phase: Phase = 'off';
  private t = 0; private last = -1;
  private pos: Point = [0.5, 0.5];
  private rewindFrom = 0; private rewindDur = 1; private rewindPos: Point = [0.5, 0.5];
  private moves = new Map<Move, { from: Point; to: Point }>();
  private step = 0;
  // the pointer as the page last heard of it
  private px = NaN; private py = NaN; private sy = NaN;
  private over: Element | null = null; private hoverEl: Element | null = null;
  private down = false; private downOn: Element | null = null;
  private range: { el: HTMLInputElement; grab: number } | null = null;
  // what it looks like
  private cursor: HTMLElement | null = null;
  private shield: HTMLDivElement | null = null; private fx: HTMLDivElement | null = null;
  private lean = 0; private leanS = ''; private lx = NaN;
  private nudgeT = 0; private hadCursor = false;

  attach(e: Engine | null) { if (!e) this.stop(); this.engine = e; }
  get running() { return this.phase !== 'off'; }

  /** start the tour (from the gate, or from anywhere on the page: it first glides back to the top) */
  start(opts: { at?: [number, number] } = {}) {
    const e = this.engine;
    if (!e || this.phase !== 'off' || !store.get().entered) return false;
    const W = innerWidth, H = innerHeight, p = e.fr.pointer;
    const at = opts.at ?? (p.inside ? [p.cx, p.cy] as [number, number] : [W * 0.5, H * 0.62] as [number, number]);
    this.pos = [clamp01(at[0] / W), clamp01(at[1] / H)];
    this.px = this.py = this.sy = this.lx = NaN; this.last = -1; this.lean = 0; this.leanS = '';
    this.over = null; this.down = false; this.downOn = null; this.range = null;
    this.reset();
    this.mount();
    e.pilot(true);
    e.beforeFrame = this.frame;
    store.set({ auto: true });
    if (window.scrollY < 2) this.begin(); else this.rewind();
    this.ripple(at[0], at[1]);   // the click that started it
    return true;
  }

  /** hand the page back (Esc, the pill, or after the last beat) */
  stop() {
    if (this.phase === 'off') return;
    this.phase = 'off';
    if (this.down) this.release(false);
    if (this.over) this.cross(null, this.px, this.py);
    this.mark(null);
    const e = this.engine;
    if (e) { if (e.beforeFrame === this.frame) e.beforeFrame = null; e.pilot(false); }
    removeEventListener('keydown', this.onKey, true);
    clearTimeout(this.nudgeT);
    this.shield?.remove(); this.shield = null;
    const fx = this.fx; this.fx = null;
    if (fx) setTimeout(() => fx.remove(), 1000);   // let the last ripple finish
    const h = document.documentElement;
    h.classList.remove('autopilot', 'auto-bow', 'auto-nudge');
    if (!this.hadCursor) h.classList.remove('has-sun-cursor');
    this.cursor?.removeAttribute('data-press'); this.cursor?.style.removeProperty('--lean');
    store.set({ auto: false });
  }

  // ---------------------------------------------------------------- phases
  private begin() { this.phase = 'tour'; this.t = 0; this.step = 0; this.moves.clear(); }
  private rewind() {
    this.phase = 'rewind'; this.t = 0;
    this.rewindFrom = window.scrollY; this.rewindPos = [...this.pos];
    this.rewindDur = Math.max(1.2, Math.min(4.2, 1.2 + (window.scrollY / innerHeight) * 0.22));
  }
  /** the interactive state a tour expects to find (the scroll-driven rest follows the page by itself) */
  private reset() { store.set({ spirals: false, pinYellow: -1, hoverYellow: -1, ageTouched: false, raking: false }); }

  private frame = (now: number) => {
    const dt = this.last < 0 ? 0 : Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    let y: number | null = null;
    if (this.phase === 'rewind') {
      const u = clamp01(this.t / this.rewindDur), k = ease(u);
      y = this.rewindFrom * (1 - k);
      this.pos = [lerp(this.rewindPos[0], 0.5, k), lerp(this.rewindPos[1], 0.42, k)];
      if (u >= 1) this.begin();
    } else if (this.phase === 'tour') {
      y = this.scrollAt(this.t);
      this.pos = this.mouseAt(this.t);
    } else if (this.phase === 'rest' && this.t >= 2.5) {
      this.reset();
      dispatchEvent(new CustomEvent('sf:studio-clear'));   // a fresh canvas for the next round
      this.rewind();
    } else if (this.phase === 'bow' && this.t >= 0.75) {
      this.stop();
      return;
    }
    if (y !== null) this.scroll(y);
    this.pointer(this.pos[0] * innerWidth, this.pos[1] * innerHeight);
    if (this.phase === 'tour') {
      while (this.step < STEPS.length && STEPS[this.step][0] <= this.t) { if (STEPS[this.step++][1]) this.press(); else this.release(); }
      if (this.t >= END) {
        this.t = 0;
        if (this.loop) this.phase = 'rest';
        else { this.phase = 'bow'; document.documentElement.classList.add('auto-bow'); }
      }
    }
    this.skin(dt);
  };

  // ---------------------------------------------------------------- the storyboard, evaluated
  private top(k: ScrollTarget) { return typeof k === 'number' ? k : this.engine!.sectionTop(k[0]) + k[1] * innerHeight; }
  private scrollAt(t: number) {
    let i = 0; while (i < SCROLL.length - 1 && SCROLL[i + 1][0] <= t) i++;
    if (i >= SCROLL.length - 1) return this.top(SCROLL[SCROLL.length - 1][1]);
    const [ta, a] = SCROLL[i], [tb, b] = SCROLL[i + 1];
    return lerp(this.top(a), this.top(b), ease(clamp01((t - ta) / (tb - ta))));
  }

  private mouseAt(t: number): Point {
    let active: Move | null = null;
    for (const m of MOVES) if (t >= m.t && t <= m.t + m.d) active = m;
    if (!active) {   // between moves: hold where the last one ended
      let done: Move | null = null; for (const m of MOVES) if (t > m.t + m.d) done = m;
      if (done?.path) return done.path(1);
      return (done && this.moves.get(done)?.to) || this.pos;
    }
    let s = this.moves.get(active);
    if (!s) { s = { from: [...this.pos], to: active.path ? this.pos : this.resolve(active) }; this.moves.set(active, s); }
    const u = clamp01((t - active.t) / active.d);
    if (active.path) return active.path(u);
    const W = innerWidth, H = innerHeight, [x0, y0] = s.from, [x1, y1] = s.to;
    const dx = (x1 - x0) * W, dy = (y1 - y0) * H, len = Math.hypot(dx, dy) || 1, bend = active.bend ?? 0;
    const nx = (-dy / len) * bend * len / W, ny = (dx / len) * bend * len / H;
    const k = easeSine(u) * 0.35 + ease(u) * 0.65;
    return [bez(x0, lerp(x0, x1, 0.3) + nx, lerp(x0, x1, 0.7) + nx, x1, k), bez(y0, lerp(y0, y1, 0.3) + ny, lerp(y0, y1, 0.7) + ny, y1, k)];
  }

  /** is this spot on a card or control (what the engine won't light, hold or poke)? */
  private onUi(p: Point) { return !!this.hit(p[0] * innerWidth, p[1] * innerHeight)?.closest(UI); }

  /**
   * The storyboard's fixed spots are chosen for a 16:9 screen; on a smaller or narrower one a card can
   * sit there instead (the hero's text, say, under the raking-light hold). Then take the nearest clear
   * spot — but only when the page stands still for the move, so the layout read now is the one it lands on.
   */
  private clear(p: Point, m: Move): Point {
    if (Math.abs(this.scrollAt(m.t) - this.scrollAt(m.t + m.d)) > 2 || !this.onUi(p)) return p;
    const ar = innerHeight / innerWidth;
    for (let r = 0.03; r <= 0.3; r += 0.03) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, q: Point = [p[0] + Math.cos(a) * r * ar, p[1] + Math.sin(a) * r];
        if (q[0] > 0.03 && q[0] < 0.97 && q[1] > 0.1 && q[1] < 0.94 && !this.onUi(q)) return q;
      }
    }
    return p;
  }

  /** a storyboard place, read from the live layout */
  private resolve(m: Move): Point {
    const to = m.to!;
    if (typeof to !== 'string') return this.clear(to, m);
    const e = this.engine!, W = innerWidth, H = innerHeight;
    const box = (sel: string, fx: number, fy: number): Point => {
      const el = document.querySelector(sel); if (!el) return this.pos;
      const r = el.getBoundingClientRect();
      return [(r.left + r.width * fx) / W, (r.top + r.height * fy) / H];
    };
    const age = (f: (r: DOMRect, el: HTMLInputElement) => number): Point => {
      const el = document.querySelector<HTMLInputElement>('#age'); if (!el) return this.pos;
      const r = el.getBoundingClientRect();
      return [f(r, el) / W, (r.top + r.height / 2) / H];
    };
    let p: Point;
    switch (to) {
      case 'flower': {   // the biggest flower that isn't under a card
        const f = e.flowerSpots().find((c) => !this.onUi([c.x, c.y]));
        p = f ? [f.x, f.y] : [0.45, 0.4];
        break;
      }
      case 'discA': { const [x, y] = e.discPoint(); p = [x - 0.1, y - 0.2]; break; }
      case 'discB': { const [x, y] = e.discPoint(); p = [x + 0.03, y + 0.17]; break; }
      case 'railA': p = box('[aria-label="三十三种黄"] button:nth-child(3)', 0.5, 0.6); break;
      case 'railB': p = box('[aria-label="三十三种黄"] button:nth-child(22)', 0.5, 0.6); break;
      case 'spirals': p = box('section[data-section="bloom"] article button', 0.5, 0.5); break;
      case 'ageThumb': p = age((r, el) => { const th = thumbW(el); return r.left + th / 2 + (Number(el.value) / Number(el.max || 100)) * (r.width - th); }); break;
      case 'ageLeft': p = age((r) => r.left + 4); break;
      case 'ageMid': p = age((r) => r.left + r.width * 0.58); break;
      case 'chipBlue': p = box('section[data-section="studio"] [role="radio"][aria-label^="普鲁士蓝"]', 0.5, 0.5); break;
      case 'strokeA': p = box('section[data-section="studio"] canvas', 0.2, 0.32); break;
      case 'strokeB': p = box('section[data-section="studio"] canvas', 0.62, 0.22); break;
      case 'strokeC': p = box('section[data-section="studio"] canvas', 0.3, 0.6); break;
      default: p = box('section[data-section="studio"] canvas', 0.78, 0.5);
    }
    return [Math.min(0.995, Math.max(0.005, p[0])), Math.min(0.995, Math.max(0.005, p[1]))];
  }

  private scroll(y: number) {
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    y = Math.max(0, Math.min(max, y));
    if (Math.abs(y - window.scrollY) < 0.25) return;
    const L = this.engine?.lenis;
    if (L) L.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
  }

  // ---------------------------------------------------------------- the pointer, as the page hears it
  private ev(type: string, x: number, y: number, o: PointerEventInit = {}, bubbles = true) {
    return new PointerEvent(type, {
      bubbles, cancelable: bubbles, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y,
      pointerId: PID, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, button: -1, buttons: this.down ? 1 : 0, pressure: this.down ? 0.5 : 0, ...o,
    });
  }

  /** the element a real mouse would be over (anything but the shield) */
  private hit(x: number, y: number): Element | null {
    if (!(x >= 0 && y >= 0 && x < innerWidth && y < innerHeight)) return null;
    for (const el of document.elementsFromPoint(x, y)) if (!this.shield?.contains(el)) return el;
    return null;
  }

  private pointer(x: number, y: number) {
    const moved = !(Math.abs(x - this.px) < 0.05 && Math.abs(y - this.py) < 0.05);
    const sy = window.scrollY;
    if (!moved && sy === this.sy) return;
    this.sy = sy;
    const over = this.hit(x, y);
    if (over !== this.over) this.cross(over, x, y);     // also when the page scrolls under a still cursor, like a mouse
    if (!moved) return;
    this.px = x; this.py = y;
    (over ?? document.documentElement).dispatchEvent(this.ev('pointermove', x, y));
    if (this.range) this.slide(x);
  }

  /** boundary events, as the browser sends them (React builds onPointerEnter / onPointerLeave from over/out) */
  private cross(next: Element | null, x: number, y: number) {
    const prev = this.over && this.over.isConnected ? this.over : null;
    this.over = next;
    const pa = chain(prev), na = chain(next), shared = new Set(pa.filter((n) => na.includes(n)));
    if (prev) {
      prev.dispatchEvent(this.ev('pointerout', x, y, { relatedTarget: next }));
      for (const n of pa) { if (shared.has(n)) break; n.dispatchEvent(this.ev('pointerleave', x, y, { relatedTarget: next }, false)); }
    }
    if (next) {
      next.dispatchEvent(this.ev('pointerover', x, y, { relatedTarget: prev }));
      for (const n of na.filter((m) => !shared.has(m)).reverse()) n.dispatchEvent(this.ev('pointerenter', x, y, { relatedTarget: prev }, false));
    }
    this.mark(next);
  }

  /** synthetic events don't set :hover — mark the control instead (styles.css mirrors its hover look) */
  private mark(el: Element | null) {
    const h = el?.closest('button, a, [role="radio"], label') ?? null;
    if (h === this.hoverEl) return;
    this.hoverEl?.removeAttribute('data-hover');
    h?.setAttribute('data-hover', '');
    this.hoverEl = h;
  }

  private press() {
    if (this.down || Number.isNaN(this.px)) return;
    const x = this.px, y = this.py, el = this.over ?? document.documentElement;
    this.down = true; this.downOn = el;
    el.dispatchEvent(this.ev('pointerdown', x, y, { button: 0, buttons: 1, pressure: 0.5 }));
    const r = el.closest('input[type="range"]') as HTMLInputElement | null;
    if (r && !r.disabled) { this.grab(r, x); this.slide(x); }
    this.ripple(x, y);
    this.cursor?.setAttribute('data-press', '');
  }

  private release(click = true) {
    if (!this.down) return;
    const x = this.px, y = this.py, el = this.over ?? document.documentElement;
    this.down = false;
    el.dispatchEvent(this.ev('pointerup', x, y, { button: 0, buttons: 0, pressure: 0 }));
    if (this.range) { this.range.el.dispatchEvent(new Event('change', { bubbles: true })); this.range = null; }
    const from = this.downOn; this.downOn = null;
    if (click && from?.isConnected) {
      sharedAncestor(from, el)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, detail: 1 }));
    }
    this.cursor?.removeAttribute('data-press');
  }

  /** a range input follows the drag as it would natively (grabbed by the thumb: keeps the offset; on the track: jumps) */
  private grab(el: HTMLInputElement, x: number) {
    const r = el.getBoundingClientRect(), th = thumbW(el);
    const lo = Number(el.min || 0), hi = Number(el.max || 100);
    const c = r.left + th / 2 + ((Number(el.value) - lo) / (hi - lo || 1)) * (r.width - th);
    this.range = { el, grab: Math.abs(x - c) <= th / 2 ? x - c : 0 };
  }
  private slide(x: number) {
    const g = this.range; if (!g) return;
    const { el } = g, r = el.getBoundingClientRect(), th = thumbW(el);
    const lo = Number(el.min || 0), hi = Number(el.max || 100), step = Number(el.step) || 1;
    const u = clamp01((x - g.grab - r.left - th / 2) / Math.max(1, r.width - th));
    const v = String(lo + Math.round((u * (hi - lo)) / step) * step);
    if (el.value === v) return;
    valueSetter?.call(el, v);                                   // past React's value tracker, so onChange fires
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---------------------------------------------------------------- what it looks like
  private mount() {
    const h = document.documentElement;
    this.cursor = document.getElementById('sun-cursor');
    this.hadCursor = h.classList.contains('has-sun-cursor');
    h.classList.add('autopilot', 'has-sun-cursor');
    h.classList.remove('auto-bow', 'auto-nudge');

    const fx = document.createElement('div');
    fx.id = 'auto-fx'; fx.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fx);
    this.fx = fx;

    const s = document.createElement('div');
    s.id = 'auto-shield';
    const pill = document.createElement('button');
    pill.type = 'button'; pill.className = 'auto-pill'; pill.tabIndex = -1;
    pill.innerHTML = `<i aria-hidden="true"></i>${AUTO.running}<span>${AUTO.exit}</span>`;
    pill.addEventListener('click', () => this.stop());
    s.appendChild(pill);
    const swallow = (e: Event) => {
      e.stopPropagation();
      if (pill.contains(e.target as Node)) return;
      if (e.cancelable && e.type !== 'pointermove' && e.type !== 'mousemove') e.preventDefault();
      if (e.type === 'pointerdown' || e.type === 'wheel' || e.type === 'touchstart') this.nudge();
      else if (e.type === 'pointermove' && h.classList.contains('auto-nudge')) this.nudge();
    };
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointercancel',
      'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'click', 'dblclick', 'auxclick', 'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      s.addEventListener(type, swallow, { passive: false });
    }
    document.body.appendChild(s);
    this.shield = s;
    addEventListener('keydown', this.onKey, true);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.stop(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;   // browser / recorder shortcuts stay untouched
    if (SCROLL_KEYS.has(e.key)) { e.preventDefault(); e.stopPropagation(); this.nudge(); }
  };

  /** the visitor touched something: show the real cursor and the way out for a moment */
  private nudge() {
    document.documentElement.classList.add('auto-nudge');
    clearTimeout(this.nudgeT);
    this.nudgeT = window.setTimeout(() => document.documentElement.classList.remove('auto-nudge'), 3200);
  }

  /** a click, made visible: a ring of chrome yellow and a few petals flung out */
  private ripple(x: number, y: number) {
    const fx = this.fx; if (!fx || Number.isNaN(x)) return;
    const r = document.createElement('div');
    r.className = 'auto-ripple';
    r.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    let html = '<i class="ring"></i>';
    for (let i = 0; i < 8; i++) html += `<i class="dab" style="--a:${i * 45 + (i % 2 ? 9 : -6)}deg"></i>`;
    r.innerHTML = html;
    fx.appendChild(r);
    setTimeout(() => r.remove(), 950);
  }

  /** the flower leans into its motion like a head on a stem */
  private skin(dt: number) {
    const c = this.cursor; if (!c || dt <= 0) return;
    const vx = Number.isNaN(this.lx) ? 0 : (this.px - this.lx) / dt;
    this.lx = this.px;
    const want = Math.max(-16, Math.min(16, vx * 0.018));
    this.lean += (want - this.lean) * (1 - Math.exp(-7 * dt));
    const v = this.lean.toFixed(1);
    if (v !== this.leanS) { this.leanS = v; c.style.setProperty('--lean', `${v}deg`); }
  }
}

export const autopilot = new Autopilot();
declare global { interface Window { __autopilot?: Autopilot } }
if (typeof window !== 'undefined') window.__autopilot = autopilot;   // for QA and the film recorder
