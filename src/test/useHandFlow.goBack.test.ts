import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHandFlow } from '../components/hand/useHandFlow';
import type { SessionConfig } from '../types/poker';

// ========== テスト用フィクスチャ ==========

/** 3人テーブル: [BTN=0, SB=1, BB=2] */
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
    smallBlind: 5,
    bigBlind: 10,
    ante: 0,
    straddle: 0,
    currency: '$',
    venueName: '',
    date: '2024-01-01',
  };
}

/** hole-cards フェーズをスキップしてアクションフェーズへ進める */
function skipHoleCards(
  result: ReturnType<typeof renderHook<ReturnType<typeof useHandFlow>, SessionConfig>>['result'],
) {
  act(() => {
    result.current.confirmHoleCards({ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' });
  });
}

/** プリフロップを全員コールで終わらせてフロップへ進めるヘルパー（3way） */
function goToFlop3way(
  result: ReturnType<typeof renderHook<ReturnType<typeof useHandFlow>, SessionConfig>>['result'],
) {
  skipHoleCards(result);
  act(() => { result.current.commitAction('call'); });   // BTN call
  act(() => { result.current.commitAction('call'); });   // SB call
  act(() => { result.current.commitAction('check'); });  // BB check
  act(() => { result.current.confirmBoard(); });
}

// ========== テスト ==========

describe('useHandFlow: goBack（履歴管理）', () => {

  // ------------------------------------------------------------------
  // 初期状態
  // ------------------------------------------------------------------
  describe('初期状態', () => {

    it('初期状態では canGoBack は false', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      expect(result.current.canGoBack).toBe(false);
    });

    it('初期状態では history は空', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      expect(result.current.history.length).toBe(0);
    });

    it('履歴が空のときに goBack を呼んでも state は変化しない', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      const stateBefore = result.current.state;

      act(() => { result.current.goBack(); });

      expect(result.current.state).toEqual(stateBefore);
    });

  });

  // ------------------------------------------------------------------
  // confirmHoleCards 後の履歴
  // ------------------------------------------------------------------
  describe('confirmHoleCards 後', () => {

    it('confirmHoleCards 後に canGoBack が true になる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.canGoBack).toBe(true);
    });

    it('confirmHoleCards 後に history が 1 件になる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.history.length).toBe(1);
    });

    it('confirmHoleCards 後に goBack すると hole-cards フェーズに戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.state.phase).toBe('action');

      act(() => { result.current.goBack(); });

      expect(result.current.state.phase).toBe('hole-cards');
    });

    it('goBack 後は canGoBack が false に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.goBack(); });

      expect(result.current.canGoBack).toBe(false);
    });

  });

  // ------------------------------------------------------------------
  // アクション後の goBack
  // ------------------------------------------------------------------
  describe('アクション後の goBack', () => {

    it('1アクション後に goBack するとそのアクションが取り消される', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      // BTN call → actorId が SB になる
      act(() => { result.current.commitAction('call'); }); // BTN call
      expect(result.current.actorId).toBe('sb');

      act(() => { result.current.goBack(); });

      // BTN のアクションに戻る
      expect(result.current.actorId).toBe('btn');
    });

    it('goBack 後にストリートの記録も元に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call
      expect(result.current.state.streets.preflop.length).toBe(1);

      act(() => { result.current.goBack(); });

      expect(result.current.state.streets.preflop.length).toBe(0);
    });

    it('goBack 後に pot が元に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      const potBefore = result.current.state.pot; // 15

      act(() => { result.current.commitAction('call'); }); // BTN call → pot=25
      expect(result.current.state.pot).toBe(25);

      act(() => { result.current.goBack(); });

      expect(result.current.state.pot).toBe(potBefore);
    });

    it('goBack 後に currentActorIdx が元に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.state.currentActorIdx).toBe(0);

      act(() => { result.current.commitAction('call'); }); // BTN call → idx=1
      expect(result.current.state.currentActorIdx).toBe(1);

      act(() => { result.current.goBack(); });

      expect(result.current.state.currentActorIdx).toBe(0);
    });

    it('fold 後に goBack すると foldedIds から除外される', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('fold'); }); // BTN fold
      expect(result.current.state.foldedIds.has('btn')).toBe(true);

      act(() => { result.current.goBack(); });

      expect(result.current.state.foldedIds.has('btn')).toBe(false);
    });

    it('raise 後に goBack すると currentBet が元に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      const betBefore = result.current.state.currentBet; // 10

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      expect(result.current.state.currentBet).toBe(30);

      act(() => { result.current.goBack(); });

      expect(result.current.state.currentBet).toBe(betBefore);
    });

    it('raise 後に goBack すると closingPlayerId が元に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      const closingBefore = result.current.state.closingPlayerId; // 'bb'

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise → closing 変化
      act(() => { result.current.goBack(); });

      expect(result.current.state.closingPlayerId).toBe(closingBefore);
    });

    it('連続した goBack でアクション履歴を複数手戻れる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });  // BTN call
      act(() => { result.current.commitAction('call'); });  // SB call
      // actorId は BB
      expect(result.current.actorId).toBe('bb');

      act(() => { result.current.goBack(); }); // SB call を取り消し → SB に戻る
      expect(result.current.actorId).toBe('sb');

      act(() => { result.current.goBack(); }); // BTN call を取り消し → BTN に戻る
      expect(result.current.actorId).toBe('btn');
    });

    it('goBack 後に再度アクションを実行できる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });  // BTN call
      act(() => { result.current.goBack(); });              // BTN call を取り消し

      // 今度は raise にやり直す
      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      expect(result.current.state.currentBet).toBe(30);
      expect(result.current.state.streets.preflop[0].type).toBe('raise');
    });

  });

  // ------------------------------------------------------------------
  // ストリート遷移後の goBack
  // ------------------------------------------------------------------
  describe('ストリート遷移後の goBack', () => {

    it('フロップ遷移後に goBack するとプリフロップに戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });   // BTN call
      act(() => { result.current.commitAction('call'); });   // SB call
      act(() => { result.current.commitAction('check'); });  // BB check → board-input(flop)
      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('flop');

      act(() => { result.current.goBack(); }); // board-input 直前（BB check）に戻る

      expect(result.current.state.phase).toBe('action');
      expect(result.current.state.currentStreet).toBe('preflop');
      expect(result.current.actorId).toBe('bb');
    });

    it('confirmBoard 後に goBack すると board-input に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('check'); });  // → board-input
      act(() => { result.current.confirmBoard(); });          // → action(flop)
      expect(result.current.state.phase).toBe('action');

      act(() => { result.current.goBack(); });

      expect(result.current.state.phase).toBe('board-input');
    });

    it('フロップのアクション後に goBack するとフロップのアクターに戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      // postflopOrder = [SB, BB, BTN]
      act(() => { result.current.commitAction('check'); }); // SB check → actorId=BB
      expect(result.current.actorId).toBe('bb');

      act(() => { result.current.goBack(); });

      expect(result.current.actorId).toBe('sb');
      expect(result.current.state.currentStreet).toBe('flop');
    });

    it('ストリート遷移後の goBack でリセットされた contributions が元に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('call'); });        // SB call
      act(() => { result.current.commitAction('call'); });        // BB call → board-input(flop)
      // フロップ移行でcontributions=0にリセット
      expect(result.current.state.contributions['btn']).toBe(0);

      act(() => { result.current.goBack(); }); // BB call の直前に戻る

      // プリフロップのcontributionsが復元される
      expect(result.current.state.contributions['btn']).toBe(30);
      expect(result.current.state.contributions['sb']).toBe(30);
    });

  });

  // ------------------------------------------------------------------
  // winner・showdown フェーズ後の goBack
  // ------------------------------------------------------------------
  describe('winner・showdown フェーズ後の goBack', () => {

    it('fold 勝ちで winner になった後に goBack すると action に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('fold'); });        // SB fold
      act(() => { result.current.commitAction('fold'); });        // BB fold → winner
      expect(result.current.state.phase).toBe('winner');

      act(() => { result.current.goBack(); }); // BB fold を取り消し

      expect(result.current.state.phase).toBe('action');
      expect(result.current.actorId).toBe('bb');
    });

    it('winner 確定後に goBack すると winner 選択前に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); });
      act(() => { result.current.commitAction('fold'); });
      act(() => { result.current.commitAction('fold'); }); // → winner phase
      act(() => { result.current.confirmWinner('btn'); });  // → done
      expect(result.current.state.phase).toBe('done');

      act(() => { result.current.goBack(); });

      expect(result.current.state.phase).toBe('winner');
      expect(result.current.state.winnerId).toBeNull();
    });

  });

  // ------------------------------------------------------------------
  // history のスタック動作
  // ------------------------------------------------------------------
  describe('history のスタック動作', () => {

    it('アクションのたびに history が 1 件ずつ増える', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result); // history=1

      act(() => { result.current.commitAction('call'); });  // history=2
      act(() => { result.current.commitAction('call'); });  // history=3
      expect(result.current.history.length).toBe(3);
    });

    it('goBack のたびに history が 1 件ずつ減る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('call'); });
      expect(result.current.history.length).toBe(3);

      act(() => { result.current.goBack(); });
      expect(result.current.history.length).toBe(2);

      act(() => { result.current.goBack(); });
      expect(result.current.history.length).toBe(1);
    });

    it('history を使い切った後は canGoBack が false になる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('call'); });

      act(() => { result.current.goBack(); }); // commitAction を戻す
      act(() => { result.current.goBack(); }); // confirmHoleCards を戻す

      expect(result.current.canGoBack).toBe(false);
      expect(result.current.history.length).toBe(0);
    });

    it('goBack 後に新しいアクションを積むと history が再び増える', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('call'); });
      expect(result.current.history.length).toBe(2);

      act(() => { result.current.goBack(); }); // history=1
      act(() => { result.current.commitAction('raise', 30); }); // history=2

      expect(result.current.history.length).toBe(2);
      expect(result.current.state.currentBet).toBe(30);
    });

  });

});
