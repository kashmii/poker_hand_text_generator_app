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
    result.current.setHoleCards([{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' }]);
    result.current.startAction();
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
  // 手札入力フェーズ（setHoleCards / startAction）
  // ------------------------------------------------------------------
  describe('手札入力フェーズ', () => {

    it('初期フェーズは hole-cards（手札入力画面）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      expect(result.current.state.phase).toBe('hole-cards');
    });

    it('startAction で action フェーズへ進む（スキップ相当）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      act(() => { result.current.startAction(); });
      expect(result.current.state.phase).toBe('action');
    });

    it('手札設定・フェーズ遷移では history を積まない（canGoBack は false のまま）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.canGoBack).toBe(false);
      expect(result.current.history.length).toBe(0);
    });

    it('1人目のアクション入力では canBackToHoleCards が true、backToHoleCards で手札入力へ戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      expect(result.current.canBackToHoleCards).toBe(false);
      skipHoleCards(result);
      expect(result.current.canBackToHoleCards).toBe(true);

      act(() => { result.current.backToHoleCards(); });

      expect(result.current.state.phase).toBe('hole-cards');
      expect(result.current.canBackToHoleCards).toBe(false);
      // 入力済みの手札は保持される
      expect(result.current.state.holeCards).not.toBeNull();
    });

    it('アクションを1つ入れると canBackToHoleCards は false になる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('fold'); });
      expect(result.current.canBackToHoleCards).toBe(false);
      expect(result.current.canGoBack).toBe(true);
    });

    it('setHoleCards で手札が state に反映される', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.state.holeCards).toEqual([
        { rank: 'A', suit: 'h' },
        { rank: 'K', suit: 'h' },
      ]);
    });

    it('setHoleCards(null) で手札をクリアできる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.setHoleCards(null); });
      expect(result.current.state.holeCards).toBeNull();
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

    it('winner（フォールド勝ち）から goBack すると最後の fold 前に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('fold'); });      // SB fold
      act(() => { result.current.commitAction('fold'); });      // BB fold → winner
      expect(result.current.state.phase).toBe('winner');

      act(() => { result.current.goBack(); }); // BB fold を取り消し

      expect(result.current.state.phase).toBe('action');
      expect(result.current.actorId).toBe('bb');
    });

  });

  // ------------------------------------------------------------------
  // history のスタック動作
  // ------------------------------------------------------------------
  describe('history のスタック動作', () => {

    it('アクションのたびに history が 1 件ずつ増える', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result); // history=0（手札設定は履歴に積まない）

      act(() => { result.current.commitAction('call'); });  // history=1
      act(() => { result.current.commitAction('call'); });  // history=2
      expect(result.current.history.length).toBe(2);
    });

    it('goBack のたびに history が 1 件ずつ減る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('call'); });
      expect(result.current.history.length).toBe(2);

      act(() => { result.current.goBack(); });
      expect(result.current.history.length).toBe(1);

      act(() => { result.current.goBack(); });
      expect(result.current.history.length).toBe(0);
    });

    it('history を使い切った後は canGoBack が false になる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('call'); });

      act(() => { result.current.goBack(); }); // commitAction を戻す

      expect(result.current.canGoBack).toBe(false);
      expect(result.current.history.length).toBe(0);
    });

    it('goBack 後に新しいアクションを積むと history が再び増える', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('call'); });
      expect(result.current.history.length).toBe(1);

      act(() => { result.current.goBack(); }); // history=0
      act(() => { result.current.commitAction('raise', 30); }); // history=1

      expect(result.current.history.length).toBe(1);
      expect(result.current.state.currentBet).toBe(30);
    });

  });

  // ------------------------------------------------------------------
  // ストラドルの取り消し
  // ------------------------------------------------------------------
  describe('ストラドルを goBack で取り消す', () => {

    /** 6人テーブル: [BTN, SB, BB, UTG, HJ, CO] */
    function makeSession6max(): SessionConfig {
      const ids = ['btn', 'sb', 'bb', 'utg', 'hj', 'co'];
      return {
        ...makeSession3way(),
        players: ids.map((id, i) => ({ id, name: id.toUpperCase(), stack: 1000, position: i })),
      };
    }

    it('アクション順・ストラドル額・ストラドル可否がストラドル前に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession6max()));
      skipHoleCards(result);
      expect(result.current.actorId).toBe('utg');

      act(() => { result.current.commitAction('straddle'); }); // UTG straddle 20
      expect(result.current.actorId).toBe('hj');
      expect(result.current.currentStraddle).toBe(20);

      act(() => { result.current.goBack(); });
      expect(result.current.actorId).toBe('utg');
      expect(result.current.currentStraddle).toBe(0);
      expect(result.current.canStraddle).toBe(true);
      expect(result.current.state.preflopOrder).toEqual(['utg', 'hj', 'co', 'btn', 'sb', 'bb']);
    });

    it('取り消し後に UTG がコールすると、次は HJ の番になる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession6max()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('straddle'); });
      act(() => { result.current.goBack(); });

      act(() => { result.current.commitAction('call'); }); // UTG call 10
      expect(result.current.actorId).toBe('hj');
      expect(result.current.state.closingPlayerId).toBe('bb');
    });

  });

});
