import type { HandData, StreetData } from '../types/poker';

const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'] as const;

/**
 * computeHeroResult はヒーローの収支（勝ち＝正 / 負け＝負）を計算する。
 *   収支 = 獲得額（winners のうちヒーロー分の合計） − 総拠出額
 *
 * 総拠出額は useHandFlow のベット集計規則をそのまま再現して求める:
 *   - bet/raise/allin/straddle の amount はそのストリート内の累計額
 *   - call の amount は増分
 *   - プリフロップは SB/BB を initContributions と同じ規則で seed（HU 特例あり）
 *   - アンティは「BB が全額払う」ルール（BB の拠出に加算）
 *   - 各ストリート終了時、コールされなかった最大拠出はポットに入らず拠出者へ戻す
 *     （ショーダウン到達: 生存者の最大−2番目 / フォールド勝ち: 勝者−他全員の最大）
 *
 * session か heroId、players が無い古いハンドでは計算できないので null を返す。
 */
export function computeHeroResult(hand: HandData): number | null {
  const session = hand.session;
  if (!session || !session.heroId || !session.players || session.players.length < 2) {
    return null;
  }

  const heroId = session.heroId;
  const ids = session.players.map((p) => p.id);
  const { smallBlind, bigBlind, ante } = session;

  // プリフロップのブラインド seed（initContributions と同じ規則）。
  // アンティは contributions には含めない（アプリと同じく「ポットに入る死に金」扱い）。
  // そのためアンコール返却の判定でも戻らない。hero が BB のときだけ最後に拠出へ加算する。
  const seed: Record<string, number> = {};
  if (ids.length === 2) {
    seed[ids[0]] = smallBlind; // HU: BTN=SB
    seed[ids[1]] = bigBlind;
  } else {
    seed[ids[1]] = smallBlind;
    seed[ids[2]] = bigBlind;
  }
  const bbId = ids.length === 2 ? ids[1] : ids[2];

  const folded = new Set<string>();
  const total: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));

  for (const street of STREET_ORDER) {
    const sd: StreetData | undefined =
      street === 'preflop' ? hand.streets.preflop : hand.streets[street];
    if (!sd) continue;

    // そのストリート内の累計拠出
    const running: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    if (street === 'preflop') {
      for (const id of Object.keys(seed)) running[id] = seed[id];
    }

    for (const a of sd.actions) {
      if (a.type === 'fold') {
        folded.add(a.playerId);
        continue;
      }
      if (a.type === 'check') continue;
      if (a.type === 'call') {
        running[a.playerId] = (running[a.playerId] ?? 0) + (a.amount ?? 0);
      } else {
        // bet / raise / allin / straddle: amount はストリート内の累計
        running[a.playerId] = a.amount ?? running[a.playerId] ?? 0;
      }
    }

    // アンコール分の返却
    const activeIds = ids.filter((id) => !folded.has(id));
    if (activeIds.length > 1) {
      // ショーダウンに向かうストリート: 生存者の最大拠出 − 2番目で返却
      const sorted = activeIds.map((id) => running[id] ?? 0).sort((x, y) => y - x);
      const uncalled = (sorted[0] ?? 0) - (sorted[1] ?? 0);
      if (uncalled > 0) {
        const topId = activeIds.find((id) => (running[id] ?? 0) === sorted[0]);
        if (topId) running[topId] = sorted[1] ?? 0;
      }
    } else if (activeIds.length === 1) {
      // フォールド勝ち: 勝者の拠出 − 他プレイヤー（fold含む）の最大拠出を返却
      const winnerId = activeIds[0];
      const winnerContrib = running[winnerId] ?? 0;
      const maxOther = ids.reduce(
        (m, id) => (id !== winnerId ? Math.max(m, running[id] ?? 0) : m),
        0,
      );
      const uncalled = Math.max(0, winnerContrib - maxOther);
      running[winnerId] = winnerContrib - uncalled;
    }

    for (const id of ids) total[id] += running[id] ?? 0;
  }

  const winnings = hand.winners
    .filter((w) => w.playerId === heroId)
    .reduce((s, w) => s + w.amount, 0);

  // アンティは BB が全額払う。hero が BB なら拠出に加算する（獲得額の pot 側には既に含まれている）。
  const anteOwed = ante > 0 && heroId === bbId ? ante : 0;

  return winnings - (total[heroId] ?? 0) - anteOwed;
}
