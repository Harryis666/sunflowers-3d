/** true on phones / tablets without a hovering pointer — hints then talk about fingers, not cursors */
export const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
