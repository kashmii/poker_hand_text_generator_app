import type {
  HandData,
  SessionConfig,
  Action,
  Card,
  Street,
  ShowdownEntry,
  OutputLanguage,
} from '../types/poker';

// ========== カード表示 ==========
const SUIT_SYMBOLS: Record<string, string> = {
  h: 'h', d: 'd', c: 'c', s: 's',
};

function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

function formatCards(cards: Card[]): string {
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
  return POSITION_LABELS_BY_COUNT[totalPlayers]?.[playerIdx] ?? `Seat${playerIdx + 1}`;
}

// ========== アクション文字列 ==========
function formatAction(
  action: Action,
  playerName: string,
  currency: string,
  _lang: OutputLanguage
): string {
  const c = currency;
  switch (action.type) {
    case 'fold':
      return `${playerName}: folds`;
    case 'check':
      return `${playerName}: checks`;
    case 'call':
      return `${playerName}: calls ${c}${action.amount ?? ''}`;
    case 'bet':
      return `${playerName}: bets ${c}${action.amount ?? ''}`;
    case 'raise':
      return `${playerName}: raises to ${c}${action.amount ?? ''}`;
    case 'allin':
      return `${playerName}: raises to ${c}${action.amount ?? ''} and is all-in`;
    default:
      return '';
  }
}

// ========== ストリートヘッダー ==========
function streetHeader(street: Street, board: Card[] | undefined): string {
  switch (street) {
    case 'preflop':
      return '*** HOLE CARDS ***';
    case 'flop':
      return `*** FLOP *** [${board ? formatCards(board) : ''}]`;
    case 'turn':
      return `*** TURN *** [${board ? formatCards(board) : ''}]`;
    case 'river':
      return `*** RIVER *** [${board ? formatCards(board) : ''}]`;
  }
}

// ========== メイン出力生成 ==========
export function generateHandText(
  hand: HandData,
  session: SessionConfig,
  lang: OutputLanguage = 'en'
): string {
  const { players, smallBlind, bigBlind, ante, currency, heroId } = session;
  const totalPlayers = players.length;
  const c = currency;

  const lines: string[] = [];

  // --- ヘッダー ---
  lines.push(`Hand #${hand.handNumber} - ${c}${smallBlind}/${c}${bigBlind} No Limit Hold'em`);

  // --- シート情報 ---
  lines.push(`Table '${c}${smallBlind}/${c}${bigBlind}' ${totalPlayers}-handed`);
  players.forEach((p, i) => {
    const posLabel = getPositionLabel(i, totalPlayers);
    const heroMark = p.id === heroId ? ' [hero]' : '';
    lines.push(`Seat ${i + 1}: ${p.name} (${c}${p.stack} in chips)${heroMark} [${posLabel}]`);
  });

  // --- ブラインド投稿 ---
  // BTN=index0, SB=index1, BB=index2 の想定
  const sbPlayer = players[1] ?? players[0];
  const bbPlayer = players[2] ?? players[1];
  if (ante > 0) {
    players.forEach((p) => lines.push(`${p.name}: posts the ante ${c}${ante}`));
  }
  lines.push(`${sbPlayer.name}: posts small blind ${c}${smallBlind}`);
  lines.push(`${bbPlayer.name}: posts big blind ${c}${bigBlind}`);

  // --- ホールカード ---
  lines.push('');
  lines.push(streetHeader('preflop', undefined));
  const hero = players.find((p) => p.id === heroId);
  if (hero?.holeCards) {
    lines.push(`Dealt to ${hero.name} [${formatCards(hero.holeCards)}]`);
  }
  hand.streets.preflop.actions.forEach((a) => {
    const p = players.find((pl) => pl.id === a.playerId);
    if (p) lines.push(formatAction(a, p.name, c, lang));
  });

  // --- フロップ ---
  if (hand.streets.flop) {
    lines.push('');
    lines.push(streetHeader('flop', hand.streets.flop.board));
    hand.streets.flop.actions.forEach((a) => {
      const p = players.find((pl) => pl.id === a.playerId);
      if (p) lines.push(formatAction(a, p.name, c, lang));
    });
  }

  // --- ターン ---
  if (hand.streets.turn) {
    const prevBoard = hand.streets.flop?.board ?? [];
    const turnBoard = [...prevBoard, ...(hand.streets.turn.board ?? [])];
    lines.push('');
    lines.push(streetHeader('turn', turnBoard));
    hand.streets.turn.actions.forEach((a) => {
      const p = players.find((pl) => pl.id === a.playerId);
      if (p) lines.push(formatAction(a, p.name, c, lang));
    });
  }

  // --- リバー ---
  if (hand.streets.river) {
    const prevBoard = [
      ...(hand.streets.flop?.board ?? []),
      ...(hand.streets.turn?.board ?? []),
      ...(hand.streets.river.board ?? []),
    ];
    lines.push('');
    lines.push(streetHeader('river', prevBoard));
    hand.streets.river.actions.forEach((a) => {
      const p = players.find((pl) => pl.id === a.playerId);
      if (p) lines.push(formatAction(a, p.name, c, lang));
    });
  }

  // --- ショーダウン ---
  if (hand.showdown && hand.showdown.length > 0) {
    lines.push('');
    lines.push('*** SHOW DOWN ***');
    hand.showdown.forEach((entry: ShowdownEntry) => {
      const p = players.find((pl) => pl.id === entry.playerId);
      if (p) {
        const desc = entry.handDescription ? ` (${entry.handDescription})` : '';
        lines.push(`${p.name}: shows [${formatCards(entry.cards)}]${desc}`);
      }
    });
  }

  // --- サマリー ---
  lines.push('');
  lines.push('*** SUMMARY ***');
  lines.push(`Total pot ${c}${hand.pot}`);

  // ボード全体
  const allBoard = [
    ...(hand.streets.flop?.board ?? []),
    ...(hand.streets.turn?.board ?? []),
    ...(hand.streets.river?.board ?? []),
  ];
  if (allBoard.length > 0) {
    lines.push(`Board [${formatCards(allBoard)}]`);
  }

  hand.winners.forEach((w) => {
    const p = players.find((pl) => pl.id === w.playerId);
    if (p) {
      const desc = w.description ? ` with ${w.description}` : '';
      lines.push(`${p.name} collected ${c}${w.amount} from pot${desc}`);
    }
  });

  if (hand.notes) {
    lines.push('');
    lines.push(`Notes: ${hand.notes}`);
  }

  lines.push('');

  return lines.join('\n');
}
