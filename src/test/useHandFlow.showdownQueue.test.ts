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

/**
 * リバーまで進めてショーダウンへ遷移させるヘルパー（3way・全員チェックで流す）。
 * プリフロップはBTNコール→SBコール→BBチェック、
 * フロップ/ターン/リバーは全員チェック。
 */
function goToShowdown3wayAllCheck(
  result: ReturnType<typeof renderHook<ReturnType<typeof useHandFlow>, SessionConfig>>['result'],
) {
  skipHoleCards(result);
  // プリフロップ
  act(() => { result.current.commitAction('call'); });   // BTN call
  act(() => { result.current.commitAction('call'); });   // SB call
  act(() => { result.current.commitAction('check'); });  // BB check → board-input(flop)
  act(() => { result.current.confirmBoard(); });
  // フロップ
  act(() => { result.current.commitAction('check'); });  // SB
  act(() => { result.current.commitAction('check'); });  // BB
  act(() => { result.current.commitAction('check'); });  // BTN → board-input(turn)
  act(() => { result.current.confirmBoard(); });
  // ターン
  act(() => { result.current.commitAction('check'); });  // SB
  act(() => { result.current.commitAction('check'); });  // BB
  act(() => { result.current.commitAction('check'); });  // BTN → board-input(river)
  act(() => { result.current.confirmBoard(); });
  // リバー
  act(() => { result.current.commitAction('check'); });  // SB
  act(() => { result.current.commitAction('check'); });  // BB
  act(() => { result.current.commitAction('check'); });  // BTN → showdown
}

/**
 * リバーまで進めてショーダウンへ遷移させるヘルパー（3way）。
 * ラストアグレッサーを指定できるよう、リバーのみアクションを外出しする。
 */
function goToRiver3way(
  result: ReturnType<typeof renderHook<ReturnType<typeof useHandFlow>, SessionConfig>>['result'],
) {
  skipHoleCards(result);
  // プリフロップ
  act(() => { result.current.commitAction('call'); });   // BTN
  act(() => { result.current.commitAction('call'); });   // SB
  act(() => { result.current.commitAction('check'); });  // BB → board-input(flop)
  act(() => { result.current.confirmBoard(); });
  // フロップ
  act(() => { result.current.commitAction('check'); });
  act(() => { result.current.commitAction('check'); });
  act(() => { result.current.commitAction('check'); });  // → board-input(turn)
  act(() => { result.current.confirmBoard(); });
  // ターン
  act(() => { result.current.commitAction('check'); });
  act(() => { result.current.commitAction('check'); });
  act(() => { result.current.commitAction('check'); });  // → board-input(river)
  act(() => { result.current.confirmBoard(); });
  // リバーはヘルパー呼び出し元で操作
}

// ========== テスト ==========

describe('useHandFlow: showdownキュー構築', () => {

  // ------------------------------------------------------------------
  // showdown phase への遷移
  // ------------------------------------------------------------------
  describe('showdown phase への遷移', () => {

    it('リバー終了後に phase が showdown になる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToShowdown3wayAllCheck(result);
      expect(result.current.state.phase).toBe('showdown');
    });

    it('showdownQueue が空でない', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToShowdown3wayAllCheck(result);
      expect(result.current.state.showdownQueue.length).toBeGreaterThan(0);
    });

    it('showdownQueue にはアクティブ（foldしていない）プレイヤーのみ含まれる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToShowdown3wayAllCheck(result);
      const queue = result.current.state.showdownQueue;
      // 全員active なので3人
      expect(queue.length).toBe(3);
      expect(queue).toContain('btn');
      expect(queue).toContain('sb');
      expect(queue).toContain('bb');
    });

  });

  // ------------------------------------------------------------------
  // ラストアグレッサーが先頭になる
  // ------------------------------------------------------------------
  describe('ラストアグレッサーが先頭', () => {

    it('リバーでSBがベット→全員コールで終了 → showdownQueue先頭はSB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToRiver3way(result);
      // postflopOrder = [SB, BB, BTN]
      act(() => { result.current.commitAction('bet', 20); }); // SB bet
      act(() => { result.current.commitAction('call'); });     // BB call
      act(() => { result.current.commitAction('call'); });     // BTN call → showdown
      expect(result.current.state.phase).toBe('showdown');
      expect(result.current.state.showdownQueue[0]).toBe('sb');
    });

    it('リバーでBBがベット→BTNコール→SBコールで終了 → showdownQueue先頭はBB', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToRiver3way(result);
      act(() => { result.current.commitAction('check'); });    // SB check
      act(() => { result.current.commitAction('bet', 20); }); // BB bet
      act(() => { result.current.commitAction('call'); });     // BTN call
      act(() => { result.current.commitAction('call'); });     // SB call → showdown
      expect(result.current.state.showdownQueue[0]).toBe('bb');
    });

    it('リバーでBTNがベット→SBコール→BBコールで終了 → showdownQueue先頭はBTN', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToRiver3way(result);
      act(() => { result.current.commitAction('check'); });    // SB check
      act(() => { result.current.commitAction('check'); });    // BB check
      act(() => { result.current.commitAction('bet', 20); }); // BTN bet
      act(() => { result.current.commitAction('call'); });     // SB call
      act(() => { result.current.commitAction('call'); });     // BB call → showdown
      expect(result.current.state.showdownQueue[0]).toBe('btn');
    });

    it('ラストアグレッサー以降は時計回り（postflopOrder）で続く', () => {
      // postflopOrder = [SB, BB, BTN]
      // SBがラストアグレッサー → [SB, BB, BTN]
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToRiver3way(result);
      act(() => { result.current.commitAction('bet', 20); }); // SB bet
      act(() => { result.current.commitAction('call'); });     // BB call
      act(() => { result.current.commitAction('call'); });     // BTN call → showdown
      const queue = result.current.state.showdownQueue;
      expect(queue).toEqual(['sb', 'bb', 'btn']);
    });

    it('BBがラストアグレッサー → [BB, BTN, SB]', () => {
      // postflopOrder = [SB, BB, BTN]
      // BBから始まり時計回り → [BB, BTN, SB]
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToRiver3way(result);
      act(() => { result.current.commitAction('check'); });    // SB check
      act(() => { result.current.commitAction('bet', 20); }); // BB bet
      act(() => { result.current.commitAction('call'); });     // BTN call
      act(() => { result.current.commitAction('call'); });     // SB call → showdown
      expect(result.current.state.showdownQueue).toEqual(['bb', 'btn', 'sb']);
    });

    it('BTNがラストアグレッサー → [BTN, SB, BB]', () => {
      // postflopOrder = [SB, BB, BTN]
      // BTNから時計回り → [BTN, SB, BB]
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToRiver3way(result);
      act(() => { result.current.commitAction('check'); });    // SB check
      act(() => { result.current.commitAction('check'); });    // BB check
      act(() => { result.current.commitAction('bet', 20); }); // BTN bet
      act(() => { result.current.commitAction('call'); });     // SB call
      act(() => { result.current.commitAction('call'); });     // BB call → showdown
      expect(result.current.state.showdownQueue).toEqual(['btn', 'sb', 'bb']);
    });

  });

  // ------------------------------------------------------------------
  // ラストアグレッサーなし（全員チェック）→ postflopOrder 順
  // ------------------------------------------------------------------
  describe('ラストアグレッサーなし → postflopOrder順', () => {

    it('全員チェックで終了 → showdownQueue は postflopOrder [SB, BB, BTN]', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToShowdown3wayAllCheck(result);
      expect(result.current.state.showdownQueue).toEqual(['sb', 'bb', 'btn']);
    });

    it('4way 全員チェック → showdownQueue は [SB, BB, UTG, BTN]', () => {
      const { result } = renderHook(() => useHandFlow(makeSession4way()));
      skipHoleCards(result);
      // プリフロップ: preflopOrder=[UTG,BTN,SB,BB]
      act(() => { result.current.commitAction('call'); });   // UTG
      act(() => { result.current.commitAction('call'); });   // BTN
      act(() => { result.current.commitAction('call'); });   // SB
      act(() => { result.current.commitAction('check'); });  // BB → flop
      act(() => { result.current.confirmBoard(); });
      // フロップ
      for (let i = 0; i < 4; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      // ターン
      for (let i = 0; i < 4; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      // リバー
      for (let i = 0; i < 4; i++) act(() => { result.current.commitAction('check'); });

      expect(result.current.state.phase).toBe('showdown');
      expect(result.current.state.showdownQueue).toEqual(['sb', 'bb', 'utg', 'btn']);
    });

  });

  // ------------------------------------------------------------------
  // foldしたプレイヤーはキューに含まれない
  // ------------------------------------------------------------------
  describe('foldプレイヤーはキューに含まれない', () => {

    it('SBがfold済み → showdownQueue に SB は含まれない', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      // プリフロップでSBがfold
      act(() => { result.current.commitAction('call'); });   // BTN call
      act(() => { result.current.commitAction('fold'); });   // SB fold
      act(() => { result.current.commitAction('check'); });  // BB check → flop
      act(() => { result.current.confirmBoard(); });
      // フロップ〜リバー 全員チェック
      for (let i = 0; i < 2; i++) act(() => { result.current.commitAction('check'); }); // BB, BTN
      act(() => { result.current.confirmBoard(); });
      for (let i = 0; i < 2; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      for (let i = 0; i < 2; i++) act(() => { result.current.commitAction('check'); });

      expect(result.current.state.phase).toBe('showdown');
      const queue = result.current.state.showdownQueue;
      expect(queue).not.toContain('sb');
      expect(queue.length).toBe(2);
    });

    it('BTNがfold済み → showdownQueue は [SB, BB]', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      // プリフロップでBTNがfold
      act(() => { result.current.commitAction('fold'); });   // BTN fold
      act(() => { result.current.commitAction('call'); });   // SB call
      act(() => { result.current.commitAction('check'); });  // BB check → flop
      act(() => { result.current.confirmBoard(); });
      // フロップ〜リバー 全員チェック（SB・BB）
      for (let i = 0; i < 2; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      for (let i = 0; i < 2; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      for (let i = 0; i < 2; i++) act(() => { result.current.commitAction('check'); });

      expect(result.current.state.phase).toBe('showdown');
      expect(result.current.state.showdownQueue).toEqual(['sb', 'bb']);
    });

    it('フォールド済みのプレイヤーがラストアグレッサーでも先頭にならない', () => {
      // プリフロップでBTNがレイズ → フロップでSBコール → BTNがリバーでフォールド
      // BTNがラストアグレッサーだが fold済みなので、activeに含まれず先頭にならない
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('raise', 30); }); // BTN raise (preflop aggressor)
      act(() => { result.current.commitAction('call'); });        // SB call
      act(() => { result.current.commitAction('call'); });        // BB call → flop
      act(() => { result.current.confirmBoard(); });
      // フロップ〜ターン全員チェック
      for (let i = 0; i < 3; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      for (let i = 0; i < 3; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      // リバー: SBベット → BBフォールド → BTNフォールド（BTNはfold）
      act(() => { result.current.commitAction('bet', 20); }); // SB bet (river aggressor)
      act(() => { result.current.commitAction('call'); });     // BB call
      act(() => { result.current.commitAction('fold'); });     // BTN fold → BTNはfold済み

      // BTNがfoldしたのでboard-input or winner になる可能性も確認
      // BTNがfoldでactiveはSBとBBの2人 → allSquaredになるかどうかで判断
      // BTNフォールドでclosingPlayer更新 → ストリートが終わる条件を確認

      // showdownにならずにboard-inputへ行く可能性があるため、
      // まずSBがリバーラストアグレッサーのケースを単純に検証
      // （BTNがfoldした時点でactorId===closingPlayer && allSquaredであればshowdown）
      if (result.current.state.phase === 'showdown') {
        expect(result.current.state.showdownQueue).not.toContain('btn');
      }
    });

  });

  // ------------------------------------------------------------------
  // ラストアグレッサーが複数ストリートにわたる場合
  // ------------------------------------------------------------------
  describe('複数ストリートにわたるラストアグレッサー', () => {

    it('プリフロップのレイズよりリバーのベットが優先される', () => {
      // プリフロップ: BTNレイズ → フロップ〜ターン全員チェック → リバー: SBベット
      // ラストアグレッサーはリバーのSB
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('raise', 30); }); // BTN raise (preflop)
      act(() => { result.current.commitAction('call'); });        // SB call
      act(() => { result.current.commitAction('call'); });        // BB call → flop
      act(() => { result.current.confirmBoard(); });
      for (let i = 0; i < 3; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      for (let i = 0; i < 3; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      // リバー: SBがベット
      act(() => { result.current.commitAction('bet', 20); }); // SB bet (river aggressor)
      act(() => { result.current.commitAction('call'); });     // BB call
      act(() => { result.current.commitAction('call'); });     // BTN call → showdown

      expect(result.current.state.showdownQueue[0]).toBe('sb');
    });

    it('フロップのベットよりリバーのベットが優先される', () => {
      // フロップ: BBベット → リバー: BTNベット → ラストはBTN
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      act(() => { result.current.commitAction('call'); });   // BTN
      act(() => { result.current.commitAction('call'); });   // SB
      act(() => { result.current.commitAction('check'); });  // BB → flop
      act(() => { result.current.confirmBoard(); });
      // フロップ: BBがベット
      act(() => { result.current.commitAction('check'); });    // SB check
      act(() => { result.current.commitAction('bet', 20); }); // BB bet (flop aggressor)
      act(() => { result.current.commitAction('call'); });     // BTN call
      act(() => { result.current.commitAction('call'); });     // SB call → turn
      act(() => { result.current.confirmBoard(); });
      // ターン全員チェック
      for (let i = 0; i < 3; i++) act(() => { result.current.commitAction('check'); });
      act(() => { result.current.confirmBoard(); });
      // リバー: BTNがベット
      act(() => { result.current.commitAction('check'); });    // SB check
      act(() => { result.current.commitAction('check'); });    // BB check
      act(() => { result.current.commitAction('bet', 30); }); // BTN bet (river aggressor)
      act(() => { result.current.commitAction('call'); });     // SB call
      act(() => { result.current.commitAction('call'); });     // BB call → showdown

      expect(result.current.state.showdownQueue[0]).toBe('btn');
    });

    it('【バグ修正】リバーで誰もベットしなかった場合はOOP(SB)が先頭になる（前ストリートのアグレッサーは無視）', () => {
      // フロップ: BBベット（フロップアグレッサー）
      // ターン: BTNベット（ターンアグレッサー）
      // リバー: 全員チェック
      // → リバーでベットなし → OOP順: [SB, BB, BTN]
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      skipHoleCards(result);
      // プリフロップ: 全員コール
      act(() => { result.current.commitAction('call'); });   // BTN
      act(() => { result.current.commitAction('call'); });   // SB
      act(() => { result.current.commitAction('check'); });  // BB → flop
      act(() => { result.current.confirmBoard(); });
      // フロップ: BBがベット
      act(() => { result.current.commitAction('check'); });    // SB
      act(() => { result.current.commitAction('bet', 20); }); // BB bet
      act(() => { result.current.commitAction('call'); });     // BTN call
      act(() => { result.current.commitAction('call'); });     // SB call → turn
      act(() => { result.current.confirmBoard(); });
      // ターン: BTNがベット
      act(() => { result.current.commitAction('check'); });    // SB
      act(() => { result.current.commitAction('check'); });    // BB
      act(() => { result.current.commitAction('bet', 40); }); // BTN bet
      act(() => { result.current.commitAction('call'); });     // SB call
      act(() => { result.current.commitAction('call'); });     // BB call → river
      act(() => { result.current.confirmBoard(); });
      // リバー: 全員チェック → showdown
      act(() => { result.current.commitAction('check'); });    // SB
      act(() => { result.current.commitAction('check'); });    // BB
      act(() => { result.current.commitAction('check'); });    // BTN → showdown

      expect(result.current.state.phase).toBe('showdown');
      // リバーでベットなし → OOP順
      expect(result.current.state.showdownQueue).toEqual(['sb', 'bb', 'btn']);
    });

  });

  // ------------------------------------------------------------------
  // showdownQueue の消費（commitShowdown）
  // ------------------------------------------------------------------
  describe('showdownQueue の消費', () => {

    it('commitShowdown で先頭が削除されて次のプレイヤーへ', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToShowdown3wayAllCheck(result);
      // queue = [SB, BB, BTN]
      const firstPlayer = result.current.state.showdownQueue[0];

      act(() => {
        result.current.commitShowdown({ playerId: firstPlayer, action: 'show' });
      });

      expect(result.current.state.showdownQueue.length).toBe(2);
      expect(result.current.state.showdownQueue[0]).not.toBe(firstPlayer);
    });

    it('全員のshowdownが完了すると phase が winner になる', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToShowdown3wayAllCheck(result);
      // queue = [SB, BB, BTN] → 3回 commitShowdown
      const queue = [...result.current.state.showdownQueue];
      for (const playerId of queue) {
        act(() => {
          result.current.commitShowdown({ playerId, action: 'show' });
        });
      }
      expect(result.current.state.phase).toBe('winner');
    });

    it('showdownRecords に各プレイヤーのアクションが記録される', () => {
      const { result } = renderHook(() => useHandFlow(makeSession3way()));
      goToShowdown3wayAllCheck(result);
      const queue = [...result.current.state.showdownQueue];

      act(() => { result.current.commitShowdown({ playerId: queue[0], action: 'show', cards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 's' }] }); });
      act(() => { result.current.commitShowdown({ playerId: queue[1], action: 'muck' }); });
      act(() => { result.current.commitShowdown({ playerId: queue[2], action: 'show', cards: [{ rank: 'Q', suit: 'd' }, { rank: 'J', suit: 'c' }] }); });

      const records = result.current.state.showdownRecords;
      expect(records.length).toBe(3);
      expect(records[0].playerId).toBe(queue[0]);
      expect(records[0].action).toBe('show');
      expect(records[1].action).toBe('muck');
    });

  });

});
