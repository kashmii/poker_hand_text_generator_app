import { Hand } from 'pokersolver';
import type { Card } from '../types/poker';
import { cardKey } from './card';

export interface ShowdownHand {
  playerId: string;
  cards: [Card, Card];
}

export interface ShowdownEvaluation {
  /** 最強のプレイヤー。同率ならチョップとして全員入る */
  winnerIds: string[];
  /** プレイヤーID → 役名（例: 'Flush, A High'）。全員分 */
  descriptions: Record<string, string>;
}

/**
 * ボード5枚と各プレイヤーの手札から勝者を判定する。
 * 判定できない（ボードが5枚揃っていない／比較対象が2人未満）ときは null。
 */
export function evaluateShowdown(
  board: Card[],
  hands: ShowdownHand[],
): ShowdownEvaluation | null {
  if (board.length !== 5 || hands.length < 2) return null;

  const solved = hands.map((h) => ({
    playerId: h.playerId,
    hand: Hand.solve([...board, ...h.cards].map(cardKey)),
  }));
  const winning = new Set(Hand.winners(solved.map((s) => s.hand)));

  return {
    winnerIds: solved.filter((s) => winning.has(s.hand)).map((s) => s.playerId),
    descriptions: Object.fromEntries(solved.map((s) => [s.playerId, s.hand.descr])),
  };
}
