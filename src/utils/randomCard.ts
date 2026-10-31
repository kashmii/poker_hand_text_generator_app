import type { Card } from '../types/poker';
import { RANKS, SUIT_VALUES, cardKey, filledCards } from './card';

/**
 * 使用済みカードを除いたデッキからランダムに n 枚選んで返す。
 * n 枚取れない場合（デッキ不足）は取れた分だけ返す。
 */
function pickRandomCards(usedCards: Card[], count: number): Card[] {
  const usedSet = new Set(usedCards.map(cardKey));
  const available: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUIT_VALUES) {
      const card: Card = { rank, suit };
      if (!usedSet.has(cardKey(card))) {
        available.push(card);
      }
    }
  }
  // Fisher-Yates shuffle して先頭 count 枚を返す
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}

/**
 * 空き枠（null）だけをランダムなカードで埋めた配列を返す（DEV のランダム入力用）。
 * usedCards と入力済みのカードは選ばない。デッキが足りなければ残りは null のまま。
 */
export function fillRandomCards(cards: (Card | null)[], usedCards: Card[]): (Card | null)[] {
  const need = cards.filter((c) => c === null).length;
  const picked = pickRandomCards([...usedCards, ...filledCards(cards)], need);
  let pi = 0;
  return cards.map((c) => c ?? picked[pi++] ?? null);
}
