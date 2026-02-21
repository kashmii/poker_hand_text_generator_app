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

/** hole-cards フェーズをスキップしてアクションフェーズへ進める */
function skipHoleCards(result: ReturnType<typeof renderHook<ReturnType<typeof useHandFlow>, SessionConfig>>['result']) {
  act(() => {
    result.current.confirmHoleCards(
      { rank: 'A', suit: 'h' },
      { rank: 'K', suit: 'h' },
    );
  });
}

// ========== テスト ==========

describe('useHandFlow: ストリート終了ロジック', () => {

  // ------------------------------------------------------------------
  // プリフロップ
  // ------------------------------------------------------------------
  describe('プリフロップ', () => {

    it('【回帰】SBがコールしてもBBのアクションが残る（プリフロップ早期終了バグの防止）', () => {
      // 3way: preflopOrder = [BTN, SB, BB]
      // BTNがレイズ → SBがコール → この時点でallSquaredだがBBはまだ未アクション
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('call'); });       // SB call

      // BBのアクションがまだ残っているはず → phase は 'action' のまま
      expect(result.current.state.phase).toBe('action');
      // 次のアクターはBB
      expect(result.current.actorId).toBe('bb');
    });

    it('BBがコールした後にプリフロップが終了しboard-inputへ遷移する', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('call'); });       // SB call
      act(() => { result.current.commitAction('call'); });       // BB call

      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('flop');
    });

    it('BBがチェック（オプション）でプリフロップが終了する', () => {
      // 全員コール後BBにはチェックの権利がある
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });  // BTN call
      act(() => { result.current.commitAction('call'); });  // SB call
      act(() => { result.current.commitAction('check'); }); // BB check (option)

      expect(result.current.state.phase).toBe('board-input');
    });

    it('4way: UTG→BTN→SBがコール後、BBがチェックで終了', () => {
      // preflopOrder = [UTG, BTN, SB, BB]
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });  // UTG call
      act(() => { result.current.commitAction('call'); });  // BTN call
      act(() => { result.current.commitAction('call'); });  // SB call
      // この時点でphaseはまだ 'action'（BBが残っている）
      expect(result.current.state.phase).toBe('action');
      expect(result.current.actorId).toBe('bb');

      act(() => { result.current.commitAction('check'); }); // BB check
      expect(result.current.state.phase).toBe('board-input');
    });

    it('レイズ後に全員フォールドするとwinner phaseへ遷移する', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('fold'); });       // SB fold
      act(() => { result.current.commitAction('fold'); });       // BB fold

      expect(result.current.state.phase).toBe('winner');
    });

  });

  // ------------------------------------------------------------------
  // フロップ（ポストフロップ）
  // ------------------------------------------------------------------
  describe('フロップ', () => {

    /** プリフロップを全員コールで終わらせてフロップへ進めるヘルパー */
    function goToFlop(result: ReturnType<typeof renderHook<ReturnType<typeof useHandFlow>, SessionConfig>>['result']) {
      skipHoleCards(result);
      act(() => { result.current.commitAction('call'); });  // BTN call
      act(() => { result.current.commitAction('call'); });  // SB call
      act(() => { result.current.commitAction('check'); }); // BB check
      // board-input → confirmBoard でアクションフェーズへ
      act(() => { result.current.confirmBoard(); });
    }

    it('3way 全員チェックでフロップが終了しターンへ遷移する', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop(result);
      // postflopOrder = [SB, BB, BTN]
      act(() => { result.current.commitAction('check'); }); // SB check
      act(() => { result.current.commitAction('check'); }); // BB check
      act(() => { result.current.commitAction('check'); }); // BTN check

      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('turn');
    });

    it('3way BTNベット→SBコール→BBコールでフロップが終了する', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop(result);
      // postflopOrder = [SB, BB, BTN]
      act(() => { result.current.commitAction('check'); });     // SB check
      act(() => { result.current.commitAction('check'); });     // BB check
      act(() => { result.current.commitAction('bet', 30); });   // BTN bet

      // SBとBBにまだアクションが残っている
      expect(result.current.state.phase).toBe('action');
      expect(result.current.actorId).toBe('sb');

      act(() => { result.current.commitAction('call'); });      // SB call
      expect(result.current.state.phase).toBe('action');
      expect(result.current.actorId).toBe('bb');

      act(() => { result.current.commitAction('call'); });      // BB call
      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('turn');
    });

    it('3way SBベット→BBフォールド→BTNコールでフロップが終了する', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop(result);

      act(() => { result.current.commitAction('bet', 20); });   // SB bet
      act(() => { result.current.commitAction('fold'); });       // BB fold
      act(() => { result.current.commitAction('call'); });       // BTN call

      expect(result.current.state.phase).toBe('board-input');
    });

    it('フォールドで1人残った場合はwinner phaseへ遷移する', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop(result);

      act(() => { result.current.commitAction('bet', 20); });   // SB bet
      act(() => { result.current.commitAction('fold'); });       // BB fold
      act(() => { result.current.commitAction('fold'); });       // BTN fold

      expect(result.current.state.phase).toBe('winner');
    });

    it('ベット直後に全員揃っていればベッターがorderの末尾で即終了する', () => {
      // postflopOrder = [SB, BB, BTN]
      // SBとBBがチェック後BTNがベット → BTNはorderの末尾 → 他全員がもうコールする機会がない
      // → ただしSBとBBにまだアクションは残る（ここはSBとBBが残る）
      // 確認: BTNがベットした直後はまだ終了しない
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop(result);

      act(() => { result.current.commitAction('check'); });   // SB check
      act(() => { result.current.commitAction('check'); });   // BB check
      act(() => { result.current.commitAction('bet', 30); }); // BTN bet (末尾)

      // BTNはorderの末尾なのでSB・BBにまだアクションがある
      expect(result.current.state.phase).toBe('action');
    });

  });

  // ------------------------------------------------------------------
  // ストリート遷移後の状態リセット
  // ------------------------------------------------------------------
  describe('ストリート遷移後のリセット', () => {

    it('フロップ開始時にcurrentBetが0にリセットされる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('call'); });       // SB call
      act(() => { result.current.commitAction('call'); });       // BB call
      // board-input フェーズへ
      expect(result.current.state.currentBet).toBe(0);
    });

    it('フロップ開始時にcontributionsが全員0にリセットされる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('call'); });       // SB call
      act(() => { result.current.commitAction('call'); });       // BB call

      const contribs = result.current.state.contributions;
      expect(contribs['btn']).toBe(0);
      expect(contribs['sb']).toBe(0);
      expect(contribs['bb']).toBe(0);
    });

    it('フロップ開始時にcurrentActorIdxが0にリセットされる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('check'); });

      expect(result.current.state.currentActorIdx).toBe(0);
    });

  });

});
