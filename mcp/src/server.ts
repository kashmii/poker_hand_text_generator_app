import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { formatCardsSpaced, generateHandText } from '../../src/utils/formatHand';
import { ApiError, type Hand, type HandSummary, type HandsApi } from './api';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * createServer は自分のハンドを読む 2 つの tool（list_hands / get_hand）を持つ MCP サーバーを作る。
 * どちらも読み取りだけ（Go 側でも個人用キーは GET しか通さない）。
 */
export function createServer(api: HandsApi): McpServer {
  const server = new McpServer({ name: 'poker-hands', version: '0.1.0' });

  server.registerTool(
    'list_hands',
    {
      title: 'ハンド一覧',
      description:
        '自分が記録したポーカーのハンドの一覧を新しい順に返す。各行の id を get_hand に渡すと、そのハンドの詳細（アクションの流れ）を読める。',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().describe('返す件数（既定 20、最大 200）'),
        playedFrom: z.string().regex(datePattern).optional().describe('この日以降にプレイしたハンドだけ（YYYY-MM-DD）'),
        playedTo: z.string().regex(datePattern).optional().describe('この日以前にプレイしたハンドだけ（YYYY-MM-DD）'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit = 20, playedFrom, playedTo }) => {
      const all = await api.listHands();
      // 日付で絞るときは、日付が分からないハンドは外す（YYYY-MM-DD は文字列のまま大小比較できる）
      const filtered = all.filter(
        (h) =>
          (!playedFrom || (h.playedOn !== null && h.playedOn >= playedFrom)) &&
          (!playedTo || (h.playedOn !== null && h.playedOn <= playedTo)),
      );
      const shown = filtered.slice(0, limit);
      const header = `${filtered.length} 件中 ${shown.length} 件（新しい順）`;
      return { content: [{ type: 'text', text: [header, ...shown.map(summaryLine)].join('\n') }] };
    },
  );

  server.registerTool(
    'get_hand',
    {
      title: 'ハンドの詳細',
      description:
        'id を指定して、自分のハンド1件をハンド履歴のテキスト（ブラインド・各ストリートのアクション・ボード・結果・メモ）で返す。id は list_hands で調べる。',
      inputSchema: z.object({
        id: z.uuid().describe('list_hands が返したハンドの id'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      let hand: Hand;
      try {
        hand = await api.getHand(id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return { content: [{ type: 'text', text: `id ${id} のハンドは見つからない。list_hands で id を確認して。` }], isError: true };
        }
        throw err;
      }
      return { content: [{ type: 'text', text: handText(hand) }] };
    },
  );

  return server;
}

function summaryLine(h: HandSummary): string {
  const parts = [`id: ${h.id}`, h.playedOn ?? '日付不明'];
  if (h.venueName) parts.push(h.venueName);
  if (h.title) parts.push(h.title);
  if (h.heroHoleCards?.length) parts.push(`Hero: ${formatCardsSpaced(h.heroHoleCards)}`);
  if (h.board?.length) parts.push(`Board: ${formatCardsSpaced(h.board)}`);
  return `- ${parts.join(' | ')}`;
}

function handText(hand: Hand): string {
  const header = [`id: ${hand.id}`];
  if (hand.venueName) header.push(`店: ${hand.venueName}`);

  // 記録時のセッション設定（人数・ブラインド）がないとテキストにできないので、そのときは生データを返す
  const session = hand.data.session;
  if (!session) {
    return [...header, '（セッション設定がないためテキスト化できない。記録データをそのまま返す）', JSON.stringify(hand.data, null, 2)].join('\n');
  }
  return [...header, '', generateHandText(hand.data, session)].join('\n');
}
