import type { CSSProperties } from 'react';

/**
 * Inline style for a one-line brush title inside an `@container` card: the size shrinks
 * (container-query units) just enough that the calligraphy never breaks off a lone character.
 */
export function fitTitle(text: string, max: string, basis = '100cqw'): CSSProperties {
  const n = Array.from(text).length * 1.06 + 0.12;
  return { fontSize: `min(${max}, calc(${basis} / ${n.toFixed(2)}))`, whiteSpace: 'nowrap' };
}
