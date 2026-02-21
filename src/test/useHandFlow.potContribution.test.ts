import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHandFlow } from '../components/hand/useHandFlow';
import type { SessionConfig } from '../types/poker';

// ========== テスト用フィクスチャ ==========

/** 3人テーブル: [BTN=0, SB=1, BB=2] */
function makeSession3way(smallBlind = 5, bigBlind = 10): SessionConfig {
  return {
    players: [
      { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
      { id: 'sb',  name: 'SB',  stack: 1000, position: 1 },
      { id: 'bb',  name: 'BB',  stack: 1000, position: 2 },
    ],
    heroId: 'btn',
    heroPosition: 'BTN',
    heroEffectiveStack: 100,
    smallBlind,
    bigBlind,
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

describe('useHandFlow: pot・contribution 計算', () => {

  // ------------------------------------------------------------------
  // 初期状態（SB/BB の強制投資）
  // ------------------------------------------------------------------
  describe('初期状態', () => {

    it('3way: 初期potはSB+BB（5+10=15）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.state.pot).toBe(15);
    });

    it('3way: 初期contributionsはSB=5, BB=10, BTN=0', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      const c = result.current.state.contributions;
      expect(c['sb']).toBe(5);
      expect(c['bb']).toBe(10);
      expect(c['btn']).toBe(0);
    });

    it('3way: 初期currentBetはBB額（10）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.state.currentBet).toBe(10);
    });

    it('ブラインド額が変わってもpotとcontributionsに反映される', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way(25, 50)));
      skipHoleCards(result);
      expect(result.current.state.pot).toBe(75);
      const c = result.current.state.contributions;
      expect(c['sb']).toBe(25);
      expect(c['bb']).toBe(50);
    });

    it('4way: 初期potはSB+BB（5+10=15）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);
      expect(result.current.state.pot).toBe(15);
    });

  });

  // ------------------------------------------------------------------
  // プリフロップのコール後 pot・contribution 更新
  // ------------------------------------------------------------------
  describe('プリフロップ: コール後の更新', () => {

    it('BTNがコール（10）→ pot=25', () => {
      // SB=5, BB=10, BTN_call=10 → pot=5+10+10=25
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call 10
      expect(result.current.state.pot).toBe(25);
      expect(result.current.state.contributions['btn']).toBe(10);
    });

    it('BTN→SBがコール → pot=30', () => {
      // SBはすでに5投資済み → コールで10に合わせる（追加5）
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call 10
      act(() => { result.current.commitAction('call'); }); // SB call（追加5）
      expect(result.current.state.pot).toBe(30);
      expect(result.current.state.contributions['sb']).toBe(10);
    });

    it('全員コール→BBチェックでフロップ開始時のpotは30', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('call'); });
      act(() => { result.current.commitAction('check'); });

      // board-input フェーズではpotは維持
      expect(result.current.state.pot).toBe(30);
    });

    it('4way: UTG→BTN→SBがコール→BBチェックでpot=40', () => {
      // SB=5, BB=10, UTG_call=10, BTN_call=10, SB_call（追加5）=10 → pot=40
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // UTG call 10
      act(() => { result.current.commitAction('call'); }); // BTN call 10
      act(() => { result.current.commitAction('call'); }); // SB call (+5)
      act(() => { result.current.commitAction('check'); }); // BB check
      expect(result.current.state.pot).toBe(40);
    });

  });

  // ------------------------------------------------------------------
  // ベット後の pot・contribution 更新
  // ------------------------------------------------------------------
  describe('ベット後の更新', () => {

    it('BTNがレイズ30 → pot=40, contributions[btn]=30', () => {
      // 初期: SB=5, BB=10, pot=15 → BTN raise to 30 → 追加30 → pot=45
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise to 30
      // BTNは0から30に → 追加30 → pot=15+30=45
      expect(result.current.state.pot).toBe(45);
      expect(result.current.state.contributions['btn']).toBe(30);
      expect(result.current.state.currentBet).toBe(30);
    });

    it('BTNレイズ後SBコール → pot=65, contributions[sb]=30', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('call'); });       // SB call（5→30, 追加25）
      expect(result.current.state.pot).toBe(70);
      expect(result.current.state.contributions['sb']).toBe(30);
    });

    it('BTNレイズ→SBコール→BBコール → pot=90（ストリート終了でcontributionsはリセット）', () => {
      // BBのコールでプリフロップが終了 → resolveStreetEnd でcontributionsが0にリセットされる
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('call'); });       // SB call (+25)
      act(() => { result.current.commitAction('call'); });       // BB call (+20) → ストリート終了
      // pot=15+30+25+20=90 は保持、contributions はフロップ用に0にリセット
      expect(result.current.state.pot).toBe(90);
      expect(result.current.state.contributions['btn']).toBe(0);
      expect(result.current.state.contributions['sb']).toBe(0);
      expect(result.current.state.contributions['bb']).toBe(0);
    });

    it('3ベット: BTNレイズ→SBコール→BB 3ベット → pot更新', () => {
      // BTN raise 30 (+30) → SB call (+25) → BB 3bet to 90 (+80)
      // pot=15+30+25+80=150
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); });  // BTN raise
      act(() => { result.current.commitAction('call'); });        // SB call
      act(() => { result.current.commitAction('raise', 90); });  // BB 3bet to 90
      expect(result.current.state.pot).toBe(150);
      expect(result.current.state.contributions['bb']).toBe(90);
      expect(result.current.state.currentBet).toBe(90);
    });

  });

  // ------------------------------------------------------------------
  // フォールドは pot に影響しない
  // ------------------------------------------------------------------
  describe('フォールド時のpot', () => {

    it('フォールドしてもpotは変わらない', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise → pot=45
      act(() => { result.current.commitAction('fold'); });       // SB fold → pot変わらず
      expect(result.current.state.pot).toBe(45);
    });

    it('フォールドしたプレイヤーのcontributionは変わらない', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('fold'); });       // SB fold
      // SBはすでに5を投資済み、foldしても変わらない
      expect(result.current.state.contributions['sb']).toBe(5);
    });

  });

  // ------------------------------------------------------------------
  // ポストフロップの pot・contribution 更新
  // ------------------------------------------------------------------
  describe('ポストフロップの更新', () => {

    it('フロップ開始時のcontributionsは全員0にリセットされる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      const c = result.current.state.contributions;
      expect(c['btn']).toBe(0);
      expect(c['sb']).toBe(0);
      expect(c['bb']).toBe(0);
    });

    it('フロップ開始時のcurrentBetは0にリセットされる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      expect(result.current.state.currentBet).toBe(0);
    });

    it('フロップのpotはプリフロップから引き継がれる（30）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      expect(result.current.state.pot).toBe(30);
    });

    it('フロップSBベット20 → pot=50, contributions[sb]=20', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result); // pot=30

      act(() => { result.current.commitAction('bet', 20); }); // SB bet 20
      expect(result.current.state.pot).toBe(50);
      expect(result.current.state.contributions['sb']).toBe(20);
      expect(result.current.state.currentBet).toBe(20);
    });

    it('フロップSBベット→BBコール → pot=70', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result); // pot=30

      act(() => { result.current.commitAction('bet', 20); }); // SB bet (+20) → pot=50
      act(() => { result.current.commitAction('call'); });     // BB call (+20) → pot=70
      expect(result.current.state.pot).toBe(70);
      expect(result.current.state.contributions['bb']).toBe(20);
    });

    it('フロップSBベット→BBコール→BTNコール → pot=90', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result); // pot=30

      act(() => { result.current.commitAction('bet', 20); }); // SB bet (+20) → pot=50
      act(() => { result.current.commitAction('call'); });     // BB call (+20) → pot=70
      act(() => { result.current.commitAction('call'); });     // BTN call (+20) → pot=90
      expect(result.current.state.pot).toBe(90);
    });

    it('フロップ全員チェックでpotは変わらない', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result); // pot=30

      act(() => { result.current.commitAction('check'); });
      act(() => { result.current.commitAction('check'); });
      act(() => { result.current.commitAction('check'); });
      expect(result.current.state.pot).toBe(30);
    });

    it('ターン開始時もcontributionsは0にリセットされpotは引き継がれる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result); // pot=30

      act(() => { result.current.commitAction('bet', 20); }); // SB bet (+20) → pot=50
      act(() => { result.current.commitAction('call'); });     // BB call (+20) → pot=70
      act(() => { result.current.commitAction('call'); });     // BTN call (+20) → pot=90 → turn

      act(() => { result.current.confirmBoard(); });

      expect(result.current.state.pot).toBe(90);
      expect(result.current.state.currentBet).toBe(0);
      const c = result.current.state.contributions;
      expect(c['sb']).toBe(0);
      expect(c['bb']).toBe(0);
      expect(c['btn']).toBe(0);
    });

  });

  // ------------------------------------------------------------------
  // toCall（コール額）の計算
  // ------------------------------------------------------------------
  describe('toCall（コール額）の計算', () => {

    it('初期状態でのBTNのtoCallはBB額（10）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      // BTN(0投資) → currentBet=10 → toCall=10
      expect(result.current.toCall).toBe(10);
    });

    it('BTNコール後、SBのtoCallは5（10-5）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call
      // 次のアクターはSB（5投資済み）→ currentBet=10 → toCall=5
      expect(result.current.toCall).toBe(5);
    });

    it('BTNレイズ30後、SBのtoCallは25（30-5）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise to 30
      // SB（5投資済み）→ toCall=25
      expect(result.current.toCall).toBe(25);
    });

    it('BTNレイズ30→SBコール後、BBのtoCallは20（30-10）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('call'); });       // SB call
      // BB（10投資済み）→ toCall=20
      expect(result.current.toCall).toBe(20);
    });

    it('ポストフロップ開始時のtoCallは0（チェックラウンド）', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);
      // currentBet=0 → toCall=0
      expect(result.current.toCall).toBe(0);
    });

    it('ポストフロップ: SBベット後のBBのtoCallはbet額', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('bet', 20); }); // SB bet 20
      // 次はBB（0投資）→ toCall=20
      expect(result.current.toCall).toBe(20);
    });

  });

});
