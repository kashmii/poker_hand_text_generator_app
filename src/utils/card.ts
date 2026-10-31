import type { Card, Rank, Suit } from '../types/poker';

/** ランクの並び（強い順）。ピッカーやデッキ生成で使う */
export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SUIT_VALUES: Suit[] = ['h', 'd', 'c', 's'];

export const SUIT_SYMBOLS: Record<Suit, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };

/** カードを一意に表す文字列（例: "Ah"）。使用済みカードの Set のキーに使う */
export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

/** 表示用のカード文字列（例: "A♥"） */
export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

/** 未入力（null）の枠を除いたカード */
export function filledCards(cards: readonly (Card | null)[]): Card[] {
  return cards.filter((c): c is Card => c !== null);
}
