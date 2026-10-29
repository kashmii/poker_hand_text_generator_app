import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHandFlow } from '../components/hand/useHandFlow';
import type { SessionConfig } from '../types/poker';

// 3人テーブル: [BTN=0, SB=1, BB=2]、ブラインド 5/10
function makeSession3way(ante = 0): SessionConfig {
  return {
    players: [
      { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
      { id: 'sb',  name: 'SB',  stack: 1000, position: 1 },
      { id: 'bb',  name: 'BB',  stack: 1000, position: 2 },
    ],
    heroId: 'btn',
    heroPosition: 'BTN',
    heroEffectiveStack: 100,
    smallBlind: 5,
    bigBlind: 10,
    ante,
    straddle: 0,
    currency: '$',
    venueName: '',
    date: '2024-01-01',
  };
}

function skipHoleCards(
  result: ReturnType<typeof renderHook<ReturnType<typeof useHandFlow>, SessionConfig>>['result'],
) {
  act(() => {
    result.current.setHoleCards([{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' }]);
    result.current.startAction();
  });
}

describe('useHandFlow: 通算拠出額とサイドポット（要求17）', () => {

  it('初期の通算拠出額に SB/BB が入る（アンティなし）', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way()));
    expect(result.current.state.totalContributions.sb).toBe(5);
    expect(result.current.state.totalContributions.bb).toBe(10);
  });

  it('BBアンティは BB の通算拠出へ織り込まれる', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way(10)));
    expect(result.current.state.totalContributions.bb).toBe(20); // BB 10 + ante 10
    expect(result.current.state.totalContributions.sb).toBe(5);
  });

  it('3人ショートオールインで main + side が導出される', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way()));
    skipHoleCards(result);

    act(() => { result.current.commitAction('allin', 30); });  // BTN all-in 30
    act(() => { result.current.commitAction('allin', 100); }); // SB all-in 100
    act(() => { result.current.commitAction('allin', 100); }); // BB all-in 100

    expect(result.current.state.totalContributions).toMatchObject({ btn: 30, sb: 100, bb: 100 });

    const pots = result.current.sidePots;
    expect(pots).toHaveLength(2);
    expect(pots[0]).toMatchObject({ amount: 90, label: 'main pot' });
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['bb', 'btn', 'sb']);
    expect(pots[1]).toMatchObject({ amount: 140, label: 'side pot' });
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['bb', 'sb']);
  });

  it('goBack で通算拠出額が元に戻る', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way()));
    skipHoleCards(result);

    act(() => { result.current.commitAction('allin', 30); }); // BTN all-in 30
    expect(result.current.state.totalContributions.btn).toBe(30);

    act(() => { result.current.goBack(); });
    expect(result.current.state.totalContributions.btn ?? 0).toBe(0);
  });

});
