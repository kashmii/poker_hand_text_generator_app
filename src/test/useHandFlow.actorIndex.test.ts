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

/** 4人テーブル: [BTN=0, SB=1, BB=2, UTG=3] */
function makeSession4way(): SessionConfig {
  return {
    ...makeSession3way(),
    players: [
      { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
      { id: 'sb',  name: 'SB',  stack: 1000, position: 1 },
      { id: 'bb',  name: 'BB',  stack: 1000, position: 2 },
      { id: 'utg', name: 'UTG', stack: 1000, position: 3 },
    ],
  };
}

/** 5人テーブル: [BTN=0, SB=1, BB=2, UTG=3, HJ=4] */
function makeSession5way(): SessionConfig {
  return {
    ...makeSession3way(),
    players: [
      { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
      { id: 'sb',  name: 'SB',  stack: 1000, position: 1 },
      { id: 'bb',  name: 'BB',  stack: 1000, position: 2 },
      { id: 'utg', name: 'UTG', stack: 1000, position: 3 },
      { id: 'hj',  name: 'HJ',  stack: 1000, position: 4 },
    ],
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

/** プリフロップを全員コールで終わらせてフロップへ進めるヘルパー（4way） */
function goToFlop4way(
  result: ReturnType<typeof renderHook<ReturnType<typeof useHandFlow>, SessionConfig>>['result'],
) {
  skipHoleCards(result);
  act(() => { result.current.commitAction('call'); });   // UTG call
  act(() => { result.current.commitAction('call'); });   // BTN call
  act(() => { result.current.commitAction('call'); });   // SB call
  act(() => { result.current.commitAction('check'); });  // BB check
  act(() => { result.current.confirmBoard(); });
}

// ========== テスト ==========

describe('useHandFlow: アクション順序・インデックス管理', () => {

  // ------------------------------------------------------------------
  // プリフロップのアクション順序
  // ------------------------------------------------------------------
  describe('プリフロップのアクター順序', () => {

    it('3way: 最初のアクターはBTN（preflopOrder[0]）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      // preflopOrder = [BTN, SB, BB]
      expect(result.current.actorId).toBe('btn');
    });

    it('3way: BTNコール後、次のアクターはSB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call
      expect(result.current.actorId).toBe('sb');
    });

    it('3way: BTN→SBコール後、次のアクターはBB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call
      act(() => { result.current.commitAction('call'); }); // SB call
      expect(result.current.actorId).toBe('bb');
    });

    it('4way: 最初のアクターはUTG（preflopOrder[0]）', () => {
      // preflopOrder = [UTG, BTN, SB, BB]
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);
      expect(result.current.actorId).toBe('utg');
    });

    it('4way: UTG→BTN→SBコール後、次のアクターはBB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // UTG
      act(() => { result.current.commitAction('call'); }); // BTN
      act(() => { result.current.commitAction('call'); }); // SB
      expect(result.current.actorId).toBe('bb');
    });

    it('5way: 最初のアクターはUTG（index=3）', () => {
      // preflopOrder = [UTG, HJ, BTN, SB, BB]
      const { result } = renderHook(() => useHandFlow(makeSession5way()));
      skipHoleCards(result);
      expect(result.current.actorId).toBe('utg');
    });

    it('5way: UTG→HJ→BTN→SBコール後、次のアクターはBB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession5way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // UTG
      act(() => { result.current.commitAction('call'); }); // HJ
      act(() => { result.current.commitAction('call'); }); // BTN
      act(() => { result.current.commitAction('call'); }); // SB
      expect(result.current.actorId).toBe('bb');
    });

  });

  // ------------------------------------------------------------------
  // プリフロップでのフォールド後の次アクター
  // ------------------------------------------------------------------
  describe('プリフロップ: フォールド後の次アクター', () => {

    it('3way: BTNフォールド後、次のアクターはSB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('fold'); }); // BTN fold
      expect(result.current.actorId).toBe('sb');
    });

    it('3way: BTN→SBがフォールド後、残りはBBのみ → winner phaseへ遷移', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('fold'); }); // BTN fold
      act(() => { result.current.commitAction('fold'); }); // SB fold
      expect(result.current.state.phase).toBe('winner');
    });

    it('4way: UTGフォールド後、次のアクターはBTN', () => {
      // preflopOrder = [UTG, BTN, SB, BB]
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('fold'); }); // UTG fold
      expect(result.current.actorId).toBe('btn');
    });

    it('4way: UTG→BTNフォールド後、次のアクターはSB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('fold'); }); // UTG fold
      act(() => { result.current.commitAction('fold'); }); // BTN fold
      expect(result.current.actorId).toBe('sb');
    });

    it('4way: UTG→BTN→SBフォールド後、BBのみ残 → winner phase', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('fold'); }); // UTG fold
      act(() => { result.current.commitAction('fold'); }); // BTN fold
      act(() => { result.current.commitAction('fold'); }); // SB fold
      expect(result.current.state.phase).toBe('winner');
    });

    it('4way: BTNレイズ後、SBがフォールド → 次のアクターはBB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);
      // preflopOrder = [UTG, BTN, SB, BB]
      act(() => { result.current.commitAction('call'); });      // UTG call
      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('fold'); });       // SB fold
      expect(result.current.actorId).toBe('bb');
    });

  });

  // ------------------------------------------------------------------
  // ポストフロップのアクター順序
  // ------------------------------------------------------------------
  describe('ポストフロップのアクター順序', () => {

    it('3way: フロップ開始時の最初のアクターはSB（postflopOrder[0]）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      // postflopOrder = [SB, BB, BTN]
      expect(result.current.actorId).toBe('sb');
    });

    it('3way: SBチェック後、次のアクターはBB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('check'); }); // SB check
      expect(result.current.actorId).toBe('bb');
    });

    it('3way: SB→BBチェック後、次のアクターはBTN', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('check'); }); // SB check
      act(() => { result.current.commitAction('check'); }); // BB check
      expect(result.current.actorId).toBe('btn');
    });

    it('4way: フロップ開始時の最初のアクターはSB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      goToFlop4way(result);
      // postflopOrder = [SB, BB, UTG, BTN]
      expect(result.current.actorId).toBe('sb');
    });

    it('4way: SB→BB→UTGチェック後、次のアクターはBTN', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      goToFlop4way(result);

      act(() => { result.current.commitAction('check'); }); // SB check
      act(() => { result.current.commitAction('check'); }); // BB check
      act(() => { result.current.commitAction('check'); }); // UTG check
      expect(result.current.actorId).toBe('btn');
    });

  });

  // ------------------------------------------------------------------
  // ポストフロップでのフォールド後の次アクター
  // ------------------------------------------------------------------
  describe('ポストフロップ: フォールド後の次アクター', () => {

    it('3way: SBベット→BBフォールド後、次のアクターはBTN', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      // postflopOrder = [SB, BB, BTN]
      act(() => { result.current.commitAction('bet', 20); }); // SB bet
      act(() => { result.current.commitAction('fold'); });     // BB fold
      expect(result.current.actorId).toBe('btn');
    });

    it('3way: SBフォールド後（チェック後のベット後に）次のアクターがBBになる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      // postflopOrder = [SB, BB, BTN]
      act(() => { result.current.commitAction('check'); });    // SB check
      act(() => { result.current.commitAction('check'); });    // BB check
      act(() => { result.current.commitAction('bet', 20); }); // BTN bet
      act(() => { result.current.commitAction('fold'); });     // SB fold (次はBB)
      expect(result.current.actorId).toBe('bb');
    });

    it('4way: SBがフォールドした後のactiveOrderにSBが含まれない', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      goToFlop4way(result);
      // postflopOrder = [SB, BB, UTG, BTN]
      act(() => { result.current.commitAction('fold'); }); // SB fold
      // 次はBB
      expect(result.current.actorId).toBe('bb');
      // foldedIdsにSBが含まれる
      expect(result.current.state.foldedIds.has('sb')).toBe(true);
    });

    it('4way: BB→UTGがフォールドした後、次のアクターはBTN', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      goToFlop4way(result);
      // postflopOrder = [SB, BB, UTG, BTN]
      act(() => { result.current.commitAction('check'); }); // SB check
      act(() => { result.current.commitAction('bet', 20); }); // BB bet
      act(() => { result.current.commitAction('fold'); }); // UTG fold（次はBTN）
      expect(result.current.actorId).toBe('btn');
    });

  });

  // ------------------------------------------------------------------
  // ストリート遷移後のアクターインデックスリセット
  // ------------------------------------------------------------------
  describe('ストリート遷移後のインデックスリセット', () => {

    it('フロップ移行後にcurrentActorIdxが0にリセットされる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      // BTNコール → SBコール → BBチェックでフロップへ
      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('check'); });

      expect(result.current.state.currentActorIdx).toBe(0);
    });

    it('フロップ移行後のアクターはSB（postflopOrder[0]）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      // actorIdxが0にリセットされてpostflopOrder[0]=SBになる
      expect(result.current.actorId).toBe('sb');
    });

    it('フロップ移行後、ターン移行後もcurrentActorIdxが0にリセットされる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      // フロップ全員チェック → ターンへ
      act(() => { result.current.commitAction('check'); }); // SB
      act(() => { result.current.commitAction('check'); }); // BB
      act(() => { result.current.commitAction('check'); }); // BTN
      // board-input → confirmBoard
      act(() => { result.current.confirmBoard(); });

      expect(result.current.state.currentActorIdx).toBe(0);
      expect(result.current.actorId).toBe('sb');
    });

    it('プリフロップ終盤（BBがindex=2の後）でフロップ移行後はindex=0に戻る', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      // preflopOrder = [BTN, SB, BB] → BBはindex=2
      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('call'); });
      // ここでBBがindex=2
      expect(result.current.state.currentActorIdx).toBe(2);
      act(() => { result.current.commitAction('check'); }); // BB check → フロップへ

      // フロップではindex=0にリセット
      expect(result.current.state.currentActorIdx).toBe(0);
    });

  });

  // ------------------------------------------------------------------
  // currentActorIdxの詳細な値を検証
  // ------------------------------------------------------------------
  describe('currentActorIdxの値', () => {

    it('初期状態のcurrentActorIdxは0', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.state.currentActorIdx).toBe(0);
    });

    it('1アクション後のcurrentActorIdxは1', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call
      expect(result.current.state.currentActorIdx).toBe(1);
    });

    it('2アクション後のcurrentActorIdxは2', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call
      act(() => { result.current.commitAction('call'); }); // SB call
      expect(result.current.state.currentActorIdx).toBe(2);
    });

    it('フォールドによってリストが縮んだ後、同じidxで正しいプレイヤーを指す', () => {
      // preflopOrder = [BTN, SB, BB]
      // BTN(idx=0)がフォールド → newOrder=[SB, BB], newIdx=0%2=0 → SBがアクター
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('fold'); }); // BTN fold (idx=0)
      // 新しいorder=[SB,BB], idx=0%2=0 → SB
      expect(result.current.state.currentActorIdx).toBe(0);
      expect(result.current.actorId).toBe('sb');
    });

    it('4way: SB(idx=1)がフォールド後、idx=1%3=1 → BB', () => {
      // preflopOrder = [UTG, BTN, SB, BB]
      // UTGコール(idx→1) → BTNコール(idx→2) → SB(idx=2)フォールド
      // newOrder=[UTG, BTN, BB], 2%3=2 → BB
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // UTG call (idx→1)
      act(() => { result.current.commitAction('call'); }); // BTN call (idx→2)
      act(() => { result.current.commitAction('fold'); }); // SB fold (idx=2)
      // newOrder=[UTG,BTN,BB], 2%3=2 → BB
      expect(result.current.actorId).toBe('bb');
    });

    it('ポストフロップ: SB(idx=0)がフォールド後、idx=0%2=0 → BB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      // postflopOrder = [SB, BB, BTN]
      act(() => { result.current.commitAction('fold'); }); // SB fold (idx=0)
      // newOrder=[BB, BTN], 0%2=0 → BB
      expect(result.current.state.currentActorIdx).toBe(0);
      expect(result.current.actorId).toBe('bb');
    });

    it('ポストフロップ: BB(idx=1)がフォールド後、idx=1%2=1 → BTN', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      // postflopOrder = [SB, BB, BTN]
      act(() => { result.current.commitAction('check'); }); // SB check (idx→1)
      act(() => { result.current.commitAction('fold'); });  // BB fold (idx=1)
      // newOrder=[SB, BTN], 1%2=1 → BTN
      expect(result.current.actorId).toBe('btn');
    });

  });

});
