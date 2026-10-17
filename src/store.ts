// Minimal observable store shared by React UI and the WebGL engine.
export type Stage = 0 | 1 | 2 | 3;
export interface State {
  loaded: number;          // 0..1 asset progress
  ready: boolean;          // assets + GPU data prepared
  entered: boolean;        // user passed the loader gate
  enteredAt: number;       // performance.now() when they did (the intro plays for ~3 s after)
  sound: boolean;
  webgl: boolean;
  chapter: number;         // active section index
  hoverYellow: number;     // palette index under focus (-1 none)
  pinYellow: number;       // palette index locked by click (-1 none)
  stage: Stage;            // sunflower life stage (chapter 2)
  stageT: number;          // continuous life value 0..3
  spirals: boolean;        // show 34/55 parastichies
  age: number;             // 0 = 1888 … 1 = 2150 (chapter 3)
  ageTouched: boolean;
  raking: boolean;         // raking-light mode (pointer held)
  hoverFlower: number;
  reducedMotion: boolean;
  auto: boolean;           // the guided tour is playing (src/auto)
}

type Listener = (s: State, prev: State) => void;

const initial: State = {
  loaded: 0, ready: false, entered: false, enteredAt: 0, sound: false, webgl: true, chapter: 0,
  hoverYellow: -1, pinYellow: -1, stage: 0, stageT: 0, spirals: false, age: 0, ageTouched: false,
  raking: false, hoverFlower: -1, auto: false,
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
};

let state: State = { ...initial };
const listeners = new Set<Listener>();

export const store = {
  get: () => state,
  set(patch: Partial<State>) {
    let changed = false;
    for (const k in patch) if ((patch as any)[k] !== (state as any)[k]) { changed = true; break; }
    if (!changed) return;
    const prev = state;
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state, prev));
  },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

import { useSyncExternalStore } from 'react';
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(state), () => sel(state));
}
