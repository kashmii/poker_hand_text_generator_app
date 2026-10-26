import { describe, it, expect } from 'vitest';
import { computeHeroResult } from '../utils/computeHeroResult';
import type { HandData, SessionConfig, Action } from '../types/poker';

/** 3人テーブル: [BTN=0, SB=1, BB=2]、ブラインド 5/10 */
function session3(heroId: string, over: Partial<SessionConfig> = {}): SessionConfig {
  return {
    players: [
      { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
      { id: 'sb', name: 'SB', stack: 1000, position: 1 },
      { id: 'bb', name: 'BB', stack: 1000, position: 2 },
    ],
    heroId,
    heroPosition: 'BTN',
    heroEffectiveStack: 100,
    smallBlind: 5,
    bigBlind: 10,
    ante: 0,
    straddle: 0,
    currency: '$',
    venueName: '',
    date: '2024-01-01',
    ...over,
  };
}

/** HU テーブル: [BTN(=SB)=0, BB=1]、ブラインド 5/10 */
function sessionHU(heroId: string): SessionConfig {
  return {
    ...session3(heroId),
    players: [
      { id: 'btn', name: 'BTN', stack: 1000, position: 0 },
      { id: 'bb', name: 'BB', stack: 1000, position: 1 },
    ],
  };
}

function hand(
  session: SessionConfig,
  preflop: Action[],
  winners: HandData['winners'],
  extra: Partial<HandData> = {},
): HandData {
  return {
    id: 'h1',
    handNumber: 1,
    dealerPosition: 0,
    streets: { preflop: { actions: preflop } },
    pot: 0,
    winners,
    session,
    ...extra,
  };
}

describe('computeHeroResult', () => {
  it('session が無ければ null', () => {
    const h = hand(session3('btn'), [], []);
    delete h.session;
    expect(computeHeroResult(h)).toBeNull();
  });

  it('heroId が空なら null', () => {
    expect(computeHeroResult(hand(session3(''), [], []))).toBeNull();
  });

  it('SB がプリフロップでフォールド → ブラインド分の負け（-5）', () => {
    const h = hand(
      session3('sb'),
      [
        { playerId: 'btn', type: 'raise', amount: 30 },
        { playerId: 'sb', type: 'fold' },
        { playerId: 'bb', type: 'fold' },
      ],
      [{ playerId: 'btn', amount: 25 }],
    );
    expect(computeHeroResult(h)).toBe(-5);
  });

  it('BTN がプリフロップレイズで全員フォールド → +15（アンコール分は拠出から控除）', () => {
    const h = hand(
      session3('btn'),
      [
        { playerId: 'btn', type: 'raise', amount: 30 },
        { playerId: 'sb', type: 'fold' },
        { playerId: 'bb', type: 'fold' },
      ],
      [{ playerId: 'btn', amount: 25 }],
    );
    // 獲得25 − 拠出10（レイズ30のうち未コール20は返却）= +15
    expect(computeHeroResult(h)).toBe(15);
  });

  it('HU: オールイン対オールインで勝ち → 相手の拠出分だけ勝つ（+300）', () => {
    const h = hand(
      sessionHU('btn'),
      [
        { playerId: 'btn', type: 'allin', amount: 1000 },
        { playerId: 'bb', type: 'allin', amount: 300 },
      ],
      [{ playerId: 'btn', amount: 600 }],
    );
    // btn の 1000 は 300 までしかコールされず拠出は 300。獲得600 − 300 = +300
    expect(computeHeroResult(h)).toBe(300);
  });

  it('HU: オールイン対オールインで負け → 自分の拠出分だけ負ける（-300）', () => {
    const h = hand(
      sessionHU('btn'),
      [
        { playerId: 'btn', type: 'allin', amount: 1000 },
        { playerId: 'bb', type: 'allin', amount: 300 },
      ],
      [{ playerId: 'bb', amount: 600 }],
    );
    expect(computeHeroResult(h)).toBe(-300);
  });

  it('アンティは BB が全額払う（hero が BB のときだけ拠出へ加算）', () => {
    // BB が hero、プリフロップで全員フォールドして hero が獲得（ウォーク）。
    // アンティ 6 はポット（獲得額）に入るが contributions には入らないので、
    // アンコール返却では戻らない。
    const h = hand(
      session3('bb', { ante: 6 }),
      [
        { playerId: 'btn', type: 'fold' },
        { playerId: 'sb', type: 'fold' },
      ],
      // 獲得額 = SB5 + BB10 + ante6 − 未コール(BB10−SB5=5) = 16
      [{ playerId: 'bb', amount: 16 }],
    );
    // BB 拠出 = ブラインド分 5（未コール返却後） + ante6 = 11。獲得16 − 11 = +5
    expect(computeHeroResult(h)).toBe(5);
  });

  it('複数勝者（チョップ）では hero 分のみ加算', () => {
    const h = hand(
      session3('btn'),
      [
        { playerId: 'btn', type: 'call', amount: 10 },
        { playerId: 'sb', type: 'call', amount: 5 },
        { playerId: 'bb', type: 'check' },
      ],
      [
        { playerId: 'btn', amount: 15 },
        { playerId: 'sb', amount: 15 },
      ],
    );
    // btn 拠出 10、獲得 15 → +5
    expect(computeHeroResult(h)).toBe(5);
  });

  it('ポストフロップのベットも拠出に積算される', () => {
    const h = hand(
      session3('btn'),
      [
        { playerId: 'btn', type: 'call', amount: 10 },
        { playerId: 'sb', type: 'fold' },
        { playerId: 'bb', type: 'check' },
      ],
      [{ playerId: 'btn', amount: 70 }],
      {
        streets: {
          preflop: {
            actions: [
              { playerId: 'btn', type: 'call', amount: 10 },
              { playerId: 'sb', type: 'fold' },
              { playerId: 'bb', type: 'check' },
            ],
          },
          flop: {
            board: [
              { rank: 'A', suit: 'h' },
              { rank: '7', suit: 'c' },
              { rank: '2', suit: 'd' },
            ],
            actions: [
              { playerId: 'bb', type: 'bet', amount: 20 },
              { playerId: 'btn', type: 'call', amount: 20 },
            ],
          },
        },
      },
    );
    // btn 拠出 = preflop 10 + flop 20 = 30、獲得 70 → +40
    expect(computeHeroResult(h)).toBe(40);
  });
});
