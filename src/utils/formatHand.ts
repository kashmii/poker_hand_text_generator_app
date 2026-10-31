import type {
  HandData,
  SessionConfig,
  Action,
  Card,
  BoardStreet,
  Player,
  ShowdownEntry,
} from '../types/poker';
import { cardLabel } from './card';
import { positionLabels } from './positions';
import { BOARD_STREETS } from './streets';

// ========== 表示用ヘルパー ==========
function formatCardsSpaced(cards: Card[]): string {
  return cards.map(cardLabel).join(' ');
}

function formatMoney(amount: number, currency: string): string {
  return `${currency}${amount.toLocaleString()}`;
}

function getPositionLabel(playerIdx: number, totalPlayers: number): string {
  return (
    positionLabels(totalPlayers)[playerIdx] ??
    `Seat${playerIdx + 1}`
  );
}

const STREET_HEADERS: Record<BoardStreet, string> = {
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

// ========== アクション文字列 ==========
// currentBet: このアクション直前のストリート内ベット水準（コール必要額）。
// オールインが bet / call / raise のどれに当たるかの判定に使う。
function formatAction(
  action: Action,
  posLabel: string,
  currency: string,
  currentBet: number,
): string {
  const amt = action.amount ?? 0;
  const money = formatMoney(amt, currency);
  switch (action.type) {
    case 'fold':
      return `${posLabel} folds`;
    case 'check':
      return `${posLabel} checks`;
    case 'call':
      return `${posLabel} calls ${money}`;
    case 'bet':
      return `${posLabel} bets ${money}`;
    case 'raise':
      return `${posLabel} raises ${money}`;
    case 'allin':
      // ストリート内に未ベット(currentBet<=0)で先頭オールイン → bet
      // 既存ベットを超える → raise、超えない（＝ショート額でのコール）→ call
      if (amt > currentBet) {
        return currentBet <= 0
          ? `${posLabel} bets ${money} and is all-in`
          : `${posLabel} raises ${money} and is all-in`;
      }
      return `${posLabel} calls ${money} and is all-in`;
    case 'straddle':
      return `${posLabel} straddles ${money}`;
    default:
      return '';
  }
}

// ストリート内のアクション列を、ベット水準を追跡しながら整形する。
function formatStreetActions(
  actions: Action[],
  startBet: number,
  posLabelWithHero: (id: string) => string,
  currency: string,
): string[] {
  const out: string[] = [];
  let bet = startBet;
  actions.forEach((a) => {
    const line = formatAction(a, posLabelWithHero(a.playerId), currency, bet);
    if (line) out.push(line);
    // ベット水準の更新
    if (a.type === 'bet' || a.type === 'raise' || a.type === 'straddle') {
      bet = a.amount ?? bet;
    } else if (a.type === 'allin') {
      if ((a.amount ?? 0) > bet) bet = a.amount ?? bet;
    }
  });
  return out;
}

/**
 * SB・BB を払うプレイヤー。players は [BTN, SB, BB, ...] の順。
 * 2人（ヘッズアップ）は [SB/BTN, BB] なので BTN が SB を払う（useHandFlow と同じ扱い）。
 */
function blindPlayers(players: Player[]): { sbPlayer: Player; bbPlayer: Player } {
  if (players.length === 2) return { sbPlayer: players[0], bbPlayer: players[1] };
  return { sbPlayer: players[1] ?? players[0], bbPlayer: players[2] ?? players[1] };
}

/**
 * 1ストリートのアクションでポットに入った額。
 * initial はストリート開始時点の各プレイヤーの投入額（プリフロップは SB/BB のポスト分）。
 * アクションの amount は call だけが「追加額」、bet/raise/allin/straddle は「そのストリートでの合計額」。
 */
function streetPotAdded(actions: Action[], initial: Record<string, number>): number {
  const contributions = { ...initial };
  let added = 0;
  for (const a of actions) {
    if (a.type === 'fold' || a.type === 'check') continue;
    const prev = contributions[a.playerId] ?? 0;
    const total = a.type === 'call' ? prev + (a.amount ?? 0) : (a.amount ?? 0);
    if (total > prev) {
      added += total - prev;
      contributions[a.playerId] = total;
    }
  }
  return added;
}

// ========== メイン出力生成 ==========
export function generateHandText(
  hand: HandData,
  session: SessionConfig,
): string {
  const { players, smallBlind, bigBlind, ante, currency, heroId } = session;
  const totalPlayers = players.length;
  const c = currency;

  // playerIdからポジションラベルへのマップ
  const posLabelMap: Record<string, string> = {};
  players.forEach((p, i) => {
    posLabelMap[p.id] = getPositionLabel(i, totalPlayers);
  });

  // heroのポジションラベル（アクション行で "(hero)" を付加するために使用）
  const heroPosLabel = heroId ? (posLabelMap[heroId] ?? '') : '';

  /** ポジションラベルにhero識別子を付加するヘルパー */
  const posLabelWithHero = (playerId: string): string => {
    const label = posLabelMap[playerId] ?? '';
    return playerId === heroId ? `${label} (hero)` : label;
  };

  // ストリートを進めながら、次のストリート開始時点のポットと fold 済みプレイヤーを積み上げる
  // （straddle は preflop のアクションに含まれているので自動的に加算される）
  let pot = smallBlind + bigBlind + ante;
  const folded = new Set<string>();
  const settleStreet = (actions: Action[], initial: Record<string, number>) => {
    pot += streetPotAdded(actions, initial);
    actions.forEach((a) => { if (a.type === 'fold') folded.add(a.playerId); });
  };

  const lines: string[] = [];

  // --- ヘッダー ---
  lines.push(session.date);
  if (hand.title) {
    lines.push(hand.title);
  }
  lines.push('');
  lines.push(`${c}${smallBlind}/${bigBlind} - ${totalPlayers} players`);
  lines.push('');

  // --- Setup: heroのホールカードとポジションを表示 ---
  const hero = players.find((p) => p.id === heroId);
  const heroHoleCards = hero?.holeCards ?? hand.heroHoleCards;
  if (heroPosLabel) {
    lines.push('Setup');
    if (heroHoleCards) {
      lines.push(`${heroPosLabel} (hero) [${formatCardsSpaced(heroHoleCards)}]`);
    } else {
      lines.push(`${heroPosLabel} (hero)`);
    }
    lines.push('');
  }

  // --- プリフロップ ---
  // プリフロップ開始時は全員参加
  lines.push(`Preflop (${totalPlayers} players, Pot size: 0)`);
  // SB/BBのポスト
  const { sbPlayer, bbPlayer } = blindPlayers(players);
  // BBアンティはBBのみが払う（Big Blind Ante）
  if (ante > 0) {
    lines.push(`${posLabelWithHero(bbPlayer.id)} posts big blind ante ${formatMoney(ante, c)}`);
  }
  lines.push(`${posLabelWithHero(sbPlayer.id)} posts small blind ${formatMoney(smallBlind, c)}`);
  lines.push(`${posLabelWithHero(bbPlayer.id)} posts big blind ${formatMoney(bigBlind, c)}`);
  // プリフロップはBBがコール必要額の起点
  const preflopActions = hand.streets.preflop.actions;
  lines.push(...formatStreetActions(preflopActions, bigBlind, posLabelWithHero, c));
  // ポスト分を初期投入額にする（アンティは別枠。BB の 3bet などで二重に数えないため）
  settleStreet(preflopActions, { [sbPlayer.id]: smallBlind, [bbPlayer.id]: bigBlind });

  // --- フロップ・ターン・リバー ---
  for (const street of BOARD_STREETS) {
    const data = hand.streets[street];
    if (!data) continue;
    const boardStr = data.board ? `[${formatCardsSpaced(data.board)}]` : '';
    const playersInHand = totalPlayers - folded.size;
    lines.push('');
    lines.push(`${STREET_HEADERS[street]} (${playersInHand} players, Pot size: ${pot.toLocaleString()}) ${boardStr}`);
    lines.push(...formatStreetActions(data.actions, 0, posLabelWithHero, c));
    settleStreet(data.actions, {});
  }

  // --- サマリー ---
  lines.push('');
  lines.push(`Summary (Pot size: ${hand.pot.toLocaleString()})`);
  // ショーダウンのshows行
  if (hand.showdown && hand.showdown.length > 0) {
    hand.showdown.forEach((entry: ShowdownEntry) => {
      const posLabel = posLabelMap[entry.playerId] ?? '';
      lines.push(`${posLabel} shows [${formatCardsSpaced(entry.cards)}]`);
    });
  }
  // ウィナー（サイドポットがある場合は "wins main pot / side pot" と明記）。
  // 同じポットに複数の勝者がいればチョップ。端数で額が揃わないことがあるので1人1行で実額を出す。
  const hasSidePot = hand.winners.some((w) => w.label && w.label !== 'main pot');
  const winnersPerPot: Record<string, number> = {};
  hand.winners.forEach((w) => {
    if (w.label) winnersPerPot[w.label] = (winnersPerPot[w.label] ?? 0) + 1;
  });
  hand.winners.forEach((w) => {
    const posLabel = posLabelMap[w.playerId] ?? '';
    const amount = formatMoney(w.amount, c);
    if (w.label && winnersPerPot[w.label] > 1) {
      const potPart = hasSidePot ? w.label : 'the pot';
      lines.push(`${posLabel} splits ${potPart} ${amount}`);
      return;
    }
    const potPart = w.label ? `${w.label} ` : '';
    lines.push(`${posLabel} wins ${potPart}${amount}`);
  });

  if (hand.notes) {
    lines.push('');
    lines.push(`Notes: ${hand.notes}`);
  }

  lines.push('');

  return lines.join('\n');
}
