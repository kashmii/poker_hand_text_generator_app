/**
 * メインポット / サイドポットの計算。
 *
 * 各プレイヤーの「ハンド通算拠出額」と「フォールド集合」から、
 * メインポット・サイドポットの一覧と、アンコール分（最上位が単独拠出のとき返却）を求める。
 *
 * 原則:
 * - ある層（バンド）がポットになるのは、その層に 2 人以上が拠出しているとき。
 * - 最上位の層に拠出者が 1 人しかいなければ、その差額はコールされていない（アンコール）ため
 *   そのプレイヤーへ返却し、ポットにはしない。
 * - フォールドしたプレイヤーの拠出は金額には算入されるが（デッドマネー）、勝者候補からは外す。
 * - 勝者候補（eligible）が同一の連続した層はひとつのポットにまとめる。
 * - BB アンティはあらかじめ BB の拠出へ織り込まれている前提（このモジュールはアンティを特別扱いしない）。
 */

export interface Pot {
  /** このポットの金額 */
  amount: number;
  /** このポットを取り得るプレイヤー（フォールドしていない拠出者） */
  eligiblePlayerIds: string[];
  /** 'main pot' | 'side pot' | 'side pot 2' ... */
  label: string;
}

export interface SidePotResult {
  pots: Pot[];
  /** アンコールで返却される額（プレイヤーID → 返却額）。無ければ空。 */
  refunds: Record<string, number>;
}

/** 勝者確定時の1エントリ（ポット毎） */
export interface WinnerEntry {
  playerId: string;
  amount: number;
  label?: string; // サイドポットがある場合のみ 'main pot' など
}

function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = [...b].sort();
  return [...a].sort().every((x, i) => x === sb[i]);
}

function potLabel(index: number): string {
  if (index === 0) return 'main pot';
  if (index === 1) return 'side pot';
  return `side pot ${index}`;
}

/**
 * @param totalContributions 各プレイヤーのハンド通算拠出額（アンティ織り込み済み）
 * @param foldedIds フォールドしたプレイヤーID
 * @param playerIds 対象プレイヤーID（順序は結果の eligible 並びに使う）
 */
export function computeSidePots(
  totalContributions: Record<string, number>,
  foldedIds: Set<string>,
  playerIds: string[],
): SidePotResult {
  const refunds: Record<string, number> = {};

  // 正の拠出のみを対象に実効拠出額を作る
  const effective: Record<string, number> = {};
  for (const id of playerIds) {
    const v = totalContributions[id] ?? 0;
    if (v > 0) effective[id] = v;
  }

  const contributors = playerIds.filter((id) => (effective[id] ?? 0) > 0);
  if (contributors.length === 0) {
    return { pots: [], refunds };
  }

  // --- 最上位が単独拠出なら、2 番目の水準まで下げて差額を返却（アンコール） ---
  const amountsDesc = contributors.map((id) => effective[id]).sort((a, b) => b - a);
  const top = amountsDesc[0];
  const second = amountsDesc[1] ?? 0;
  const topCount = amountsDesc.filter((a) => a === top).length;
  if (topCount === 1 && top > second) {
    const topId = contributors.find((id) => effective[id] === top)!;
    refunds[topId] = top - second;
    effective[topId] = second;
  }

  // --- 層（バンド）に分解してポットを作る ---
  const levels = Array.from(new Set(contributors.map((id) => effective[id])))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const rawPots: Omit<Pot, 'label'>[] = [];
  let prev = 0;
  for (const level of levels) {
    const thickness = level - prev;
    const atOrAbove = contributors.filter((id) => effective[id] >= level);
    if (thickness > 0 && atOrAbove.length > 0) {
      const eligible = atOrAbove.filter((id) => !foldedIds.has(id));
      rawPots.push({
        amount: thickness * atOrAbove.length,
        eligiblePlayerIds: eligible,
      });
    }
    prev = level;
  }

  // --- eligible が同一の連続ポットをマージ ---
  const merged: Omit<Pot, 'label'>[] = [];
  for (const p of rawPots) {
    const last = merged[merged.length - 1];
    if (last && sameMembers(last.eligiblePlayerIds, p.eligiblePlayerIds)) {
      last.amount += p.amount;
    } else {
      merged.push({ ...p });
    }
  }

  const pots: Pot[] = merged.map((p, i) => ({ ...p, label: potLabel(i) }));
  return { pots, refunds };
}
