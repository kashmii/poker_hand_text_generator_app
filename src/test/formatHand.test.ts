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

/** オールインの各パターン（bet/call/raise）を含むハンド */
const handWithAllIns: HandData = {
  id: 'hand-4',
  handNumber: 4,
  dealerPosition: 0,
  pot: 300,
  streets: {
    preflop: {
      actions: [
        // プリフロップ: BBの10を超える → raise 判定
        { playerId: 'btn', type: 'allin', amount: 50 },
        // コール必要額(50)と同額 → call 判定（ショートスタックのコール）
        { playerId: 'sb',  type: 'allin', amount: 50 },
        { playerId: 'bb',  type: 'fold' },
      ],
    },
    flop: {
      board: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'd' }, { rank: 'Q', suit: 'c' }],
      actions: [
        // ストリート先頭・未ベット → bet 判定
        { playerId: 'sb',  type: 'allin', amount: 80 },
      ],
    },
  },
  winners: [{ playerId: 'btn', amount: 300 }],
  showdown: [],
};

// ========== テスト ==========

describe('generateHandText', () => {

  describe('オールインの記録表記', () => {
    it('既存ベットを超えるオールインは raise ... and is all-in と出力される', () => {
      const text = generateHandText(handWithAllIns, session3way);
      expect(text).toContain('BTN (hero) raises $50 and is all-in');
    });

    it('コール必要額と同額（ショート）のオールインは call ... and is all-in と出力される', () => {
      const text = generateHandText(handWithAllIns, session3way);
      expect(text).toContain('SB calls $50 and is all-in');
    });

    it('ストリート先頭・未ベットのオールインは bet ... and is all-in と出力される', () => {
      const text = generateHandText(handWithAllIns, session3way);
      expect(text).toContain('SB bets $80 and is all-in');
    });
  });


  describe('ヘッダー行', () => {
    it('ブラインド表記が含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('$5/10');
    });

    it('日付が含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('2024-01-01');
    });

    it('人数が含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('3 players');
    });
  });

  describe('Setupセクション', () => {
    it('heroのホールカードがポジション名・hero識別子付きで出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('BTN (hero) [A♥ K♥]');
    });

    it('hero以外のカードはSetupに含まれない', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('BTN (hero) [A♥ K♥]');
      expect(text).not.toContain('BB [9♠ 8♠]\nSetup');
    });

    it('ホールカードなしでもheroポジションがあればSetupセクションが出力される', () => {
      const sessionNoHole: SessionConfig = {
        ...session3way,
        players: session3way.players.map((p) => ({ ...p, holeCards: undefined })),
      };
      const text = generateHandText(handPreflopOnly, sessionNoHole);
      expect(text).toContain('Setup');
      expect(text).toContain('BTN (hero)');
    });

    it('heroIdが空の場合はSetupセクションが省略される', () => {
      const sessionNoHero: SessionConfig = { ...session3way, heroId: '' };
      const text = generateHandText(handPreflopOnly, sessionNoHero);
      expect(text).not.toContain('Setup');
    });
  });

  describe('ブラインド投稿行', () => {
    it('Preflopヘッダーに人数とPot sizeが含まれる', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('Preflop (3 players, Pot size: 0)');
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

    it('anteが設定されている場合はBBのみのante行が出力される', () => {
      const sessionWithAnte = { ...session3way, ante: 1 };
      const text = generateHandText(handPreflopOnly, sessionWithAnte);
      expect(text).toContain('BB posts big blind ante $1');
      expect(text).not.toContain('BTN posts');
      expect(text).not.toContain('SB posts big blind ante');
    });
  });

  describe('プリフロップのアクション行', () => {
    it('raiseアクションがポジション名・hero識別子付きで出力される', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('BTN (hero) raises $30');
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
    it('Flopヘッダーに人数・ポットサイズ・ボードカードが含まれる', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('Flop (2 players, Pot size:');
      expect(text).toContain('[A♥ K♦ Q♣]');
    });

    it('フロップのcheckアクションがポジション名で出力される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('BB checks');
    });

    it('フロップのbetアクションがhero識別子付きで出力される', () => {
      const text = generateHandText(handWithFlop, session3way);
      expect(text).toContain('BTN (hero) bets $40');
    });

    it('プリフロップのみの場合はFlopセクションが出力されない', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).not.toContain('Flop (Pot size:');
    });
  });

  describe('ターン・リバー', () => {
    it('Turnヘッダーに人数・ポットサイズ・ボードカードが含まれる', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('Turn (');
      expect(text).toContain('Pot size:');
      expect(text).toContain('[J♠]');
    });

    it('Riverヘッダーに人数・ポットサイズ・ボードカードが含まれる', () => {
      const text = generateHandText(handWithShowdown, session3way);
      expect(text).toContain('River (');
      expect(text).toContain('Pot size:');
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

  // ========== サイドポットのウィナー表記（要求17） ==========
  describe('ウィナー表記', () => {
    it('単一ポットはラベルなしで "wins $N"', () => {
      const text = generateHandText(handPreflopOnly, session3way);
      expect(text).toContain('BTN wins $15');
      expect(text).not.toContain('main pot');
    });

    it('複数ポットは "wins main pot / side pot" と明記される', () => {
      const hand: HandData = {
        ...handPreflopOnly,
        pot: 230,
        winners: [
          { playerId: 'bb', amount: 90, label: 'main pot' },
          { playerId: 'btn', amount: 140, label: 'side pot' },
        ],
      };
      const text = generateHandText(hand, session3way);
      expect(text).toContain('BB wins main pot $90');
      expect(text).toContain('BTN wins side pot $140');
    });

    it('単一ポットのチョップは "splits the pot" を1人1行で出す（端数は実額）', () => {
      const hand: HandData = {
        ...handPreflopOnly,
        pot: 101,
        winners: [
          { playerId: 'sb', amount: 51, label: 'main pot' },
          { playerId: 'btn', amount: 50, label: 'main pot' },
        ],
      };
      const text = generateHandText(hand, session3way);
      expect(text).toContain('SB splits the pot $51');
      expect(text).toContain('BTN splits the pot $50');
      expect(text).not.toContain('wins');
    });

    it('サイドポットがあるときのチョップはポット名を明記する', () => {
      const hand: HandData = {
        ...handPreflopOnly,
        pot: 230,
        winners: [
          { playerId: 'sb', amount: 45, label: 'main pot' },
          { playerId: 'btn', amount: 45, label: 'main pot' },
          { playerId: 'bb', amount: 140, label: 'side pot' },
        ],
      };
      const text = generateHandText(hand, session3way);
      expect(text).toContain('SB splits main pot $45');
      expect(text).toContain('BTN splits main pot $45');
      expect(text).toContain('BB wins side pot $140');
    });
  });

});
