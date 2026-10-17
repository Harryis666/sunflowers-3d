// Lays out the colour-flower's brush strokes off the main thread (see strokeData.ts).
import { computeStrokes, type StrokeInput } from './strokeData';

const ctx = self as unknown as Worker;
ctx.onmessage = (e: MessageEvent<StrokeInput>) => {
  const o = computeStrokes(e.data);
  ctx.postMessage(o, [o.pos.buffer, o.col.buffer, o.d.buffer, o.aS.buffer, o.aB.buffer, o.aT.buffer, o.grid.buffer]);
};
