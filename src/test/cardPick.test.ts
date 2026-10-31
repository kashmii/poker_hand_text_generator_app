import { describe, it, expect } from 'vitest';
import {
  EMPTY_PART, RANKS, applyPart, isRankDisabled, isSuitDisabled, mergeSlots,
  type CardPart, type PartialCard,
} from '../utils/cardPick';

/** 押した順に applyPart を適用した結果の枠 */
function press(slots: PartialCard[], parts: CardPart[]): PartialCard[] {
  return parts.reduce((acc, part) => {
    const r = applyPart(acc, part);
    return r ? acc.map((s, i) => (i === r.idx ? r.slot : s)) : acc;
  }, slots);
}

const empty2 = () => [EMPTY_PART, EMPTY_PART];
const AH_KS = [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 's' }];

describe('applyPart: 手札2枚をどの順でも入力できる', () => {
  it('数字1、スート1、数字2、スート2', () => {
    expect(press(empty2(), [{ rank: 'A' }, { suit: 'h' }, { rank: 'K' }, { suit: 's' }])).toEqual(AH_KS);
  });

  it('数字1、数字2、スート1、スート2', () => {
    expect(press(empty2(), [{ rank: 'A' }, { rank: 'K' }, { suit: 'h' }, { suit: 's' }])).toEqual(AH_KS);
  });

  it('スート1、スート2、数字1、数字2', () => {
    expect(press(empty2(), [{ suit: 'h' }, { suit: 's' }, { rank: 'A' }, { rank: 'K' }])).toEqual(AH_KS);
  });

  it('スート1、数字1、スート2、数字2', () => {
    expect(press(empty2(), [{ suit: 'h' }, { rank: 'A' }, { suit: 's' }, { rank: 'K' }])).toEqual(AH_KS);
  });

  it('途中まではランクだけ・スーツだけの枠になる', () => {
    expect(press(empty2(), [{ rank: 'A' }, { suit: 's' }, { suit: 'h' }])).toEqual([
      { rank: 'A', suit: 's' },
      { rank: null, suit: 'h' },
    ]);
  });

  it('全枠にその種類が入っていれば入れる枠はない', () => {
    expect(applyPart([{ rank: 'A', suit: null }, { rank: 'K', suit: null }], { rank: 'Q' })).toBeNull();
  });
});

describe('applyPart: フロップで1枚消したあと', () => {
  it('空いた一番左の枠に入る', () => {
    const slots: PartialCard[] = [EMPTY_PART, { rank: 'K', suit: 'd' }, { rank: '7', suit: null }];
    expect(press(slots, [{ rank: 'Q' }, { suit: 'c' }])).toEqual([
      { rank: 'Q', suit: 'c' },
      { rank: 'K', suit: 'd' },
      { rank: '7', suit: null },
    ]);
  });
});

describe('mergeSlots', () => {
  it('確定カードを優先し、未確定の枠は入力途中を出す', () => {
    expect(mergeSlots([{ rank: 'A', suit: 'h' }, null], [{ rank: 'Q', suit: null }, { rank: null, suit: 'c' }]))
      .toEqual([{ rank: 'A', suit: 'h' }, { rank: null, suit: 'c' }]);
  });
});

describe('isRankDisabled', () => {
  it('入る枠にスーツがあれば、その組み合わせが使用済みのとき押せない', () => {
    const slots: PartialCard[] = [{ rank: null, suit: 'h' }, EMPTY_PART];
    expect(isRankDisabled('A', slots, new Set(['Ah']))).toBe(true);
    expect(isRankDisabled('K', slots, new Set(['Ah']))).toBe(false);
  });

  it('同じ入力欄で確定済みのカードも使用済みとみなす', () => {
    const slots: PartialCard[] = [{ rank: 'A', suit: 'h' }, { rank: null, suit: 'h' }];
    expect(isRankDisabled('A', slots, new Set())).toBe(true);
  });

  it('スーツ未入力なら、残りスーツを他の枠の同ランクが使い切るとき押せない', () => {
    const slots: PartialCard[] = [{ rank: 'A', suit: null }, EMPTY_PART];
    expect(isRankDisabled('A', slots, new Set(['Ah', 'Ad']))).toBe(false);
    expect(isRankDisabled('A', slots, new Set(['Ah', 'Ad', 'Ac']))).toBe(true);
  });

  it('全枠にランクが入っていれば押せない', () => {
    expect(isRankDisabled('A', [{ rank: 'K', suit: null }, { rank: 'Q', suit: null }], new Set())).toBe(true);
  });
});

describe('isSuitDisabled', () => {
  it('入る枠にランクがあれば、その組み合わせが使用済みのとき押せない', () => {
    const slots: PartialCard[] = [{ rank: 'A', suit: null }, EMPTY_PART];
    expect(isSuitDisabled('h', slots, new Set(['Ah']))).toBe(true);
    expect(isSuitDisabled('s', slots, new Set(['Ah']))).toBe(false);
  });

  it('ランク未入力なら13ランクすべて使用済みのとき押せない', () => {
    expect(isSuitDisabled('h', empty2(), new Set(['Ah']))).toBe(false);
    expect(isSuitDisabled('h', empty2(), new Set(RANKS.map((r) => `${r}h`)))).toBe(true);
  });
});
