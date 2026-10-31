import type {
  HandData,
  SessionConfig,
  Action,
  Card,
  Player,
  ShowdownEntry,
} from '../types/poker';
import { cardLabel } from './card';
import { positionLabels } from './positions';

// ========== カード表示 ==========
function formatCardsSpaced(cards: Card[]): string {
  return cards.map(cardLabel).join(' ');
}

// ========== ポジション名 ==========
function getPositionLabel(playerIdx: number, totalPlayers: number): string {
  return (
    positionLabels(totalPlayers)[playerIdx] ??
    `Seat${playerIdx + 1}`
  );
}

// ========== アクション文字列 ==========
// currentBet: このアクション直前のストリート内ベット水準（コール必要額）。
// オールインが bet / call / raise のどれに当たるかの判定に使う。
function formatAction(
  action: Action,
  posLabel: string,
  currency: string,
  currentBet: number,
): string {
  const c = currency;
  switch (action.type) {
    case 'fold':
      return `${posLabel} folds`;
    case 'check':
      return `${posLabel} checks`;
    case 'call':
      return `${posLabel} calls ${c}${(action.amount ?? 0).toLocaleString()}`;
    case 'bet':
      return `${posLabel} bets ${c}${(action.amount ?? 0).toLocaleString()}`;
    case 'raise':
      return `${posLabel} raises ${c}${(action.amount ?? 0).toLocaleString()}`;
    case 'allin': {
      const amt = action.amount ?? 0;
      const amtStr = `${c}${amt.toLocaleString()}`;
      // ストリート内に未ベット(currentBet<=0)で先頭オールイン → bet
      // 既存ベットを超える → raise、超えない（＝ショート額でのコール）→ call
      if (amt > currentBet) {
        return currentBet <= 0
          ? `${posLabel} bets ${amtStr} and is all-in`
          : `${posLabel} raises ${amtStr} and is all-in`;
      }
      return `${posLabel} calls ${amtStr} and is all-in`;
    }
    case 'straddle':
      return `${posLabel} straddles ${c}${(action.amount ?? 0).toLocaleString()}`;
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

  /** ストリート開始時点のfold済みプレイヤーIDセットを計算する */
  const foldedBeforeStreet = (upTo: 'preflop' | 'flop' | 'turn' | 'river'): Set<string> => {
    const folded = new Set<string>();
    const order = ['preflop', 'flop', 'turn', 'river'] as const;
    const upToIdx = order.indexOf(upTo);
    for (let si = 0; si < upToIdx; si++) {
      const s = order[si];
      const actions = s === 'preflop'
        ? hand.streets.preflop.actions
        : (hand.streets[s]?.actions ?? []);
      actions.forEach((a) => { if (a.type === 'fold') folded.add(a.playerId); });
    }
    return folded;
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
    lines.push(
      `${posLabelWithHero(bbPlayer.id)} posts big blind ante ${c}${ante.toLocaleString()}`,
    );
  }
  lines.push(
    `${posLabelWithHero(sbPlayer.id)} posts small blind ${c}${smallBlind.toLocaleString()}`,
  );
  lines.push(
    `${posLabelWithHero(bbPlayer.id)} posts big blind ${c}${bigBlind.toLocaleString()}`,
  );
  // プリフロップはBBがコール必要額の起点
  lines.push(...formatStreetActions(hand.streets.preflop.actions, bigBlind, posLabelWithHero, c));

  // --- フロップ ---
  if (hand.streets.flop) {
    const preflopPot = computeStreetPot(hand, 'preflop', session);
    const flopFolded = foldedBeforeStreet('flop');
    const flopPlayers = totalPlayers - flopFolded.size;
    const boardStr = hand.streets.flop.board
      ? `[${formatCardsSpaced(hand.streets.flop.board)}]`
      : '';
    lines.push('');
    lines.push(`Flop (${flopPlayers} players, Pot size: ${preflopPot.toLocaleString()}) ${boardStr}`);
    lines.push(...formatStreetActions(hand.streets.flop.actions, 0, posLabelWithHero, c));
  }

  // --- ターン ---
  if (hand.streets.turn) {
    const turnPot = computeStreetPot(hand, 'flop', session);
    const turnFolded = foldedBeforeStreet('turn');
    const turnPlayers = totalPlayers - turnFolded.size;
    const boardStr = hand.streets.turn.board
      ? `[${formatCardsSpaced(hand.streets.turn.board)}]`
      : '';
    lines.push('');
    lines.push(`Turn (${turnPlayers} players, Pot size: ${turnPot.toLocaleString()}) ${boardStr}`);
    lines.push(...formatStreetActions(hand.streets.turn.actions, 0, posLabelWithHero, c));
  }

  // --- リバー ---
  if (hand.streets.river) {
    const riverPot = computeStreetPot(hand, 'turn', session);
    const riverFolded = foldedBeforeStreet('river');
    const riverPlayers = totalPlayers - riverFolded.size;
    const boardStr = hand.streets.river.board
      ? `[${formatCardsSpaced(hand.streets.river.board)}]`
      : '';
    lines.push('');
    lines.push(`River (${riverPlayers} players, Pot size: ${riverPot.toLocaleString()}) ${boardStr}`);
    lines.push(...formatStreetActions(hand.streets.river.actions, 0, posLabelWithHero, c));
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
    const amount = `${c}${w.amount.toLocaleString()}`;
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

/**
 * SB・BB を払うプレイヤー。players は [BTN, SB, BB, ...] の順。
 * 2人（ヘッズアップ）は [SB/BTN, BB] なので BTN が SB を払う（useHandFlow と同じ扱い）。
 */
function blindPlayers(players: Player[]): { sbPlayer: Player; bbPlayer: Player } {
  if (players.length === 2) return { sbPlayer: players[0], bbPlayer: players[1] };
  return { sbPlayer: players[1] ?? players[0], bbPlayer: players[2] ?? players[1] };
}

/**
 * 指定ストリート終了時点（＝次ストリート開始時点）のポットサイズを計算する。
 * SB/BB/anteの強制投資 + 各ストリートの投入額を積算。
 * アクションの amount は call だけが「追加額」、bet/raise/allin/straddle は「そのストリートでの合計額」。
 */
function computeStreetPot(
  hand: HandData,
  upToStreet: 'preflop' | 'flop' | 'turn' | 'river',
  session: SessionConfig,
): number {
  const { players, smallBlind, bigBlind, ante } = session;
  let pot = smallBlind + bigBlind + ante;

  // straddleはpreflopのアクションに含まれているので自動的に加算される
  const streetOrder = ['preflop', 'flop', 'turn', 'river'] as const;
  const upToIdx = streetOrder.indexOf(upToStreet);

  for (let si = 0; si <= upToIdx; si++) {
    const street = streetOrder[si];
    const actions =
      street === 'preflop'
        ? hand.streets.preflop.actions
        : (hand.streets[street]?.actions ?? []);

    // ストリート内の各プレイヤーの投入額。プリフロップは SB/BB のポスト分から始まる
    // （アンティは別枠なので含めない。BB の 3bet などで二重に数えないため）
    const contributions: Record<string, number> = {};
    if (street === 'preflop' && players.length >= 2) {
      const { sbPlayer, bbPlayer } = blindPlayers(players);
      contributions[sbPlayer.id] = smallBlind;
      contributions[bbPlayer.id] = bigBlind;
    }

    for (const a of actions) {
      if (a.type === 'fold' || a.type === 'check') continue;
      const prev = contributions[a.playerId] ?? 0;
      const total = a.type === 'call' ? prev + (a.amount ?? 0) : (a.amount ?? 0);
      const added = total - prev;
      if (added > 0) {
        pot += added;
        contributions[a.playerId] = total;
      }
    }
  }

  return pot;
}
