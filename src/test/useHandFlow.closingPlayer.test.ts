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

describe('useHandFlow: closingPlayerId の更新ロジック', () => {

  // ------------------------------------------------------------------
  // プリフロップの初期値
  // ------------------------------------------------------------------
  describe('プリフロップ初期値', () => {

    it('3way: 初期のclosingPlayerIdはBB（preflopOrderの末尾）', () => {
      // preflopOrder = [BTN, SB, BB] → closingPlayerId = 'bb'
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      expect(result.current.state.closingPlayerId).toBe('bb');
    });

    it('4way: 初期のclosingPlayerIdはBB（preflopOrderの末尾）', () => {
      // preflopOrder = [UTG, BTN, SB, BB] → closingPlayerId = 'bb'
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);
      expect(result.current.state.closingPlayerId).toBe('bb');
    });

    it('3way: コール後もclosingPlayerIdはBBのまま', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call
      expect(result.current.state.closingPlayerId).toBe('bb');
    });

    it('3way: SBコール後もclosingPlayerIdはBBのまま', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); }); // BTN call
      act(() => { result.current.commitAction('call'); }); // SB call
      expect(result.current.state.closingPlayerId).toBe('bb');
    });

  });

  // ------------------------------------------------------------------
  // bet/raise/allin 後の更新
  // ------------------------------------------------------------------
  describe('bet/raise/allin 後の更新', () => {

    it('3way: BTNがレイズ → closingPlayerIdはBTNの1つ前（SB）', () => {
      // preflopOrder = [BTN, SB, BB]
      // BTN(idx=0) がレイズ → betterIdx=0, prevIdx=(0-1+3)%3=2 → BB
      // ただし betterIdx は newOrder 上なので newOrder=[BTN,SB,BB], prevIdx=2 → BB? いや
      // newOrder=[BTN,SB,BB]（全員残）, betterIdx=0, prevIdx=2 → BB
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      // BTN(idx=0) の1つ前は BB(idx=2) → closingPlayerId = 'bb'
      expect(result.current.state.closingPlayerId).toBe('bb');
    });

    it('3way: SBがベット → closingPlayerIdはSBの1つ前（BTN）', () => {
      // preflopOrder = [BTN, SB, BB]
      // BTNコール(idx→1) → SB(idx=1)がベット
      // newOrder=[BTN,SB,BB], betterIdx=1, prevIdx=0 → BTN
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });       // BTN call
      act(() => { result.current.commitAction('raise', 30); }); // SB raise
      expect(result.current.state.closingPlayerId).toBe('btn');
    });

    it('3way: BBがレイズ（3ベット）→ closingPlayerIdはBBの1つ前（SB）', () => {
      // BTNレイズ → SBコール → BBレイズ
      // newOrder=[BTN,SB,BB], BB(idx=2), prevIdx=1 → SB
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      act(() => { result.current.commitAction('call'); });       // SB call
      act(() => { result.current.commitAction('raise', 90); }); // BB 3-bet
      expect(result.current.state.closingPlayerId).toBe('sb');
    });

    it('4way: UTGがレイズ → closingPlayerIdはUTGの1つ前（BB）', () => {
      // preflopOrder = [UTG, BTN, SB, BB]
      // UTG(idx=0) レイズ → newOrder=[UTG,BTN,SB,BB], prevIdx=3 → BB
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // UTG raise
      expect(result.current.state.closingPlayerId).toBe('bb');
    });

    it('4way: BTNがレイズ → closingPlayerIdはBTNの1つ前（UTG）', () => {
      // preflopOrder = [UTG, BTN, SB, BB]
      // UTGコール → BTN(idx=1)レイズ
      // newOrder=[UTG,BTN,SB,BB], betterIdx=1, prevIdx=0 → UTG
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('call'); });       // UTG call
      act(() => { result.current.commitAction('raise', 30); }); // BTN raise
      expect(result.current.state.closingPlayerId).toBe('utg');
    });

    it('ポストフロップ: SBがベット → closingPlayerIdはSBの1つ前（BTN）', () => {
      // postflopOrder = [SB, BB, BTN]
      // SB(idx=0) ベット → newOrder=[SB,BB,BTN], betterIdx=0, prevIdx=2 → BTN
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('bet', 20); }); // SB bet
      expect(result.current.state.closingPlayerId).toBe('btn');
    });

    it('ポストフロップ: BBがベット → closingPlayerIdはBBの1つ前（SB）', () => {
      // postflopOrder = [SB, BB, BTN]
      // SBチェック → BB(idx=1)ベット → newOrder=[SB,BB,BTN], betterIdx=1, prevIdx=0 → SB
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('check'); });   // SB check
      act(() => { result.current.commitAction('bet', 20); }); // BB bet
      expect(result.current.state.closingPlayerId).toBe('sb');
    });

    it('ポストフロップ: BTNがベット → closingPlayerIdはBTNの1つ前（BB）', () => {
      // postflopOrder = [SB, BB, BTN]
      // SBチェック → BBチェック → BTN(idx=2)ベット → prevIdx=1 → BB
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('check'); });   // SB check
      act(() => { result.current.commitAction('check'); });   // BB check
      act(() => { result.current.commitAction('bet', 20); }); // BTN bet
      expect(result.current.state.closingPlayerId).toBe('bb');
    });

    it('レイズ後に再レイズ → closingPlayerIdが更新される', () => {
      // SBベット → BTNコール → BBレイズ → SBが再レイズ
      // 最終的にclosingPlayerIdはSBの1つ前（BTN）
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('bet', 20); });    // SB bet → closing=BTN
      act(() => { result.current.commitAction('call'); });        // BB call
      act(() => { result.current.commitAction('raise', 60); });  // BTN raise → closing=BB
      expect(result.current.state.closingPlayerId).toBe('bb');

      act(() => { result.current.commitAction('raise', 120); }); // SB 3-bet → closing=BTN
      expect(result.current.state.closingPlayerId).toBe('btn');
    });

  });

  // ------------------------------------------------------------------
  // fold 時の再計算
  // ------------------------------------------------------------------
  describe('fold 時の再計算', () => {

    it('closingPlayer以外がfoldしてもclosingPlayerIdは変わらない', () => {
      // 3way: BTNレイズ → closingPlayerId=BB → SBフォールド（closingはBBのまま）
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise → closing=BB
      act(() => { result.current.commitAction('fold'); });       // SB fold → closingはBBのまま
      expect(result.current.state.closingPlayerId).toBe('bb');
    });

    it('closingPlayer自身がfoldするとstreetEndが判定されboard-inputに遷移する', () => {
      // 3way: BTNレイズ → closingPlayerId=BB → SBコール → BBがフォールド
      // BBフォールド時: lappedEnd=true, allSquared=true(BTN=30,SB=30) → streetOver=true
      // → board-input(flop) に遷移し、closingPlayerIdはnull（ストリートリセット）
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise → closing=BB
      act(() => { result.current.commitAction('call'); });       // SB call
      act(() => { result.current.commitAction('fold'); });       // BB fold → streetOver!
      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('flop');
      expect(result.current.state.closingPlayerId).toBeNull(); // ストリートリセットでnull
    });

    it('4way: SBがclosingPlayerでSBがfold → closingPlayerIdが末尾（BB）に更新', () => {
      // preflopOrder = [UTG, BTN, SB, BB]
      // BTNレイズ → closing=UTG
      // UTGコール → SBがclosing... いや BTNレイズでclosingはUTG
      // 別シナリオ: UTGレイズ → closing=BB → SBがベット... 待つ
      // シンプルに: SBがclosingになるケースを作る
      // UTGコール → BTNレイズ → closing=UTG → UTGコール → SBがclosing
      // 実際はclosingはbetterの1つ前なので BTNレイズ → prevIdx=0(UTG) → closing=UTG
      // UTGコール → closing残=UTG... UTGがclosingで今回フォールドした場合を検証

      // シンプルに: UTGがclosing（BTNレイズ後）でUTGがfold
      // BTNレイズ → closing=UTG → UTGフォールド → newOrder=[BTN,SB,BB] → closing=BB
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      // UTGがclosingになるシナリオ: BTNレイズ
      // preflopOrder=[UTG, BTN, SB, BB]
      // UTG(idx=0)の次はBTN(idx=1)
      act(() => { result.current.commitAction('call'); });       // UTG call (idx→1)
      act(() => { result.current.commitAction('raise', 30); }); // BTN raise → closing=UTG
      expect(result.current.state.closingPlayerId).toBe('utg');

      act(() => { result.current.commitAction('fold'); }); // SB fold → UTGはまだいる→closing=UTG
      expect(result.current.state.closingPlayerId).toBe('utg');

      act(() => { result.current.commitAction('fold'); }); // BB fold → UTGはまだいる→closing=UTG
      expect(result.current.state.closingPlayerId).toBe('utg');
    });

    it('ポストフロップ: closingPlayer（BTN）がfold → streetEndが判定されboard-inputに遷移する', () => {
      // postflopOrder = [SB, BB, BTN]
      // SBベット → closing=BTN → BBコール → BTNがフォールド
      // BTNフォールド時: lappedEnd=true(rawIdx=2>=2), allSquared=true(SB=20,BB=20)
      // → closingPlayerFolded=true → streetOver=true → board-input(turn)
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('bet', 20); }); // SB bet → closing=BTN
      act(() => { result.current.commitAction('call'); });     // BB call
      act(() => { result.current.commitAction('fold'); });     // BTN fold → streetOver!

      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('turn');
    });

    it('ポストフロップ: closingPlayer以外がfoldしてもclosingPlayerIdは維持', () => {
      // postflopOrder = [SB, BB, BTN]
      // BBベット → closing=SB → BTNがフォールド → closingはSBのまま
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('check'); });   // SB check
      act(() => { result.current.commitAction('bet', 20); }); // BB bet → closing=SB
      act(() => { result.current.commitAction('fold'); });     // BTN fold → closingはSBのまま
      expect(result.current.state.closingPlayerId).toBe('sb');
    });

  });

  // ------------------------------------------------------------------
  // ストリート遷移後のリセット
  // ------------------------------------------------------------------
  describe('ストリート遷移後のリセット', () => {

    it('フロップ開始時にclosingPlayerIdがnullにリセットされる', () => {
      // ポストフロップはチェックラウンドから始まるためclosingPlayerId=null
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise → closing=BB
      act(() => { result.current.commitAction('call'); });       // SB call
      act(() => { result.current.commitAction('call'); });       // BB call → フロップへ

      expect(result.current.state.closingPlayerId).toBeNull();
    });

    it('ターン開始時にclosingPlayerIdがnullにリセットされる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('bet', 20); }); // SB bet → closing=BTN
      act(() => { result.current.commitAction('call'); });     // BB call
      act(() => { result.current.commitAction('call'); });     // BTN call → ターンへ
      act(() => { result.current.confirmBoard(); });

      expect(result.current.state.closingPlayerId).toBeNull();
    });

    it('フロップ開始後にベットするとclosingPlayerIdが設定される', () => {
      // フロップ開始時はnull → ベット後に設定される
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      expect(result.current.state.closingPlayerId).toBeNull();

      act(() => { result.current.commitAction('bet', 20); }); // SB bet
      // SB(idx=0)ベット → prevIdx=2 → BTN
      expect(result.current.state.closingPlayerId).toBe('btn');
    });

    it('フロップ全員チェック後（closingPlayerId=null）にターンでも正しく動作', () => {
      // チェックラウンドではlappedEndで終了 → ターンもnullから始まる
      // goToFlop3way: フロップへ遷移済み（confirmBoard済み）
      // フロップ全員チェック → board-input（ターン）→ confirmBoard → ターンアクション開始
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToFlop3way(result);

      act(() => { result.current.commitAction('check'); }); // SB check
      act(() => { result.current.commitAction('check'); }); // BB check
      act(() => { result.current.commitAction('check'); }); // BTN check → board-input(turn)
      act(() => { result.current.confirmBoard(); });         // ターン開始

      // ターンはnullから始まりアクション中
      expect(result.current.state.closingPlayerId).toBeNull();
      expect(result.current.state.currentStreet).toBe('turn');
    });

  });

});
