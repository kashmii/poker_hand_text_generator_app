import type { HandData, SessionConfig } from '../types/poker';

const STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
const TITLES = [
  'KKでBTNから3bet',
  'AAをスローブレイ',
  'ブラフ成功',
  'セットマイニング',
  'フラッシュドロー',
  undefined,
  'リバーバリューベット',
  undefined,
  'スクイーズポット',
  'チェックレイズ',
  'オールインコール',
  undefined,
  'BTNオープン',
];

function randomId() {
  return Math.random().toString(36).slice(2, 9);
}

export function generateDummyHands(session: SessionConfig, startNumber: number, count: number): HandData[] {
  const players = session.players;
  if (players.length < 2) return [];

  return Array.from({ length: count }, (_, i) => {
    const handNumber = startNumber + i;
    const streetDepth = STREETS[Math.floor(Math.random() * STREETS.length)];
    const streetDepthIdx = STREETS.indexOf(streetDepth);

    const sbId = players[1]?.id ?? players[0].id;
    const bbId = players[2]?.id ?? players[1]?.id ?? players[0].id;

    const preflopActions = [
      { playerId: sbId, type: 'call' as const, amount: session.bigBlind },
      { playerId: bbId, type: 'check' as const },
    ];

    const streets: HandData['streets'] = {
      preflop: { actions: preflopActions },
    };

    if (streetDepthIdx >= 1) {
      streets.flop = {
        board: [
          { rank: 'A', suit: 'h' },
          { rank: '7', suit: 'c' },
          { rank: '2', suit: 'd' },
        ],
        actions: [
          { playerId: sbId, type: 'check' as const },
          { playerId: bbId, type: 'bet' as const, amount: session.bigBlind * 3 },
          { playerId: sbId, type: 'fold' as const },
        ],
      };
    }
    if (streetDepthIdx >= 2) {
      streets.turn = {
        board: [{ rank: 'K', suit: 's' }],
        actions: [
          { playerId: bbId, type: 'bet' as const, amount: session.bigBlind * 5 },
        ],
      };
    }
    if (streetDepthIdx >= 3) {
      streets.river = {
        board: [{ rank: '9', suit: 'h' }],
        actions: [
          { playerId: bbId, type: 'bet' as const, amount: session.bigBlind * 10 },
        ],
      };
    }

    const pot = session.bigBlind * (4 + Math.floor(Math.random() * 20));
    const winnerId = players[Math.floor(Math.random() * players.length)].id;

    return {
      id: randomId(),
      handNumber,
      dealerPosition: 0,
      streets,
      pot,
      winners: [{ playerId: winnerId, amount: pot }],
      title: TITLES[(handNumber - 1) % TITLES.length],
    } satisfies HandData;
  });
}
