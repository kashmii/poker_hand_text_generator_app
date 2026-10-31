import { describe, it, expect } from 'vitest';
import { cardKey, cardLabel, filledCards } from '../utils/card';
import { fillRandomCards } from '../utils/randomCard';
import { positionLabels } from '../utils/positions';
import type { Card } from '../types/poker';

const Ah: Card = { rank: 'A', suit: 'h' };
const Ks: Card = { rank: 'K', suit: 's' };

describe('card', () => {
  it('cardKey はランク＋スーツ文字、cardLabel はスート記号で表す', () => {
    expect(cardKey(Ah)).toBe('Ah');
    expect(cardLabel(Ah)).toBe('A♥');
    expect(cardLabel(Ks)).toBe('K♠');
  });

  it('filledCards は未入力の枠を除く', () => {
    expect(filledCards([Ah, null, Ks, null])).toEqual([Ah, Ks]);
  });
});

describe('fillRandomCards', () => {
  it('空き枠だけを埋め、入力済みの枠はそのまま残す', () => {
    const result = fillRandomCards([Ah, null, null], []);
    expect(result[0]).toBe(Ah);
    expect(result[1]).not.toBeNull();
    expect(result[2]).not.toBeNull();
  });

  it('使用済み・入力済みのカードと重複しない', () => {
    const used: Card[] = [Ks];
    for (let i = 0; i < 20; i++) {
      const result = fillRandomCards([Ah, null, null, null, null], used);
      const keys = filledCards(result).map(cardKey);
      expect(new Set(keys).size).toBe(5);
      expect(keys).not.toContain('Ks');
    }
  });
});

describe('positionLabels', () => {
  it('人数ごとのポジション名を返し、対応外の人数は空', () => {
    expect(positionLabels(2)).toEqual(['SB/BTN', 'BB']);
    expect(positionLabels(6)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']);
    expect(positionLabels(10)).toEqual([]);
  });
});
