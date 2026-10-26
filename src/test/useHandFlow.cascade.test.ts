import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHandFlow } from '../components/hand/useHandFlow';
import type { SessionConfig, Card } from '../types/poker';

// 3人テーブル: [BTN=0, SB=1, BB=2]、ブラインド 1/2
function makeSession3way(): SessionConfig {
  return {
    players: [
      { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
      { id: 'sb',  name: 'SB',  stack: 1000, position: 1 },
      { id: 'bb',  name: 'BB',  stack: 1000, position: 2 },
    ],
    heroId: 'btn',
    heroPosition: 'BTN',
    heroEffectiveStack: 100,
    smallBlind: 1,
    bigBlind: 2,
    ante: 0,
    straddle: 0,
    currency: '$',
    venueName: '',
    date: '2024-01-01',
  };
}

type Hook = ReturnType<typeof renderHook<ReturnType<typeof useHandFlow>, SessionConfig>>['result'];

function skipHoleCards(result: Hook) {
  act(() => { result.current.confirmHoleCards({ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' }); });
}

const CARDS: [Card, Card] = [{ rank: '2', suit: 'c' }, { rank: '3', suit: 'd' }];

/** 現在のショーダウン対象を show する */
function showCurrent(result: Hook) {
  const id = result.current.state.showdownQueue[0];
  act(() => { result.current.commitShowdown({ playerId: id, action: 'show', cards: CARDS }); });
}

/** 3人ショートオールイン(BTN=30/SB=100/BB=100)でリバーのカスケード開始まで進める */
function toRiverCascade(result: Hook) {
  skipHoleCards(result);
  act(() => { result.current.commitAction('allin', 30); });  // BTN
  act(() => { result.current.commitAction('allin', 100); }); // SB
  act(() => { result.current.commitAction('allin', 100); }); // BB → 全員allin
  act(() => { result.current.confirmBoard(); }); // flop
  act(() => { result.current.confirmBoard(); }); // turn
  act(() => { result.current.confirmBoard(); }); // river → カスケード開始
}

describe('useHandFlow: サイドポットのカスケード解決（要求17）', () => {

  it('リバー到達でまずサイドポット参加者(SB/BB)のショーダウンから始まる', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way()));
    toRiverCascade(result);

    expect(result.current.state.phase).toBe('showdown');
    // この時点の提示対象はサイドポット参加者(SB/BB)のみ。BTN(メインのみ)は含まれない
    const queueAndDone = new Set([
      ...result.current.state.showdownQueue,
      ...result.current.state.showdownRecords.map((r) => r.playerId),
    ]);
    expect(queueAndDone.has('btn')).toBe(false);
    expect(queueAndDone.has('sb')).toBe(true);
    expect(queueAndDone.has('bb')).toBe(true);
  });

  it('サイド→メインの順に判定し、メインはサイド勝者＋ショートの勝負になる', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way()));
    toRiverCascade(result);

    // サイドポット: SB/BB を見せる
    showCurrent(result);
    showCurrent(result);

    // サイドポットの勝者選択
    expect(result.current.state.phase).toBe('winner');
    expect(result.current.currentPot?.label).toBe('side pot');
    expect(result.current.currentPot?.amount).toBe(140);
    expect([...result.current.currentPotCandidates].sort()).toEqual(['bb', 'sb']);

    // BB をサイドポット勝者に
    act(() => { result.current.confirmPotWinner('bb'); });

    // 次はメインポット。まだ見せていない BTN(ショート)のショーダウンへ
    expect(result.current.state.phase).toBe('showdown');
    expect(result.current.state.showdownQueue).toContain('btn');
    showCurrent(result); // BTN show

    // メインポットの勝者選択: 候補は「サイド勝者 BB」＋「ショート BTN」。SB(サイド敗者)は除外
    expect(result.current.state.phase).toBe('winner');
    expect(result.current.currentPot?.label).toBe('main pot');
    expect(result.current.currentPot?.amount).toBe(90);
    expect([...result.current.currentPotCandidates].sort()).toEqual(['bb', 'btn']);

    // BTN(ショート)がメインを獲得
    act(() => { result.current.confirmPotWinner('btn'); });

    expect(result.current.state.phase).toBe('done');
    expect(result.current.state.potWinners).toEqual([
      { playerId: 'btn', amount: 90, label: 'main pot' },
      { playerId: 'bb', amount: 140, label: 'side pot' },
    ]);
  });

  it('サイドポット確定後に goBack すると判定前に戻れる', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way()));
    toRiverCascade(result);
    showCurrent(result);
    showCurrent(result);
    expect(result.current.state.phase).toBe('winner'); // side pot 選択中

    act(() => { result.current.confirmPotWinner('bb'); });
    expect(result.current.state.phase).toBe('showdown'); // main用 BTN ショーへ

    act(() => { result.current.goBack(); });
    // サイドポットの勝者選択に戻る
    expect(result.current.state.phase).toBe('winner');
    expect(result.current.currentPot?.label).toBe('side pot');
  });

});
