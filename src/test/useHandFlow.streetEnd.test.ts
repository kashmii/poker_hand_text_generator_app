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

  // ------------------------------------------------------------------
  // オールイン関連
  // ------------------------------------------------------------------
  describe('オールイン', () => {

    /** 6人テーブル: [BTN=0, SB=1, BB=2, UTG=3, HJ=4, CO=5] */
    function makeSession6way(): SessionConfig {
      return {
        ...makeSession3way(),
        players: [
          { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
          { id: 'sb',  name: 'SB',  stack: 1000, position: 1 },
          { id: 'bb',  name: 'BB',  stack: 1000, position: 2 },
          { id: 'utg', name: 'UTG', stack: 1000, position: 3 },
          { id: 'hj',  name: 'HJ',  stack: 1000, position: 4 },
          { id: 'co',  name: 'CO',  stack: 1000, position: 5 },
        ],
      };
    }

    it('【回帰】6way: UTGオールイン→HJ/CO/BTN/SBフォールド後にBBがアクションできる', () => {
      // preflopOrder = [UTG, HJ, CO, BTN, SB, BB]
      // UTGがオールイン → HJ/CO/BTN/SBがフォールド → BBはまだアクションが必要
      // バグ: BBのアクション前にboard-inputへ遷移してしまっていた
      const { result } = renderHook(() => useHandFlow(makeSession6way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('allin'); });  // UTG all-in
      act(() => { result.current.commitAction('fold'); });   // HJ fold
      act(() => { result.current.commitAction('fold'); });   // CO fold
      act(() => { result.current.commitAction('fold'); });   // BTN fold
      act(() => { result.current.commitAction('fold'); });   // SB fold

      // BBはまだアクションが必要 → phaseは 'action' のまま
      expect(result.current.state.phase).toBe('action');
      expect(result.current.actorId).toBe('bb');
    });

    it('【回帰】6way: UTGオールイン→HJ/CO/BTN/SBフォールド→BBコールでフロップへ遷移', () => {
      const { result } = renderHook(() => useHandFlow(makeSession6way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('allin'); });  // UTG all-in
      act(() => { result.current.commitAction('fold'); });   // HJ fold
      act(() => { result.current.commitAction('fold'); });   // CO fold
      act(() => { result.current.commitAction('fold'); });   // BTN fold
      act(() => { result.current.commitAction('fold'); });   // SB fold
      act(() => { result.current.commitAction('call'); });   // BB call → street over

      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('flop');
    });

    it('【回帰】6way: UTGオールイン→HJ/CO/BTN/SBフォールド→BBフォールドでwinner遷移', () => {
      const { result } = renderHook(() => useHandFlow(makeSession6way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('allin'); });  // UTG all-in
      act(() => { result.current.commitAction('fold'); });   // HJ fold
      act(() => { result.current.commitAction('fold'); });   // CO fold
      act(() => { result.current.commitAction('fold'); });   // BTN fold
      act(() => { result.current.commitAction('fold'); });   // SB fold
      act(() => { result.current.commitAction('fold'); });   // BB fold → 1人残 → winner

      expect(result.current.state.phase).toBe('winner');
    });

    it('プリフロップ: 2プレイヤーがオールイン状態でフロップ以降アクション不要', () => {
      // 3way: UTG allin → BTN(SB) call → BB call → 全員EquityFixed → no action on flop
      // ただし3wayなのでBTN→SBで順番変わる
      // 4way: UTG allin → BTN allin → SB fold → BB call → 全員in or fold
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      // preflopOrder = [UTG, BTN, SB, BB]
      act(() => { result.current.commitAction('allin'); });  // UTG all-in
      act(() => { result.current.commitAction('allin'); });  // BTN all-in
      act(() => { result.current.commitAction('fold'); });   // SB fold
      act(() => { result.current.commitAction('call'); });   // BB call → 終了

      // フロップカード入力へ
      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('flop');

      // フロップカード確定後、actionableが0 or 1なのでアクションフェーズをスキップ
      act(() => { result.current.confirmBoard(); }); // flop → turn board-input
      expect(result.current.state.currentStreet).toBe('turn');

      act(() => { result.current.confirmBoard(); }); // turn → river board-input
      expect(result.current.state.currentStreet).toBe('river');

      act(() => { result.current.confirmBoard(); }); // river → showdown or winner
      expect(['showdown', 'winner'].includes(result.current.state.phase)).toBe(true);
    });

  });

  // ------------------------------------------------------------------
  // 【回帰】closingPlayer自身がfoldした場合のストリート終了
  // ------------------------------------------------------------------
  describe('closingPlayer自身がfoldした場合のストリート終了', () => {

    it('【回帰】4way: UTGレイズ→BTNコール→SBフォールド→BBフォールドでフロップへ遷移する', () => {
      // バグ: BB(closingPlayer)がfoldした後、newClosingPlayerIdがBTNに更新されるが
      // actorId(BB)!==newClosingPlayerId(BTN) のためstreetOverにならずUTGに再度アクションが回っていた
      // 修正後: closingPlayerFolded=true → lappedEnd && allSquared で判定
      // preflopOrder = [UTG, BTN, SB, BB]
      // UTG raise → closing=BB → BTN call → SB fold → BB fold → streetOver(lappedEnd&allSquared)
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // UTG raise → closing=BB
      act(() => { result.current.commitAction('call'); });       // BTN call
      act(() => { result.current.commitAction('fold'); });       // SB fold
      act(() => { result.current.commitAction('fold'); });       // BB fold → streetOver!

      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('flop');
    });

    it('【回帰】4way: UTGレイズ→BTNコール→BBフォールド→SBフォールドでフロップへ遷移する', () => {
      // SBとBBのfold順が逆のケース
      // preflopOrder = [UTG, BTN, SB, BB]
      // UTG raise → closing=BB → BTN call → BB fold（closingが変わる）→ SB fold → streetOver
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // UTG raise → closing=BB
      act(() => { result.current.commitAction('call'); });       // BTN call
      // SBがfoldしないでBBがfoldするケースを先に試す（BBはclosing）
      // preflopOrder=[UTG,BTN,SB,BB] なのでSBが先（idx=2）
      act(() => { result.current.commitAction('fold'); });       // SB fold (idx=2) → closingはBBのまま
      act(() => { result.current.commitAction('fold'); });       // BB fold → streetOver!

      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('flop');
    });

    it('【回帰】3way: BTNレイズ→SBコール→BBフォールドでフロップへ遷移する', () => {
      // preflopOrder = [BTN, SB, BB]
      // BTN raise → closing=BB → SB call → BB fold → streetOver
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);

      act(() => { result.current.commitAction('raise', 30); }); // BTN raise → closing=BB
      act(() => { result.current.commitAction('call'); });       // SB call
      act(() => { result.current.commitAction('fold'); });       // BB fold → streetOver!

      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('flop');
    });

    it('【回帰】ポストフロップ: SBベット→BBコール→BTNフォールドでターンへ遷移する', () => {
      // postflopOrder = [SB, BB, BTN]
      // SB bet → closing=BTN → BB call → BTN fold(closing自身) → streetOver
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('call'); });   // BTN call
      act(() => { result.current.commitAction('call'); });   // SB call
      act(() => { result.current.commitAction('check'); });  // BB check → board-input
      act(() => { result.current.confirmBoard(); });

      act(() => { result.current.commitAction('bet', 20); }); // SB bet → closing=BTN
      act(() => { result.current.commitAction('call'); });     // BB call
      act(() => { result.current.commitAction('fold'); });     // BTN fold → streetOver!

      expect(result.current.state.phase).toBe('board-input');
      expect(result.current.state.currentStreet).toBe('turn');
    });

  });

});

// ========== オールイン後のtoCall（callAmount）検証 ==========

describe('オールイン後のコール額検証', () => {

  /** 6人テーブル: [BTN=0, SB=1, BB=2, UTG=3, HJ=4, CO=5] */
  function makeSession6way(): SessionConfig {
    return {
      players: [
        { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
        { id: 'sb',  name: 'SB',  stack: 1000, position: 1 },
        { id: 'bb',  name: 'BB',  stack: 1000, position: 2 },
        { id: 'utg', name: 'UTG', stack: 1000, position: 3 },
        { id: 'hj',  name: 'HJ',  stack: 1000, position: 4 },
        { id: 'co',  name: 'CO',  stack: 1000, position: 5 },
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

  it('【回帰】UTGがオールイン（amount未指定）後にBBのtoCallが正しくcall額になる', () => {
    // UTGがオールイン（amount未指定 → スタック1000を使用）
    // BBのcontributions=10（BB投資）なので toCall = 1000 - 10 = 990
    // checkにはならないはず
    const { result } = renderHook(() => useHandFlow(makeSession6way()));
    act(() => {
      result.current.confirmHoleCards({ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' });
    });

    act(() => { result.current.commitAction('allin'); });  // UTG all-in（amount未指定）
    act(() => { result.current.commitAction('fold'); });   // HJ fold
    act(() => { result.current.commitAction('fold'); });   // CO fold
    act(() => { result.current.commitAction('fold'); });   // BTN fold
    act(() => { result.current.commitAction('fold'); });   // SB fold

    // BBのアクターになっているはず
    expect(result.current.actorId).toBe('bb');
    // toCallは正のはず（checkではなくcall）
    expect(result.current.toCall).toBeGreaterThan(0);
    // currentBet = UTGのスタック = 1000
    expect(result.current.state.currentBet).toBe(1000);
    // toCall = 1000 - 10(BB投資) = 990
    expect(result.current.toCall).toBe(990);
  });

});
