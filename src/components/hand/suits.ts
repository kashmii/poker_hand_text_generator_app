import type { Suit } from '../../types/poker';
import { SUIT_SYMBOLS } from '../../utils/card';

/** スーツの表示用ラベルと色 */
export const SUITS: { value: Suit; label: string; color: string }[] = [
  { value: 'h', label: SUIT_SYMBOLS.h, color: '#e53e3e' },
  { value: 'd', label: SUIT_SYMBOLS.d, color: '#e53e3e' },
  { value: 'c', label: SUIT_SYMBOLS.c, color: 'var(--color-text)' },
  { value: 's', label: SUIT_SYMBOLS.s, color: 'var(--color-text)' },
];
