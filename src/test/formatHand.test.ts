import { describe, it, expect } from 'vitest';
import { generateHandText } from '../utils/formatHand';
import type { HandData, SessionConfig } from '../types/poker';

// ========== テスト用フィクスチャ ==========

/** 3人テーブルのセッション設定（BTN=hero, SB, BB） */
const session3way: SessionConfig = {
  players: [
    { id: 'btn', name: 'Hero', stack: 1000, holeCards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' }] },
    { id: 'sb',  name: 'SB_player', stack: 1000 },
    { id: 'bb',  name: 'BB_player', stack: 1000 },
  ],
  heroId: 'btn',
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  straddle: 0,
  currency: '$',
  outputLanguage: 'en',
};

/** プリフロップのみ（SBフォールド、BBフォールド）のハンドデータ */
const handPreflopOnly: HandData = {
  handNumber: 1,
  pot: 15,
  streets: {
    preflop: {
      actions: [
        { playerId: 'btn', type: 'raise', amount: 30 },
        { playerId: 'sb',  type: 'fold' },
        { playerId: 'bb',  type: 'fold' },
      ],
    },
  },
  winners: [{ playerId: 'btn', amount: 15 }],
  showdown: [],
};

/** フロップまで進んだハンドデータ */
const handWithFlop: HandData = {
  handNumber: 2,
  pot: 60,
  streets: {
    preflop: {
      actions: [
        { playerId: 'btn', type: 'raise', amount: 30 },
        { playerId: 'sb',  type: 'fold' },
        { playerId: 'bb',  type: 'call', amount: 30 },
      ],
    },
    flop: {
      board: [
        { rank: 'A', suit: 'h' },
        { rank: 'K', suit: 'd' },
        { rank: 'Q', suit: 'c' },
      ],
      actions: [
        { playerId: 'bb',  type: 'check' },
        { playerId: 'btn', type: 'bet', amount: 40 },
        { playerId: 'bb',  type: 'fold' },
      ],
    },
  },
  winners: [{ playerId: 'btn', amount: 60 }],
  showdown: [],
};

/** ショーダウンありのハンドデータ */
const handWithShowdown: HandData = {
  handNumber: 3,
  pot: 200,
  streets: {
    preflop: {
      actions: [
        { playerId: 'btn', type: 'raise', amount: 30 },
        { playerId: 'bb',  type: 'call' },
      ],
    },
    flop: {
      board: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'd' }, { rank: 'Q', suit: 'c' }],
      actions: [],
    },
    turn: {
      board: [{ rank: 'J', suit: 's' }],
      actions: [],
    },
    river: {
      board: [{ rank: 'T', suit: 'h' }],
      actions: [
        { playerId: 'bb',  type: 'bet', amount: 100 },
        { playerId: 'btn', type: 'call' },
      ],
    },
  },
  showdown: [
    { playerId: 'btn', cards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' }], handDescription: 'two pair, aces and kings' },
    { playerId: 'bb',  cards: [{ rank: '9', suit: 's' }, { rank: '8', suit: 's' }] },
  ],
  winners: [{ playerId: 'btn', amount: 200, description: 'two pair, aces and kings' }],
};

// ========== テスト ==========

describe('generateHandText', () => {

  describe('ヘッダー行', () => {
    it('ブラインド・ゲーム種別が含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain("Hand #1");
      expect(text).toContain("$5/$10");
      expect(text).toContain("No Limit Hold'em");
    });

    it('テーブル情報に人数が含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain("3-handed");
    });
  });

  describe('シート情報', () => {
    it('全プレイヤーのシート行が出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Seat 1: Hero');
      expect(text).toContain('Seat 2: SB_player');
      expect(text).toContain('Seat 3: BB_player');
    });

    it('heroに [hero] マークがつく', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Hero ($1000 in chips) [hero]');
    });

    it('heroでないプレイヤーに [hero] マークがつかない', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('SB_player ($1000 in chips) [hero]');
    });

    it('スタック・ポジションラベルが含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('[BTN]');
      expect(text).toContain('[SB]');
      expect(text).toContain('[BB]');
    });
  });

  describe('ブラインド投稿行', () => {
    it('SBのポスト行が出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('SB_player: posts small blind $5');
    });

    it('BBのポスト行が出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('BB_player: posts big blind $10');
    });

    it('anteが0の場合はante行が出力されない', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('ante');
    });

    it('anteが設定されている場合は全員のante行が出力される', () => {
      const sessionWithAnte = { ...session3way, ante: 1 };
      const text = generateHandText(handPreflopOnly, sessionWithAnte);
      expect(text).toContain('Hero: posts the ante $1');
      expect(text).toContain('SB_player: posts the ante $1');
      expect(text).toContain('BB_player: posts the ante $1');
    });
  });

  describe('プリフロップのアクション行', () => {
    it('*** HOLE CARDS *** ヘッダーが出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('*** HOLE CARDS ***');
    });

    it('heroのホールカードが出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Dealt to Hero [Ah Kh]');
    });

    it('raiseアクションが正しい形式で出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Hero: raises to $30');
    });

    it('foldアクションが正しい形式で出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('SB_player: folds');
      expect(text).toContain('BB_player: folds');
    });

    it('callアクションが正しい形式で出力される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('BB_player: calls $30');
    });
  });

  describe('フロップ', () => {
    it('*** FLOP *** ヘッダーにボードカードが含まれる', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('*** FLOP *** [Ah Kd Qc]');
    });

    it('フロップのcheckアクションが出力される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('BB_player: checks');
    });

    it('フロップのbetアクションが出力される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('Hero: bets $40');
    });

    it('プリフロップのみの場合はフロップセクションが出力されない', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('*** FLOP ***');
    });
  });

  describe('ターン・リバー', () => {
    it('ターンヘッダーにフロップ+ターンのカードが含まれる', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('*** TURN *** [Ah Kd Qc Js]');
    });

    it('リバーヘッダーにフロップ+ターン+リバーのカードが含まれる', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('*** RIVER *** [Ah Kd Qc Js Th]');
    });
  });

  describe('ショーダウン', () => {
    it('*** SHOW DOWN *** ヘッダーが出力される', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('*** SHOW DOWN ***');
    });

    it('showエントリにカードと説明が含まれる', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('Hero: shows [Ah Kh] (two pair, aces and kings)');
    });

    it('説明なしのshowエントリはカードのみ出力される', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('BB_player: shows [9s 8s]');
    });

    it('showdownがない場合は*** SHOW DOWN ***が出力されない', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('*** SHOW DOWN ***');
    });
  });

  describe('サマリー', () => {
    it('*** SUMMARY *** ヘッダーが出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('*** SUMMARY ***');
    });

    it('Total pot が出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Total pot $15');
    });

    it('winnerのcollected行が出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Hero collected $15 from pot');
    });

    it('winnerにdescriptionがある場合はwith句が含まれる', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('Hero collected $200 from pot with two pair, aces and kings');
    });

    it('フロップ以降があればBoardが出力される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('Board [Ah Kd Qc]');
    });

    it('プリフロップのみの場合はBoard行が出力されない', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('Board [');
    });
  });

});
