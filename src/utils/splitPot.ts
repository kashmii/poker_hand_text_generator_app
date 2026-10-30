/**
 * ポットを複数の勝者（チョップ）で分ける。
 *
 * - 各人に floor(amount / 人数) を配り、余り（odd chip）は優先順の先頭から1ずつ配る。
 * - 優先順は postflop のアクション順（SB が最優先、BTN が最後）。orderedIds で渡す。
 * - 合計は必ず amount と一致する。
 *
 * @param orderedIds 優先順に並べた全プレイヤーID（勝者以外が含まれていてもよい）
 * @returns 優先順に並べた { playerId, amount }
 */
export function splitPot(
  amount: number,
  winnerIds: string[],
  orderedIds: string[],
): { playerId: string; amount: number }[] {
  const ranked = [...winnerIds].sort((a, b) => {
    const ia = orderedIds.indexOf(a);
    const ib = orderedIds.indexOf(b);
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
  });
  if (ranked.length === 0) return [];

  const base = Math.floor(amount / ranked.length);
  const remainder = amount - base * ranked.length;
  return ranked.map((playerId, i) => ({
    playerId,
    amount: base + (i < remainder ? 1 : 0),
  }));
}
