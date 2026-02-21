import { describe, it, expect } from 'vitest';
import { generateHandText } from '../utils/formatHand';
import type { HandData, SessionConfig } from '../types/poker';

// ========== テスト用フィクスチャ ==========

/** 3人テーブルのセッション設定（BTN=hero, SB, BB） */
const session3way: SessionConfig = {
  players: [
    { id: 'btn', name: 'Hero', stack: 1000, position: 0, holeCards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' }] },
    { id: 'sb',  name: 'SB_player', stack: 1000, position: 1 },
    { id: 'bb',  name: 'BB_player', stack: 1000, position: 2 },
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

/** プリフロップのみ（SBフォールド、BBフォールド）のハンドデータ */
const handPreflopOnly: HandData = {
  id: 'hand-1',
  handNumber: 1,
  dealerPosition: 0,
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
  id: 'hand-2',
  handNumber: 2,
  dealerPosition: 0,
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
  id: 'hand-3',
  handNumber: 3,
  dealerPosition: 0,
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
    it('ブラインド・ライブ表記が含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('$5/10 (Live)');
    });

    it('ハンド番号と日付が含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Hand n°1');
      expect(text).toContain('2024-01-01');
    });

    it('人数が含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('3 players');
    });
  });

  describe('Setupセクション', () => {
    it('heroのホールカードがポジション名付きで出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('BTN [A♥ K♥]');
    });

    it('hero以外のカードはSetupに含まれない', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('BTN [A♥ K♥]');
      expect(text).not.toContain('BB [9♠ 8♠]\nSetup');
    });

    it('ホールカードなしの場合はSetupセクションが省略される', () => {
      const sessionNoHole: SessionConfig = {
        ...session3way,
        players: session3way.players.map((p) => ({ ...p, holeCards: undefined })),
      };
      const text = generateHandText(handPreflopOnly, sessionNoHole);
      expect(text).not.toContain('Setup');
    });
  });

  describe('ブラインド投稿行', () => {
    it('Preflopヘッダーが出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Preflop (Pot size: 0)');
    });

    it('SBのポスト行がポジション名で出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('SB posts small blind $5');
    });

    it('BBのポスト行がポジション名で出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('BB posts big blind $10');
    });

    it('anteが0の場合はante行が出力されない', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('ante');
    });

    it('anteが設定されている場合は全員のante行が出力される', () => {
      const sessionWithAnte = { ...session3way, ante: 1 };
      const text = generateHandText(handPreflopOnly, sessionWithAnte);
      expect(text).toContain('BTN posts ante $1');
      expect(text).toContain('SB posts ante $1');
      expect(text).toContain('BB posts ante $1');
    });
  });

  describe('プリフロップのアクション行', () => {
    it('raiseアクションがポジション名・toなし形式で出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('BTN raises $30');
    });

    it('foldアクションがポジション名で出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('SB folds');
      expect(text).toContain('BB folds');
    });

    it('callアクションがポジション名で出力される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('BB calls $30');
    });
  });

  describe('フロップ', () => {
    it('Flopヘッダーにポットサイズとボードカードが含まれる', () => {
      const text = generateHandText(handWithFlop, session3way);
      // preflop: SB $5 + BB $10 + BTN raise $30 (BB call $30 でpot=60-但しここでは開始前)
      // preflop pot = SB5 + BB10 + BTN raise追加分(30-0=30) + BB call(30) = 75... しかし
      // 実際にはSB+BB=15がベース、BTNがraiseして30、BBがcall30で pot=30*2=60
      expect(text).toContain('Flop (Pot size:');
      expect(text).toContain('[A♥ K♦ Q♣]');
    });

    it('フロップのcheckアクションがポジション名で出力される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('BB checks');
    });

    it('フロップのbetアクションがポジション名で出力される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('BTN bets $40');
    });

    it('プリフロップのみの場合はFlopセクションが出力されない', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('Flop (Pot size:');
    });
  });

  describe('ターン・リバー', () => {
    it('Turnヘッダーにポットサイズとボードカードが含まれる', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('Turn (Pot size:');
      expect(text).toContain('[J♠]');
    });

    it('Riverヘッダーにポットサイズとボードカードが含まれる', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('River (Pot size:');
      expect(text).toContain('[T♥]');
    });
  });

  describe('サマリー', () => {
    it('Summaryヘッダーに最終ポットサイズが含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Summary (Pot size: 15)');
    });

    it('ショーダウン参加者のshows行が出力される', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('BTN shows [A♥ K♥]');
      expect(text).toContain('BB shows [9♠ 8♠]');
    });

    it('ショーダウンなしの場合はshows行が出力されない', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('shows');
    });

    it('ウィナーのwins行が出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('BTN wins $15');
    });

    it('プレイヤー名ではなくポジション名で出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('Hero:');
      expect(text).not.toContain('SB_player:');
    });
  });

  describe('スーツ絵文字', () => {
    it('ハートが♥で表示される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('♥');
    });

    it('ダイヤが♦で表示される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('♦');
    });

    it('クラブが♣で表示される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('♣');
    });

    it('スペードが♠で表示される', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('♠');
    });
  });

});
