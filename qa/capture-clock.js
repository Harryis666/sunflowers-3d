// Virtual clock for filming the site frame by frame (injected by qa/record.mjs before any page
// script runs). Until __cap.freeze() is called, time is real and everything behaves exactly as
// usual (so loading is untouched). From then on time only moves when the recorder calls
// __cap.step(ms): due timers fire in order, one animation frame runs with the new timestamp,
// React gets to flush, and every CSS animation / transition is seeked to the same instant —
// so each captured frame is exactly 1/fps apart however long the software GPU takes to draw it.
(() => {
  if (window.__cap) return;
  const perf = performance;
  const realNowFn = Performance.prototype.now;
  const realNow = () => realNowFn.call(perf);
  const realRAF = window.requestAnimationFrame.bind(window);
  const realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window);
  const realDateNow = Date.now.bind(Date);
  const dateBase = realDateNow() - realNow();

  let manual = false, vnow = 0, inStep = false;
  const now = () => (manual ? vnow : realNow());
  perf.now = now;
  Date.now = () => Math.floor(dateBase + now());

  // ---- animation frames: our own queue, pumped by the real rAF until manual mode
  let rafQ = new Map(), rafId = 1;
  window.requestAnimationFrame = (cb) => { const id = rafId++; rafQ.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { rafQ.delete(id); };
  const runFrame = (ts) => {
    const q = rafQ; rafQ = new Map();
    for (const cb of q.values()) { try { cb(ts); } catch (e) { console.error(e); } }
  };
  const pump = () => { if (manual) return; runFrame(realNow()); realRAF(pump); };
  realRAF(pump);

  // ---- timers: one ordered queue; a single real timeout serves it until manual mode
  const timers = new Map(); let timerId = 1, armed = 0;
  const earliest = () => { let b = null; for (const [id, t] of timers) if (!b || t.at < b[1].at || (t.at === b[1].at && id < b[0])) b = [id, t]; return b; };
  const fire = (id, t) => {
    if (t.every) t.at += t.every; else timers.delete(id);
    try { if (typeof t.fn === 'function') t.fn(...t.args); else (0, eval)(String(t.fn)); } catch (e) { console.error(e); }
  };
  const runDue = (until) => {
    for (let guard = 0; guard < 20000; guard++) {
      const b = earliest();
      if (!b || b[1].at > until) break;
      if (manual) vnow = Math.max(vnow, b[1].at);
      fire(b[0], b[1]);
    }
  };
  const arm = () => {
    if (manual) return;
    if (armed) { realCT(armed); armed = 0; }
    const b = earliest(); if (!b) return;
    armed = realST(() => { armed = 0; runDue(realNow()); arm(); }, Math.max(0, b[1].at - realNow()));
  };
  const add = (fn, ms, args, repeat) => {
    const id = timerId++;
    let d = Math.max(0, Number(ms) || 0);
    if (manual && inStep) d = Math.max(1, d);       // a zero-delay chain can't spin inside one step
    timers.set(id, { at: now() + d, fn, args, every: repeat ? Math.max(1, d) : 0 });
    arm();
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };

  // ---- CSS animations & transitions follow the same clock
  const anims = new WeakMap();
  const syncAnimations = (adopt) => {
    for (const a of document.getAnimations()) {
      let start = anims.get(a);
      if (start === undefined) {
        const ct = typeof a.currentTime === 'number' ? a.currentTime : 0;
        start = adopt ? vnow - ct : vnow;
        anims.set(a, start);
        try { a.pause(); } catch (e) { /* ignore */ }
      }
      try { a.currentTime = Math.max(0, vnow - start); } catch (e) { /* ignore */ }
    }
  };
  const hop = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });

  window.__cap = {
    get manual() { return manual; },
    now,
    /** freeze real time: from here on only step() moves the clock */
    freeze() {
      if (manual) return vnow;
      vnow = realNow(); manual = true;
      if (armed) { realCT(armed); armed = 0; }
      syncAnimations(true);
      return vnow;
    },
    /** advance by ms: timers, then one frame (scroll applied first), then React, then CSS */
    async step(ms, opts = {}) {
      const target = vnow + ms;
      inStep = true;
      try {
        runDue(target);
        vnow = target;
        if (typeof opts.scrollY === 'number') {
          const L = window.__sunflowers && window.__sunflowers.lenis;
          if (L) L.scrollTo(opts.scrollY, { immediate: true, force: true }); else window.scrollTo(0, opts.scrollY);
        }
        runFrame(vnow);
      } finally { inStep = false; }
      await hop(); await hop();                     // let React (MessageChannel) and promises settle
      runDue(vnow);
      syncAnimations(false);
      return vnow;
    },
  };
})();
