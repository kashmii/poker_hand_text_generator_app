import type {
  HandData,
  SessionConfig,
  Action,
  Card,
  ShowdownEntry,
} from '../types/poker';

// ========== カード表示 ==========
const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit] ?? card.suit}`;
}

function formatCardsSpaced(cards: Card[]): string {
  return cards.map(formatCard).join(' ');
}

// ========== ポジション名 ==========
const POSITION_LABELS_BY_COUNT: Record<number, string[]> = {
  2: ['SB/BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO'],
};

function getPositionLabel(playerIdx: number, totalPlayers: number): string {
  return (
    POSITION_LABELS_BY_COUNT[totalPlayers]?.[playerIdx] ??
    `Seat${playerIdx + 1}`
  );
}

// ========== アクション文字列 ==========
function formatAction(
  action: Action,
  posLabel: string,
  currency: string,
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
    case 'allin':
      return `${posLabel} raises ${c}${(action.amount ?? 0).toLocaleString()} and is all-in`;
    case 'straddle':
      return `${posLabel} straddles ${c}${(action.amount ?? 0).toLocaleString()}`;
    default:
      return '';
  }
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
  const sbPlayer = players[1] ?? players[0];
  const bbPlayer = players[2] ?? players[1];
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
  hand.streets.preflop.actions.forEach((a) => {
    const line = formatAction(a, posLabelWithHero(a.playerId), c);
    if (line) lines.push(line);
  });

  // --- フロップ ---
  if (hand.streets.flop) {
    const preflopPot = computeStreetPot(hand, 'preflop', smallBlind, bigBlind, ante);
    const flopFolded = foldedBeforeStreet('flop');
    const flopPlayers = totalPlayers - flopFolded.size;
    const boardStr = hand.streets.flop.board
      ? `[${formatCardsSpaced(hand.streets.flop.board)}]`
      : '';
    lines.push('');
    lines.push(`Flop (${flopPlayers} players, Pot size: ${preflopPot.toLocaleString()}) ${boardStr}`);
    hand.streets.flop.actions.forEach((a) => {
      const line = formatAction(a, posLabelWithHero(a.playerId), c);
      if (line) lines.push(line);
    });
  }

  // --- ターン ---
  if (hand.streets.turn) {
    const turnPot = computeStreetPot(hand, 'turn', smallBlind, bigBlind, ante);
    const turnFolded = foldedBeforeStreet('turn');
    const turnPlayers = totalPlayers - turnFolded.size;
    const boardStr = hand.streets.turn.board
      ? `[${formatCardsSpaced(hand.streets.turn.board)}]`
      : '';
    lines.push('');
    lines.push(`Turn (${turnPlayers} players, Pot size: ${turnPot.toLocaleString()}) ${boardStr}`);
    hand.streets.turn.actions.forEach((a) => {
      const line = formatAction(a, posLabelWithHero(a.playerId), c);
      if (line) lines.push(line);
    });
  }

  // --- リバー ---
  if (hand.streets.river) {
    const riverPot = computeStreetPot(hand, 'river', smallBlind, bigBlind, ante);
    const riverFolded = foldedBeforeStreet('river');
    const riverPlayers = totalPlayers - riverFolded.size;
    const boardStr = hand.streets.river.board
      ? `[${formatCardsSpaced(hand.streets.river.board)}]`
      : '';
    lines.push('');
    lines.push(`River (${riverPlayers} players, Pot size: ${riverPot.toLocaleString()}) ${boardStr}`);
    hand.streets.river.actions.forEach((a) => {
      const line = formatAction(a, posLabelWithHero(a.playerId), c);
      if (line) lines.push(line);
    });
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
  // ウィナー
  hand.winners.forEach((w) => {
    const posLabel = posLabelMap[w.playerId] ?? '';
    lines.push(`${posLabel} wins ${c}${w.amount.toLocaleString()}`);
  });

  if (hand.notes) {
    lines.push('');
    lines.push(`Notes: ${hand.notes}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * 指定ストリート開始時点のポットサイズを計算する。
 * SB/BB/anteの強制投資 + 各ストリートのベット合計を積算。
 */
function computeStreetPot(
  hand: HandData,
  upToStreet: 'preflop' | 'flop' | 'turn' | 'river',
  smallBlind: number,
  bigBlind: number,
  ante: number,
): number {
  let pot = smallBlind + bigBlind + ante;

  // straddleはpreflopのアクションに含まれているので自動的に加算される
  const streetOrder = ['preflop', 'flop', 'turn', 'river'] as const;
  const upToIdx = streetOrder.indexOf(upToStreet);

  // upToStreet 自身を含むストリートまでの投資を集計
  const contributions: Record<string, number> = {};

  for (let si = 0; si <= upToIdx; si++) {
    const street = streetOrder[si];
    const actions =
      street === 'preflop'
        ? hand.streets.preflop.actions
        : (hand.streets[street]?.actions ?? []);

    // ストリートごとにcontributionsをリセット（ポストフロップ）
    if (si > 0) {
      Object.keys(contributions).forEach((k) => {
        contributions[k] = 0;
      });
    }

    for (const a of actions) {
      if (a.type === 'fold' || a.type === 'check') continue;
      if (a.type === 'call') {
        const added = a.amount ?? 0;
        pot += added;
      } else if (
        a.type === 'bet' ||
        a.type === 'raise' ||
        a.type === 'allin' ||
        a.type === 'straddle'
      ) {
        const total = a.amount ?? 0;
        const prev = contributions[a.playerId] ?? 0;
        const added = total - prev;
        if (added > 0) pot += added;
        contributions[a.playerId] = total;
      }
    }
  }

  return pot;
}
