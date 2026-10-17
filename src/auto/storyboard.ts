import type { SectionName } from '../gl/Engine';

/**
 * The guided tour — what auto mode does, beat by beat. Times are seconds from the start of the tour
 * (the click on the gate's enter button). It is also the demo film's script: qa/record.mjs only
 * films the gate and that click, the rest is this storyboard playing in the page.
 */

/** viewport fractions (0..1) */
export type Point = [number, number];
/** px from the top of the page, or [chapter, viewport heights into it] */
export type ScrollTarget = number | [SectionName, number];
/** places resolved from the live layout when a move towards them starts (autopilot.ts) */
export type Anchor =
  | 'flower' | 'discA' | 'discB' | 'railA' | 'railB' | 'spirals'
  | 'ageThumb' | 'ageLeft' | 'ageMid' | 'chipBlue' | 'strokeA' | 'strokeB' | 'strokeC' | 'strokeD';
/** a glide to a point / anchor (bend: sideways bow of the curve, × its length), or a free path */
export interface Move { t: number; d: number; to?: Point | Anchor; bend?: number; path?: (u: number) => Point }

const { sin, PI } = Math;

/** scroll keyframes: eased between consecutive keys, held where two keys are equal */
export const SCROLL: Array<[number, ScrollTarget]> = [
  [0, 0], [13.6, 0],
  [16.3, ['yellows', -0.3]], [16.9, ['yellows', -0.3]],
  [19.6, ['yellows', 1.55]], [24.9, ['yellows', 1.55]],
  [26.0, ['yellows', 2.55]], [28.6, ['bloom', 0.3]], [29.6, ['bloom', 0.3]],
  [31.8, ['bloom', 1.3]], [34.9, ['bloom', 1.3]],
  [37.6, ['bloom', 3.3]], [38.2, ['bloom', 3.3]],
  [40.8, ['fade', 0.18]], [41.2, ['fade', 0.18]], [43.6, ['fade', 1.95]], [47.3, ['fade', 1.95]],
  [49.6, ['studio', 0]], [56.6, ['studio', 0]],
  [59.6, ['outro', 0.22]], [80, ['outro', 0.22]],
];

export const MOVES: Move[] = [
  // the painting: the cursor is the sun of Arles — sweep the light across the bouquet
  { t: 1.2, d: 1.6, to: [0.47, 0.36], bend: -0.1 },
  { t: 2.9, d: 5.4, path: (u) => [0.47 + 0.15 * sin(u * PI * 2) * (1 - 0.25 * u), 0.36 + 0.1 * sin(u * PI * 4) + 0.05 * u] },
  // press and hold: raking light, dragged slowly across
  { t: 8.4, d: 0.5, to: [0.4, 0.42], bend: 0.05 },
  { t: 9.2, d: 2.2, to: [0.57, 0.33], bend: -0.08 },
  // click a big flower
  { t: 11.6, d: 0.85, to: 'flower', bend: 0.1 },
  // yellows: rest by the dissolving painting, hover the colour-flower, then play the rail
  { t: 14.0, d: 1.6, to: [0.66, 0.4], bend: 0.1 },
  { t: 19.8, d: 1.0, to: 'discA', bend: 0.06 },
  { t: 20.9, d: 1.1, to: 'discB', bend: -0.12 },
  { t: 22.0, d: 0.7, to: 'railA', bend: 0.05 },
  { t: 22.75, d: 2.0, to: 'railB', bend: 0 },
  { t: 25.0, d: 1.2, to: [0.7, 0.45], bend: -0.1 },
  // life: watch it grow, show the spirals
  { t: 32.0, d: 1.0, to: 'spirals', bend: 0.1 },
  { t: 33.6, d: 1.2, to: [0.68, 0.38], bend: -0.1 },
  // fading: drag the years by hand
  { t: 43.8, d: 1.0, to: 'ageThumb', bend: 0.08 },
  { t: 45.0, d: 0.9, to: 'ageLeft', bend: 0 },
  { t: 46.0, d: 1.0, to: 'ageMid', bend: 0 },
  // your stroke: pick a colour, then paint
  { t: 49.8, d: 1.0, to: 'chipBlue', bend: 0.1 },
  { t: 51.4, d: 0.9, to: 'strokeA', bend: -0.06 },
  { t: 52.5, d: 1.5, to: 'strokeB', bend: 0.22 },
  { t: 54.2, d: 0.5, to: 'strokeC', bend: 0.05 },
  { t: 54.9, d: 1.2, to: 'strokeD', bend: -0.25 },
  // the night: a candle carried across
  { t: 57.0, d: 2.2, to: [0.45, 0.4], bend: 0.1 },
  { t: 59.6, d: 4.4, path: (u) => [0.45 + 0.12 * sin(u * PI * 1.5), 0.4 - 0.05 * sin(u * PI * 3)] },
];

/** the (left) button held down from → to */
export const PRESSES: Array<[number, number]> = [
  [8.95, 11.45],      // raking light (held)
  [12.55, 12.65],     // poke a flower
  [33.05, 33.15],     // spirals on
  [44.9, 47.05],      // drag the years
  [50.85, 50.95],     // pick Prussian blue
  [52.45, 54.05],     // stroke 1
  [54.8, 56.15],      // stroke 2
];

/** the tour's last beat; the cursor then bows out */
export const END = 63.6;
