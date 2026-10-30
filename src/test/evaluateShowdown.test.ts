import { describe, it, expect } from 'vitest';
import { evaluateShowdown } from '../utils/evaluateShowdown';
import type { Card, Rank, Suit } from '../types/poker';

/** 'Ah' 'Td' 形式の文字列から Card を作る */
const c = (s: string): Card => ({ rank: s[0] as Rank, suit: s[1] as Suit });
const cards = (a: string, b: string): [Card, Card] => [c(a), c(b)];
const board = (...s: string[]) => s.map(c);

describe('evaluateShowdown（勝者の自動判定）', () => {

  it('強い役が勝つ（フラッシュ vs ストレート）', () => {
    const result = evaluateShowdown(board('2h', '7h', '9h', 'Js', 'Kd'), [
      { playerId: 'a', cards: cards('Ah', '3h') }, // フラッシュ
      { playerId: 'b', cards: cards('Tc', 'Qd') }, // 9-T-J-Q-K ストレート
    ]);
    expect(result?.winnerIds).toEqual(['a']);
    expect(result?.descriptions.a).toMatch(/Flush/);
    expect(result?.descriptions.b).toMatch(/Straight/);
  });

  it('同じ役でもキッカーで決まる', () => {
    const result = evaluateShowdown(board('Ad', '7c', '4s', '2d', '9h'), [
      { playerId: 'a', cards: cards('Ah', 'Kc') },
      { playerId: 'b', cards: cards('As', 'Qc') },
    ]);
    expect(result?.winnerIds).toEqual(['a']);
  });

  it('完全に同じ強さならチョップ（全員が勝者）', () => {
    // ボードの A-K-7-4-2 にどちらもペア Q が付き、キッカーも同じ
    const result = evaluateShowdown(board('As', 'Kd', '7c', '4s', '2d'), [
      { playerId: 'a', cards: cards('Qc', 'Qd') },
      { playerId: 'b', cards: cards('Qh', 'Qs') },
    ]);
    expect(result?.winnerIds.sort()).toEqual(['a', 'b']);
  });

  it('ボードで役が決まっていて全員同じならチョップ（ボードプレイ）', () => {
    const result = evaluateShowdown(board('Ts', 'Jd', 'Qc', 'Kh', 'As'), [
      { playerId: 'a', cards: cards('2c', '3d') },
      { playerId: 'b', cards: cards('4c', '5d') },
      { playerId: 'c', cards: cards('6c', '7d') },
    ]);
    expect(result?.winnerIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('3人で2人が同率ならその2人だけがチョップ', () => {
    const result = evaluateShowdown(board('As', 'Kd', '7c', '4s', '2d'), [
      { playerId: 'a', cards: cards('Qc', 'Qd') },
      { playerId: 'b', cards: cards('Qh', 'Qs') },
      { playerId: 'c', cards: cards('3c', '8d') },
    ]);
    expect(result?.winnerIds.sort()).toEqual(['a', 'b']);
  });

  it('ボードが5枚未満なら判定しない（null）', () => {
    const result = evaluateShowdown(board('As', 'Kd', '7c', '4s'), [
      { playerId: 'a', cards: cards('Qc', 'Qd') },
      { playerId: 'b', cards: cards('Qh', 'Qs') },
    ]);
    expect(result).toBeNull();
  });

  it('比較対象が2人未満なら判定しない（null）', () => {
    const result = evaluateShowdown(board('As', 'Kd', '7c', '4s', '2d'), [
      { playerId: 'a', cards: cards('Qc', 'Qd') },
    ]);
    expect(result).toBeNull();
  });

});
