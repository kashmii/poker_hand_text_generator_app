import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { HandData, SessionConfig } from '../../src/types/poker';
import { ApiError, type Hand, type HandSummary, type HandsApi } from '../src/api';
import { createServer } from '../src/server';

const handID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

const session: SessionConfig = {
  players: [
    { id: 'btn', name: 'Hero', stack: 1000, position: 0 },
    { id: 'sb', name: 'SB_player', stack: 1000, position: 1 },
    { id: 'bb', name: 'BB_player', stack: 1000, position: 2 },
  ],
  heroId: 'btn',
  heroPosition: 'BTN',
  heroEffectiveStack: 100,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  straddle: 0,
  currency: '$',
  venueName: 'テスト店',
  date: '2026-10-20',
};

const handData: HandData = {
  id: handID,
  handNumber: 1,
  dealerPosition: 0,
  pot: 15,
  streets: {
    preflop: {
      actions: [
        { playerId: 'btn', type: 'raise', amount: 30 },
        { playerId: 'sb', type: 'fold' },
        { playerId: 'bb', type: 'fold' },
      ],
    },
  },
  heroHoleCards: [
    { rank: 'A', suit: 's' },
    { rank: 'K', suit: 's' },
  ],
  winners: [{ playerId: 'btn', amount: 15 }],
  notes: 'オープンで取れた',
  session,
};

function summary(over: Partial<HandSummary>): HandSummary {
  return {
    id: handID,
    title: '',
    venueName: 'テスト店',
    playedOn: '2026-10-20',
    createdAt: '2026-10-20T12:00:00Z',
    updatedAt: '2026-10-20T12:00:00Z',
    ...over,
  };
}

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect(api: Partial<HandsApi>): Promise<Client> {
  const fake: HandsApi = {
    listHands: async () => [],
    getHand: async () => {
      throw new ApiError(404, 'not found');
    },
    ...api,
  };
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  await createServer(fake).connect(serverEnd);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientEnd);
  return client;
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as { type: string; text?: string }[];
  return content.map((c) => c.text ?? '').join('\n');
}

describe('tools', () => {
  it('読み取りの 2 つだけを公開する', async () => {
    const c = await connect({});
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_hand', 'list_hands']);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });
});

describe('list_hands', () => {
  const hands = [
    summary({ id: 'a', playedOn: '2026-10-22', title: '3bet pot', heroHoleCards: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }] }),
    summary({ id: 'b', playedOn: '2026-10-20', board: [{ rank: 'Q', suit: 'h' }, { rank: 'J', suit: 'd' }, { rank: '2', suit: 'c' }] }),
    summary({ id: 'c', playedOn: null, venueName: '' }),
  ];

  it('概要を 1 行ずつ返す', async () => {
    const c = await connect({ listHands: async () => hands });
    const out = text(await c.callTool({ name: 'list_hands', arguments: {} }));
    expect(out).toBe(
      [
        '3 件中 3 件（新しい順）',
        '- id: a | 2026-10-22 | テスト店 | 3bet pot | Hero: A♠ K♠',
        '- id: b | 2026-10-20 | テスト店 | Board: Q♥ J♦ 2♣',
        '- id: c | 日付不明',
      ].join('\n'),
    );
  });

  it('limit で件数を絞る', async () => {
    const c = await connect({ listHands: async () => hands });
    const out = text(await c.callTool({ name: 'list_hands', arguments: { limit: 1 } }));
    expect(out.split('\n')).toEqual(['3 件中 1 件（新しい順）', '- id: a | 2026-10-22 | テスト店 | 3bet pot | Hero: A♠ K♠']);
  });

  it('日付で絞ると、日付不明のハンドは外れる', async () => {
    const c = await connect({ listHands: async () => hands });
    const out = text(await c.callTool({ name: 'list_hands', arguments: { playedFrom: '2026-10-21' } }));
    expect(out.split('\n')).toEqual(['1 件中 1 件（新しい順）', '- id: a | 2026-10-22 | テスト店 | 3bet pot | Hero: A♠ K♠']);

    const out2 = text(await c.callTool({ name: 'list_hands', arguments: { playedTo: '2026-10-21' } }));
    expect(out2.split('\n')[0]).toBe('1 件中 1 件（新しい順）');
    expect(out2).toContain('id: b');
  });

  it('不正な引数は SDK が弾く', async () => {
    const c = await connect({ listHands: async () => hands });
    const res = await c.callTool({ name: 'list_hands', arguments: { playedFrom: '10/21' } });
    expect(res.isError).toBe(true);
  });

  it('API のエラーは isError で返す', async () => {
    const c = await connect({
      listHands: async () => {
        throw new ApiError(401, 'GET /hands failed: 401 unauthorized');
      },
    });
    const res = await c.callTool({ name: 'list_hands', arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('401');
  });
});

describe('get_hand', () => {
  const hand: Hand = { ...summary({}), data: handData };

  it('アプリと同じハンド履歴テキストを返す', async () => {
    let requested = '';
    const c = await connect({
      getHand: async (id) => {
        requested = id;
        return hand;
      },
    });
    const out = text(await c.callTool({ name: 'get_hand', arguments: { id: handID } }));
    expect(requested).toBe(handID);
    expect(out).toContain(`id: ${handID}`);
    expect(out).toContain('店: テスト店');
    expect(out).toContain('BTN (hero) [A♠ K♠]');
    expect(out).toContain('BTN (hero) raises $30');
    expect(out).toContain('Notes: オープンで取れた');
  });

  it('セッション設定がなければ記録データをそのまま返す', async () => {
    const c = await connect({ getHand: async () => ({ ...hand, data: { ...handData, session: undefined } }) });
    const out = text(await c.callTool({ name: 'get_hand', arguments: { id: handID } }));
    expect(out).toContain('セッション設定がないため');
    expect(out).toContain('"handNumber": 1');
  });

  it('見つからないときは id の確認を促す', async () => {
    const c = await connect({});
    const res = await c.callTool({ name: 'get_hand', arguments: { id: handID } });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('list_hands');
  });

  it('UUID でない id は SDK が弾く', async () => {
    const c = await connect({ getHand: async () => hand });
    const res = await c.callTool({ name: 'get_hand', arguments: { id: '../me' } });
    expect(res.isError).toBe(true);
  });
});
