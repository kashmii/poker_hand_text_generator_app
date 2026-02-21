import type { Card, Rank, Suit } from '../types/poker';

const ALL_RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const ALL_SUITS: Suit[] = ['h', 'd', 'c', 's'];

function cardKey(c: Card) {
  return `${c.rank}${c.suit}`;
}

/**
 * 使用済みカードを除いたデッキからランダムに n 枚選んで返す。
 * n 枚取れない場合（デッキ不足）は取れた分だけ返す。
 */
export function pickRandomCards(usedCards: Card[], count: number): Card[] {
  const usedSet = new Set(usedCards.map(cardKey));
  const available: Card[] = [];
  for (const rank of ALL_RANKS) {
    for (const suit of ALL_SUITS) {
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
