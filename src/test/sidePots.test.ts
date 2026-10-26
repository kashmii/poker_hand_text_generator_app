import { describe, it, expect } from 'vitest';
import { computeSidePots } from '../utils/sidePots';

const NONE = new Set<string>();

describe('computeSidePots（メイン/サイドポット計算・要求17）', () => {

  it('① 全員同額なら単一ポット', () => {
    const { pots, refunds } = computeSidePots(
      { a: 100, b: 100, c: 100 }, NONE, ['a', 'b', 'c'],
    );
    expect(refunds).toEqual({});
    expect(pots).toHaveLength(1);
    expect(pots[0]).toMatchObject({ amount: 300, label: 'main pot' });
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('② 1人ショート・トップ2人同額 → main + side（返却なし）', () => {
    const { pots, refunds } = computeSidePots(
      { a: 30, b: 100, c: 100 }, NONE, ['a', 'b', 'c'],
    );
    expect(refunds).toEqual({});
    expect(pots).toHaveLength(2);
    expect(pots[0]).toMatchObject({ amount: 90, label: 'main pot' });
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b', 'c']);
    expect(pots[1]).toMatchObject({ amount: 140, label: 'side pot' });
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['b', 'c']);
  });

  it('③ トップが単独 → その差額は返却され、side pot 2 はできない', () => {
    const { pots, refunds } = computeSidePots(
      { a: 30, b: 60, c: 100 }, NONE, ['a', 'b', 'c'],
    );
    // c の上積み 40 は誰にもコールされていないので返却
    expect(refunds).toEqual({ c: 40 });
    expect(pots).toHaveLength(2);
    expect(pots[0]).toMatchObject({ amount: 90, label: 'main pot' });
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b', 'c']);
    expect(pots[1]).toMatchObject({ amount: 60, label: 'side pot' });
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['b', 'c']);
  });

  it('④ フォールド者の拠出はデッドマネー。eligible 同一の層はマージ', () => {
    const { pots, refunds } = computeSidePots(
      { a: 100, b: 100, c: 40 }, new Set(['c']), ['a', 'b', 'c'],
    );
    expect(refunds).toEqual({});
    expect(pots).toHaveLength(1);
    expect(pots[0]).toMatchObject({ amount: 240, label: 'main pot' });
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b']);
  });

  it('⑤ BBアンティ織り込み: BB=20(10+ante10)/SB50/UTG50 → main + side', () => {
    // bb がアンティ込み 20 でオールイン、sb・utg は各 50
    const { pots, refunds } = computeSidePots(
      { bb: 20, sb: 50, utg: 50 }, NONE, ['bb', 'sb', 'utg'],
    );
    expect(refunds).toEqual({});
    expect(pots).toHaveLength(2);
    expect(pots[0]).toMatchObject({ amount: 60, label: 'main pot' });
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['bb', 'sb', 'utg']);
    expect(pots[1]).toMatchObject({ amount: 60, label: 'side pot' });
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['sb', 'utg']);
  });

  it('⑥ 4人全員別額 → main + side 2つ、トップ単独分は返却', () => {
    const { pots, refunds } = computeSidePots(
      { a: 50, b: 100, c: 150, d: 200 }, NONE, ['a', 'b', 'c', 'd'],
    );
    expect(refunds).toEqual({ d: 50 });
    expect(pots).toHaveLength(3);
    expect(pots[0]).toMatchObject({ amount: 200, label: 'main pot' });
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(pots[1]).toMatchObject({ amount: 150, label: 'side pot' });
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['b', 'c', 'd']);
    expect(pots[2]).toMatchObject({ amount: 100, label: 'side pot 2' });
    expect(pots[2].eligiblePlayerIds.sort()).toEqual(['c', 'd']);
    // 合計 + 返却 = 総拠出
    const potSum = pots.reduce((s, p) => s + p.amount, 0);
    expect(potSum + 50).toBe(50 + 100 + 150 + 200);
  });

  it('⑦ ヘッズアップで同額 → 単一ポット（返却なし）', () => {
    const { pots, refunds } = computeSidePots(
      { a: 100, b: 100 }, NONE, ['a', 'b'],
    );
    expect(refunds).toEqual({});
    expect(pots).toHaveLength(1);
    expect(pots[0]).toMatchObject({ amount: 200, label: 'main pot' });
  });

  it('拠出ゼロ（全員未投入）なら空', () => {
    const { pots, refunds } = computeSidePots({ a: 0, b: 0 }, NONE, ['a', 'b']);
    expect(pots).toEqual([]);
    expect(refunds).toEqual({});
  });

});
