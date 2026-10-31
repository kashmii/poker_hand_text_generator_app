import { describe, it, expect } from 'vitest';
import {
  handFlowReducer,
  createInitialState,
  canStraddle,
  currentActorId,
  type HandFlow,
  type HandFlowContext,
  type HandFlowEvent,
} from '../components/hand/handFlowReducer';
import type { SessionConfig } from '../types/poker';

// ========== テスト用フィクスチャ ==========

function makeSession(ids: string[], patch: Partial<SessionConfig> = {}): SessionConfig {
  return {
    players: ids.map((id, i) => ({ id, name: id.toUpperCase(), stack: 1000, position: i })),
    heroId: ids[0],
    heroPosition: 'BTN',
    heroEffectiveStack: 100,
    smallBlind: 5,
    bigBlind: 10,
    ante: 0,
    straddle: 0,
    currency: '$',
    venueName: '',
    date: '2024-01-01',
    ...patch,
  };
}

function makeCtx(session: SessionConfig, autoResolve = true): HandFlowContext {
  return { players: session.players, playerIds: session.players.map((p) => p.id), autoResolve };
}

/** イベントを順に適用する */
function run(flow: HandFlow, ctx: HandFlowContext, events: HandFlowEvent[]): HandFlow {
  return events.reduce((f, e) => handFlowReducer(f, e, ctx), flow);
}

function start(session: SessionConfig): HandFlow {
  return { state: createInitialState(session), history: [] };
}

// ========== テスト ==========

describe('createInitialState', () => {
  it('3人以上: SB/BB のポストを拠出に入れ、BB アンティは通算拠出だけに入れる', () => {
    const s = createInitialState(makeSession(['btn', 'sb', 'bb', 'utg'], { ante: 10 }));
    expect(s.contributions).toEqual({ btn: 0, sb: 5, bb: 10, utg: 0 });
    expect(s.totalContributions).toEqual({ btn: 0, sb: 5, bb: 20, utg: 0 });
    expect(s.pot).toBe(25);
    expect(s.preflopOrder).toEqual(['utg', 'btn', 'sb', 'bb']);
    expect(s.closingPlayerId).toBe('bb');
  });

  it('ヘッズアップ: BTN が SB、もう1人が BB を払う', () => {
    const s = createInitialState(makeSession(['btn', 'bb'], { ante: 10 }));
    expect(s.contributions).toEqual({ btn: 5, bb: 10 });
    expect(s.totalContributions).toEqual({ btn: 5, bb: 20 });
    expect(s.preflopOrder).toEqual(['btn', 'bb']);
  });
});

describe('handFlowReducer: 履歴', () => {
  const session = makeSession(['btn', 'sb', 'bb']);
  const ctx = makeCtx(session);

  it('手札・ボードのメモ入力とフェーズ移動は履歴に積まない', () => {
    const flow = run(start(session), ctx, [
      { type: 'set-hole-cards', cards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' }] },
      { type: 'update-board', street: 'flop', idx: 0, card: { rank: '2', suit: 'c' } },
      { type: 'start-action' },
    ]);
    expect(flow.history).toHaveLength(0);
    expect(flow.state.phase).toBe('action');
    expect(flow.state.boards.flop[0]).toEqual({ rank: '2', suit: 'c' });
  });

  it('アクションで直前の state を積み、go-back でその state に戻る', () => {
    const before = run(start(session), ctx, [{ type: 'start-action' }]);
    const after = run(before, ctx, [{ type: 'commit-action', actionType: 'call' }]);
    expect(after.history).toEqual([before.state]);

    const back = run(after, ctx, [{ type: 'go-back' }]);
    expect(back.state).toBe(before.state);
    expect(back.history).toHaveLength(0);
  });

  it('state が変わらない操作は履歴に積まない（勝者なしの確定など）', () => {
    const flow = run(start(session), ctx, [
      { type: 'start-action' },
      { type: 'confirm-pot-winner', winnerIds: [] },
    ]);
    expect(flow.history).toHaveLength(0);
  });

  it('履歴が空のときの go-back は何もしない', () => {
    const flow = start(session);
    expect(handFlowReducer(flow, { type: 'go-back' }, ctx)).toBe(flow);
  });

  it('入力の state を書き換えない（純粋関数）', () => {
    const before = run(start(session), ctx, [{ type: 'start-action' }]);
    const snapshot = structuredClone(before.state);
    run(before, ctx, [
      { type: 'commit-action', actionType: 'raise', amount: 30 },
      { type: 'commit-action', actionType: 'fold' },
      { type: 'commit-action', actionType: 'call' },
    ]);
    expect(before.state).toEqual(snapshot);
  });
});

describe('handFlowReducer: ストラドル', () => {
  const session = makeSession(['btn', 'sb', 'bb', 'utg', 'hj', 'co']);
  const ctx = makeCtx(session);

  it('UTG のストラドルで順番が組み替わり、HJ もストラドルできる', () => {
    const flow = run(start(session), ctx, [
      { type: 'start-action' },
      { type: 'commit-action', actionType: 'straddle' },
    ]);
    const s = flow.state;
    expect(s.preflopOrder).toEqual(['hj', 'co', 'btn', 'sb', 'bb', 'utg']);
    expect(s.currentStraddle).toBe(20);
    expect(s.pot).toBe(35);
    expect(s.closingPlayerId).toBe('utg');
    expect(currentActorId(s, ctx.playerIds)).toBe('hj');
    expect(canStraddle(s, ctx.playerIds)).toBe(true);
  });

  it('ストラドル以外のアクションが入ったらストラドル不可', () => {
    const flow = run(start(session), ctx, [
      { type: 'start-action' },
      { type: 'commit-action', actionType: 'call' },
    ]);
    expect(canStraddle(flow.state, ctx.playerIds)).toBe(false);
  });
});
