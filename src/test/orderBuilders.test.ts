import { describe, it, expect } from 'vitest';
import {
  buildPreflopOrder,
  buildPostflopOrder,
} from '../components/hand/useHandFlow';

// players配列のレイアウト: [BTN=0, SB=1, BB=2, UTG=3, CO=4, ...]

describe('buildPreflopOrder', () => {

  describe('2人（ヘッズアップ）', () => {
    const ids = ['btn', 'bb'];

    it('BTN→BBの順になる', () => {
      expect(buildPreflopOrder(ids, 0)).toEqual(['btn', 'bb']);
    });
  });

  describe('3人', () => {
    const ids = ['btn', 'sb', 'bb'];

    it('BTN→SB→BBの順になる', () => {
      // 3人: UTGポジション(index3以降)なし → BTN→SB→BB
      expect(buildPreflopOrder(ids, 0)).toEqual(['btn', 'sb', 'bb']);
    });

    it('BBが必ず最後になる', () => {
      const order = buildPreflopOrder(ids, 0);
      expect(order[order.length - 1]).toBe('bb');
    });
  });

  describe('4人', () => {
    // [BTN=0, SB=1, BB=2, UTG=3]
    const ids = ['btn', 'sb', 'bb', 'utg'];

    it('UTG→BTN→SB→BBの順になる', () => {
      expect(buildPreflopOrder(ids, 0)).toEqual(['utg', 'btn', 'sb', 'bb']);
    });

    it('BBが必ず最後になる', () => {
      const order = buildPreflopOrder(ids, 0);
      expect(order[order.length - 1]).toBe('bb');
    });
  });

  describe('6人', () => {
    // [BTN=0, SB=1, BB=2, UTG=3, HJ=4, CO=5]
    const ids = ['btn', 'sb', 'bb', 'utg', 'hj', 'co'];

    it('UTG→HJ→CO→BTN→SB→BBの順になる', () => {
      expect(buildPreflopOrder(ids, 0)).toEqual([
        'utg', 'hj', 'co', 'btn', 'sb', 'bb',
      ]);
    });

    it('先頭はUTG（index=3）になる', () => {
      const order = buildPreflopOrder(ids, 0);
      expect(order[0]).toBe('utg');
    });

    it('BBが必ず最後になる', () => {
      const order = buildPreflopOrder(ids, 0);
      expect(order[order.length - 1]).toBe('bb');
    });

    it('全プレイヤーが含まれる（重複・欠落なし）', () => {
      const order = buildPreflopOrder(ids, 0);
      expect(order).toHaveLength(ids.length);
      expect(new Set(order)).toEqual(new Set(ids));
    });
  });

  describe('ストラドルあり', () => {
    const ids = ['btn', 'sb', 'bb', 'utg'];

    it('ストラドルなしと順序が変わらない（BBは常に最後）', () => {
      // ストラドルの有無によらずBBは最後
      const withStraddle    = buildPreflopOrder(ids, 100);
      const withoutStraddle = buildPreflopOrder(ids, 0);
      expect(withStraddle).toEqual(withoutStraddle);
    });
  });

});

describe('buildPostflopOrder', () => {
  // players配列のレイアウト: [BTN=0, SB=1, BB=2, UTG=3, ...]

  describe('3人・全員アクティブ', () => {
    const ids = ['btn', 'sb', 'bb'];
    const noFolds = new Set<string>();

    it('SB→BB→BTNの順になる', () => {
      expect(buildPostflopOrder(ids, noFolds)).toEqual(['sb', 'bb', 'btn']);
    });

    it('BTNが必ず最後になる', () => {
      const order = buildPostflopOrder(ids, noFolds);
      expect(order[order.length - 1]).toBe('btn');
    });
  });

  describe('4人・全員アクティブ', () => {
    // [BTN=0, SB=1, BB=2, UTG=3]
    const ids = ['btn', 'sb', 'bb', 'utg'];
    const noFolds = new Set<string>();

    it('SB→BB→UTG→BTNの順になる', () => {
      expect(buildPostflopOrder(ids, noFolds)).toEqual(['sb', 'bb', 'utg', 'btn']);
    });
  });

  describe('フォールドを除外する', () => {
    const ids = ['btn', 'sb', 'bb', 'utg'];

    it('SBがフォールドするとSBが除外される', () => {
      const folded = new Set(['sb']);
      expect(buildPostflopOrder(ids, folded)).toEqual(['bb', 'utg', 'btn']);
    });

    it('BTNがフォールドするとBTNが除外され末尾が変わる', () => {
      const folded = new Set(['btn']);
      expect(buildPostflopOrder(ids, folded)).toEqual(['sb', 'bb', 'utg']);
    });

    it('複数フォールドでも残りプレイヤーが正しい順序で返る', () => {
      // SBとUTGがフォールド → BB→BTNの順
      const folded = new Set(['sb', 'utg']);
      expect(buildPostflopOrder(ids, folded)).toEqual(['bb', 'btn']);
    });

    it('フォールドしたプレイヤーはリストに含まれない', () => {
      const folded = new Set(['sb', 'bb']);
      const order = buildPostflopOrder(ids, folded);
      expect(order).not.toContain('sb');
      expect(order).not.toContain('bb');
    });

    it('1人だけ残った場合はその1人だけ返る', () => {
      const folded = new Set(['sb', 'bb', 'utg']);
      expect(buildPostflopOrder(ids, folded)).toEqual(['btn']);
    });
  });

});
