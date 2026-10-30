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

type Options = { autoResolve?: boolean };
const setup = (options?: Options) => renderHook(() => useHandFlow(makeSession3way(), options));
type Hook = ReturnType<typeof setup>['result'];

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

/** ボード A♠ K♦ 7♣ 4♠ 2♦ */
function setBoard(result: Hook) {
  const [f1, f2, f3, t, r] = ['As', 'Kd', '7c', '4s', '2d'].map(c);
  act(() => { result.current.updateBoard('flop', 0, f1); });
  act(() => { result.current.updateBoard('flop', 1, f2); });
  act(() => { result.current.updateBoard('flop', 2, f3); });
  act(() => { result.current.updateBoard('turn', 0, t); });
  act(() => { result.current.updateBoard('river', 0, r); });
}

function showCurrent(result: Hook, hands: Record<string, [string, string]>) {
  const id = result.current.state.showdownQueue[0];
  const [a, b] = hands[id];
  act(() => { result.current.commitShowdown({ playerId: id, action: 'show', cards: [c(a), c(b)] }); });
}

describe('useHandFlow: 勝者の自動確定（autoResolve）', () => {

  it('同率ならチョップとして、勝者選択を出さずに全ポットを確定する', () => {
    const { result } = setup({ autoResolve: true });
    toRiverCascade(result);
    setBoard(result);
    const hands: Record<string, [string, string]> = {
      sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'], btn: ['3c', '8d'],
    };

    showCurrent(result, hands);
    showCurrent(result, hands);
    // サイドポットは自動確定され、勝者選択を挟まずメインポットのショーダウンへ
    expect(result.current.state.phase).toBe('showdown');
    expect(result.current.state.showdownQueue).toEqual(['btn']);

    showCurrent(result, hands);
    // メインポットも自動確定（BTN は A ハイで負け、SB/BB がチョップ）
    expect(result.current.state.phase).toBe('done');
    expect(result.current.state.potWinners).toEqual([
      { playerId: 'sb', amount: 45, label: 'main pot' },
      { playerId: 'bb', amount: 45, label: 'main pot' },
      { playerId: 'sb', amount: 70, label: 'side pot' },
      { playerId: 'bb', amount: 70, label: 'side pot' },
    ]);
  });

  it('単独の勝者もそのまま確定し、サイドポットの敗者はメインポットから外れる', () => {
    const { result } = setup({ autoResolve: true });
    toRiverCascade(result);
    setBoard(result);
    const hands: Record<string, [string, string]> = {
      sb: ['Qc', 'Qd'], bb: ['9c', '8d'], btn: ['3h', '9d'],
    };

    showCurrent(result, hands);
    showCurrent(result, hands);
    // BB は側ポットで負けて除外され、メインは SB と BTN の勝負
    expect(result.current.state.showdownQueue).toEqual(['btn']);
    showCurrent(result, hands);

    expect(result.current.state.phase).toBe('done');
    expect(result.current.state.potWinners).toEqual([
      { playerId: 'sb', amount: 90, label: 'main pot' },
      { playerId: 'sb', amount: 140, label: 'side pot' },
    ]);
  });

  it('ボードが揃っていなければ自動確定せず、勝者選択（手動）に回る', () => {
    const { result } = setup({ autoResolve: true });
    toRiverCascade(result);
    const hands: Record<string, [string, string]> = { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] };
    showCurrent(result, hands);
    showCurrent(result, hands);

    expect(result.current.state.phase).toBe('winner');
    expect(result.current.currentPot?.label).toBe('side pot');
  });

  it('autoResolve: false なら、ボードと手札が揃っていても勝者選択に回る', () => {
    const { result } = setup({ autoResolve: false });
    toRiverCascade(result);
    setBoard(result);
    const hands: Record<string, [string, string]> = { sb: ['Qc', 'Qd'], bb: ['Qh', 'Qs'] };
    showCurrent(result, hands);
    showCurrent(result, hands);

    expect(result.current.state.phase).toBe('winner');
    expect(result.current.currentPotSuggestion?.winnerIds.sort()).toEqual(['bb', 'sb']);
  });

  it('自動確定の後に goBack すると、最後のショーダウン入力の直前に戻る（確定は取り消される）', () => {
    const { result } = setup({ autoResolve: true });
    toRiverCascade(result);
    setBoard(result);
    const hands: Record<string, [string, string]> = {
      sb: ['Qc', 'Qd'], bb: ['9c', '8d'], btn: ['3h', '9d'],
    };
    showCurrent(result, hands);
    showCurrent(result, hands);
    showCurrent(result, hands);
    expect(result.current.state.phase).toBe('done');

    act(() => { result.current.goBack(); });
    expect(result.current.state.phase).toBe('showdown');
    expect(result.current.state.showdownQueue).toEqual(['btn']);
    expect(result.current.state.potWinners).toHaveLength(1); // サイドポットの確定だけが残る
  });

  it('単一ポットでも、同率ならチョップで自動確定する', () => {
    const { result } = setup({ autoResolve: true });
    act(() => { result.current.commitAction('allin', 100); });
    act(() => { result.current.commitAction('allin', 100); });
    act(() => { result.current.commitAction('allin', 100); });
    act(() => { result.current.confirmBoard(); });
    act(() => { result.current.confirmBoard(); });
    act(() => { result.current.confirmBoard(); });
    setBoard(result);
    const hands: Record<string, [string, string]> = {
      btn: ['Qc', 'Qd'], sb: ['Qh', 'Qs'], bb: ['3c', '8d'],
    };
    showCurrent(result, hands);
    showCurrent(result, hands);
    showCurrent(result, hands);

    expect(result.current.state.phase).toBe('done');
    expect(result.current.state.potWinners).toEqual([
      { playerId: 'sb', amount: 150, label: 'main pot' },
      { playerId: 'btn', amount: 150, label: 'main pot' },
    ]);
  });

});
