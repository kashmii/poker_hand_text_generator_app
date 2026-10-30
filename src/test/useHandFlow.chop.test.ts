import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHandFlow } from '../components/hand/useHandFlow';
import type { SessionConfig, Card, Rank, Suit } from '../types/poker';

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

const c = (s: string): Card => ({ rank: s[0] as Rank, suit: s[1] as Suit });

/** BTN=30 / SB=100 / BB=100 の全員オールイン → リバーのカスケード開始まで */
function toRiverCascade(result: Hook) {
  act(() => { result.current.commitAction('allin', 30); });
  act(() => { result.current.commitAction('allin', 100); });
  act(() => { result.current.commitAction('allin', 100); });
  act(() => { result.current.confirmBoard(); });
  act(() => { result.current.confirmBoard(); });
  act(() => { result.current.confirmBoard(); });
}

/** ボード A♠ K♦ 7♣ 4♠ 2♦ をフロップ/ターン/リバーへ入れる */
function setBoard(result: Hook) {
  const [f1, f2, f3, t, r] = ['As', 'Kd', '7c', '4s', '2d'].map(c);
  act(() => { result.current.updateBoard('flop', 0, f1); });
  act(() => { result.current.updateBoard('flop', 1, f2); });
  act(() => { result.current.updateBoard('flop', 2, f3); });
  act(() => { result.current.updateBoard('turn', 0, t); });
  act(() => { result.current.updateBoard('river', 0, r); });
}

/** 現在のショーダウン対象を、指定の手札で show する */
function showCurrent(result: Hook, hands: Record<string, [string, string]>) {
  const id = result.current.state.showdownQueue[0];
  const [a, b] = hands[id];
  act(() => { result.current.commitShowdown({ playerId: id, action: 'show', cards: [c(a), c(b)] }); });
}

// 手動で勝者を選ぶ場合（autoResolve: false）のチョップ。自動確定は useHandFlow.autoResolve.test.ts
describe('useHandFlow: チョップ（手動選択）', () => {

  it('サイドポットの勝者が複数ならポットを等分し、全員が下位ポットへ持ち越される', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way(), { autoResolve: false }));
    toRiverCascade(result);

    // サイドポット(140)は SB/BB が争う
    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] });
    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] });
    expect(result.current.currentPot?.label).toBe('side pot');

    act(() => { result.current.confirmPotWinner(['sb', 'bb']); });

    // 次はメインポット: 見せていない BTN のショーダウン。SB/BB は両方とも持ち越されて残る
    expect(result.current.state.phase).toBe('showdown');
    expect(result.current.state.showdownQueue).toEqual(['btn']);
    showCurrent(result, { btn: ['3c', '8d'] });

    expect(result.current.state.phase).toBe('winner');
    expect([...result.current.currentPotCandidates].sort()).toEqual(['bb', 'btn', 'sb']);

    act(() => { result.current.confirmPotWinner(['btn']); });

    expect(result.current.state.phase).toBe('done');
    expect(result.current.state.potWinners).toEqual([
      { playerId: 'btn', amount: 90, label: 'main pot' },
      { playerId: 'sb', amount: 70, label: 'side pot' },
      { playerId: 'bb', amount: 70, label: 'side pot' },
    ]);
  });

  it('サイドポットを単独勝者が取り、メインポットはチョップで等分', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way(), { autoResolve: false }));
    toRiverCascade(result);
    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['3c', '8d'] });
    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['3c', '8d'] });
    act(() => { result.current.confirmPotWinner(['sb']); });
    showCurrent(result, { btn: ['Qh', 'Qs'] });
    // メイン 90 を SB と BTN がチョップ → 45 ずつ
    act(() => { result.current.confirmPotWinner(['btn', 'sb']); });

    expect(result.current.state.potWinners).toEqual([
      { playerId: 'sb', amount: 45, label: 'main pot' },
      { playerId: 'btn', amount: 45, label: 'main pot' },
      { playerId: 'sb', amount: 140, label: 'side pot' },
    ]);
  });

  it('単一ポットのチョップは label 付きの複数エントリになる', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way(), { autoResolve: false }));
    // 全員 100 でオールイン → サイドポット無しの 300
    act(() => { result.current.commitAction('allin', 100); });
    act(() => { result.current.commitAction('allin', 100); });
    act(() => { result.current.commitAction('allin', 100); });
    act(() => { result.current.confirmBoard(); });
    act(() => { result.current.confirmBoard(); });
    act(() => { result.current.confirmBoard(); });

    expect(result.current.state.pots).toHaveLength(1);
    expect(result.current.state.phase).toBe('showdown');
    const hands: Record<string, [string, string]> = {
      btn: ['Qc', 'Qd'], sb: ['Qh', 'Qs'], bb: ['3c', '8d'],
    };
    showCurrent(result, hands);
    showCurrent(result, hands);
    showCurrent(result, hands);

    act(() => { result.current.confirmPotWinner(['btn', 'sb']); });

    expect(result.current.state.phase).toBe('done');
    // 300 を2人で → 150 ずつ。ポットが1つでもチョップなので label が付く
    expect(result.current.state.potWinners).toEqual([
      { playerId: 'sb', amount: 150, label: 'main pot' },
      { playerId: 'btn', amount: 150, label: 'main pot' },
    ]);
  });

  it('ボードと全員の手札が揃っていれば自動判定（チョップ含む）が出る', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way(), { autoResolve: false }));
    toRiverCascade(result);
    setBoard(result);

    // ボードが入っていても、まだ手札が揃っていないので判定なし
    expect(result.current.currentPotSuggestion).toBeNull();

    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] });
    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] });

    expect(result.current.state.phase).toBe('winner');
    expect(result.current.currentPotSuggestion?.winnerIds.sort()).toEqual(['bb', 'sb']);
  });

  it('ボードが未入力なら自動判定は出ない（手動選択）', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way(), { autoResolve: false }));
    toRiverCascade(result);
    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] });
    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] });

    expect(result.current.state.phase).toBe('winner');
    expect(result.current.currentPotSuggestion).toBeNull();
  });

  it('チョップ確定後に goBack すると判定前に戻れる', () => {
    const { result } = renderHook(() => useHandFlow(makeSession3way(), { autoResolve: false }));
    toRiverCascade(result);
    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] });
    showCurrent(result, { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] });
    act(() => { result.current.confirmPotWinner(['sb', 'bb']); });
    expect(result.current.state.phase).toBe('showdown');

    act(() => { result.current.goBack(); });
    expect(result.current.state.phase).toBe('winner');
    expect(result.current.currentPot?.label).toBe('side pot');
    expect(result.current.state.potWinners).toEqual([]);
    expect(result.current.state.carriedWinnerIds).toEqual([]);
  });

});
