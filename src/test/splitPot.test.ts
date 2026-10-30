import { describe, it, expect } from 'vitest';
import { splitPot } from '../utils/splitPot';

// postflop のアクション順（SB 最優先、BTN 最後）
const ORDER = ['sb', 'bb', 'utg', 'btn'];

describe('splitPot（チョップの配分）', () => {

  it('割り切れるときは等分', () => {
    expect(splitPot(100, ['bb', 'sb'], ORDER)).toEqual([
      { playerId: 'sb', amount: 50 },
      { playerId: 'bb', amount: 50 },
    ]);
  });

  it('余りはアクション順の早い人へ（SB が最優先）', () => {
    // 101 を 2 人: 余り 1 は SB へ
    expect(splitPot(101, ['btn', 'sb'], ORDER)).toEqual([
      { playerId: 'sb', amount: 51 },
      { playerId: 'btn', amount: 50 },
    ]);
  });

  it('余りが2のときは早い順に1ずつ配る（BTN は最後）', () => {
    // 11 を 3 人: base 3、余り 2 → sb と bb に +1、btn は 3
    const result = splitPot(11, ['btn', 'bb', 'sb'], ORDER);
    expect(result).toEqual([
      { playerId: 'sb', amount: 4 },
      { playerId: 'bb', amount: 4 },
      { playerId: 'btn', amount: 3 },
    ]);
  });

  it('合計は常に元の額と一致する', () => {
    for (let amount = 1; amount <= 60; amount++) {
      for (const winners of [['sb', 'bb'], ['bb', 'utg', 'btn'], ['sb', 'bb', 'utg', 'btn']]) {
        const total = splitPot(amount, winners, ORDER).reduce((s, e) => s + e.amount, 0);
        expect(total).toBe(amount);
      }
    }
  });

  it('勝者が1人なら全額', () => {
    expect(splitPot(77, ['utg'], ORDER)).toEqual([{ playerId: 'utg', amount: 77 }]);
  });

  it('勝者が空なら空配列', () => {
    expect(splitPot(50, [], ORDER)).toEqual([]);
  });

  it('HU は postflop で BB が先に動くので、余りは BB へ', () => {
    // HU の postflop 順: [BB, BTN(SB)]
    expect(splitPot(101, ['btn', 'bb'], ['bb', 'btn'])).toEqual([
      { playerId: 'bb', amount: 51 },
      { playerId: 'btn', amount: 50 },
    ]);
  });

});
