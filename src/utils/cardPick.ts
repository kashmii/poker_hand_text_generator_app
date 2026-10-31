import type { Card, Rank, Suit } from '../types/poker';
import { RANKS, SUIT_VALUES, cardKey } from './card';

/** 1枠ぶんの入力状態。ランクとスーツは別々に入る（両方そろえばカード確定） */
export interface PartialCard {
  rank: Rank | null;
  suit: Suit | null;
}

export type CardPart = { rank: Rank } | { suit: Suit };

export const EMPTY_PART: PartialCard = { rank: null, suit: null };

export function isCompleteCard(p: PartialCard): p is Card {
  return p.rank !== null && p.suit !== null;
}

export function isEmptyPart(p: PartialCard): boolean {
  return p.rank === null && p.suit === null;
}

/** 確定カードと入力途中のパーツを合わせて、枠ごとの表示状態にする（確定カード優先） */
export function mergeSlots(cards: (Card | null)[], partials: PartialCard[]): PartialCard[] {
  return cards.map((c, i) => c ?? partials[i] ?? EMPTY_PART);
}

const partKind = (part: CardPart): 'rank' | 'suit' => ('rank' in part ? 'rank' : 'suit');

/** ランク／スーツを入れる枠: その種類がまだ入っていない一番左の枠。なければ null */
function findTargetSlot(slots: PartialCard[], kind: 'rank' | 'suit'): number | null {
  const idx = slots.findIndex((s) => s[kind] === null);
  return idx === -1 ? null : idx;
}

/** ランクかスーツを1つ押した結果（どの枠がどうなるか）。入れる枠がなければ null */
export function applyPart(
  slots: PartialCard[],
  part: CardPart,
): { idx: number; slot: PartialCard } | null {
  const idx = findTargetSlot(slots, partKind(part));
  if (idx === null) return null;
  return { idx, slot: { ...slots[idx], ...part } };
}

/** usedSet は cardKey（例: "Ah"）の集合 */
const key = (rank: Rank, suit: Suit) => cardKey({ rank, suit });

/** 外部の使用済みカードに、この入力欄で確定済みのカードを足した集合 */
function withCompleted(slots: PartialCard[], usedSet: Set<string>): Set<string> {
  const used = new Set(usedSet);
  slots.forEach((s) => { if (isCompleteCard(s)) used.add(key(s.rank, s.suit)); });
  return used;
}

/**
 * ランクを押せないか。入る枠にスーツが入っていればその組み合わせが使用済みのとき。
 * スーツ未入力なら、残りのスーツ数が「同じランクだけ入った他の枠」の数以下のとき（全枠を埋められなくなるため）
 */
export function isRankDisabled(rank: Rank, slots: PartialCard[], usedSet: Set<string>): boolean {
  const target = findTargetSlot(slots, 'rank');
  if (target === null) return true;
  const used = withCompleted(slots, usedSet);
  const suit = slots[target].suit;
  if (suit !== null) return used.has(key(rank, suit));
  const free = SUIT_VALUES.filter((s) => !used.has(key(rank, s))).length;
  const reserved = slots.filter((s, i) => i !== target && s.rank === rank && s.suit === null).length;
  return free <= reserved;
}

/** スーツを押せないか。isRankDisabled のランク・スーツを入れ替えた判定 */
export function isSuitDisabled(suit: Suit, slots: PartialCard[], usedSet: Set<string>): boolean {
  const target = findTargetSlot(slots, 'suit');
  if (target === null) return true;
  const used = withCompleted(slots, usedSet);
  const rank = slots[target].rank;
  if (rank !== null) return used.has(key(rank, suit));
  const free = RANKS.filter((r) => !used.has(key(r, suit))).length;
  const reserved = slots.filter((s, i) => i !== target && s.suit === suit && s.rank === null).length;
  return free <= reserved;
}
