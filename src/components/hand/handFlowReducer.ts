import type { SessionConfig, ActionType, Card, Player } from '../../types/poker';
import type { HandFlowState, RecordedAction, ShowdownRecord, Street } from './types';
import { computeSidePots } from '../../utils/sidePots';
import type { Pot, WinnerEntry } from '../../utils/sidePots';
import { splitPot } from '../../utils/splitPot';
import { evaluateShowdown } from '../../utils/evaluateShowdown';
import type { ShowdownEvaluation } from '../../utils/evaluateShowdown';

/**
 * ハンド1件の進行ロジック（純粋関数）。useHandFlow はここの reducer に処理を任せる。
 * state は React に依存しないので、フックを介さずにユニットテストできる。
 */

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

type BoardStreet = 'flop' | 'turn' | 'river';

/** reducer が参照するセッション由来の値 */
export interface HandFlowContext {
  players: Player[];
  playerIds: string[];
  /** true なら、判定できるポットは勝者選択を出さずに確定する */
  autoResolve: boolean;
}

/** 進行状態と「1つ戻る」用の履歴（直前の state が末尾） */
export interface HandFlow {
  state: HandFlowState;
  history: HandFlowState[];
}

/** ユーザー操作。reducer はこれを受けて次の HandFlow を返す */
export type HandFlowEvent =
  | { type: 'start-action' }
  | { type: 'back-to-hole-cards' }
  | { type: 'set-hole-cards'; cards: [Card, Card] | null }
  | { type: 'commit-action'; actionType: ActionType; amount?: number }
  | { type: 'confirm-board' }
  | { type: 'update-board'; street: BoardStreet; idx: number; card: Card | null }
  | { type: 'commit-showdown'; record: ShowdownRecord }
  | { type: 'confirm-pot-winner'; winnerIds: string[] }
  | { type: 'go-back' };

/** 「1つ戻る」の対象になる操作。手札・ボードのメモ入力やフェーズ移動は履歴に積まない */
const HISTORY_EVENTS = new Set<HandFlowEvent['type']>([
  'commit-action',
  'confirm-board',
  'commit-showdown',
  'confirm-pot-winner',
]);

// ============================================================
// アクション順
// ============================================================

/**
 * プリフロップのアクション順を返す。
 * 標準: UTG(index=3)から始まり、SB→BB で終わる。
 * ただし players 配列は [BTN=0, SB=1, BB=2, UTG=3, ...] の順番。
 * 2人の場合は BTN=SB/BTN, BB の順。
 */
export function buildPreflopOrder(playerIds: string[], straddle: number): string[] {
  const count = playerIds.length;
  if (count === 2) {
    // HU: BTN(SB)が先、BBが後
    return [playerIds[0], playerIds[1]];
  }
  if (straddle > 0 && count > 3) {
    // ストラドルあり（4人以上）:
    // UTG(index=3)がストラドル投資者 → HJ(index=4)から始まり、UTGが最後
    // 例(6人): [HJ, CO, BTN, SB, BB, UTG]
    const order: string[] = [];
    for (let i = 4; i < count; i++) order.push(playerIds[i]); // HJ〜CO
    order.push(playerIds[0]); // BTN
    order.push(playerIds[1]); // SB
    order.push(playerIds[2]); // BB
    order.push(playerIds[3]); // UTG（ストラドル投資者、最後にアクション）
    return order;
  }
  // 3人以上ストラドルなし: UTG(index=3)から始まって一周し、SB(1)、BB(2) で終わる
  const order: string[] = [];
  for (let i = 3; i < count; i++) order.push(playerIds[i]);
  order.push(playerIds[0]); // BTN
  order.push(playerIds[1]); // SB
  order.push(playerIds[2]); // BB
  return order;
}

/**
 * フロップ以降のアクション順: SB(1)から時計回り。foldedを除く。
 * allInIds を渡した場合はオールイン済みも除外する（アクション不要なため）。
 */
export function buildPostflopOrder(
  playerIds: string[],
  foldedIds: Set<string>,
  allInIds?: Set<string>,
): string[] {
  const count = playerIds.length;
  const order: string[] = [];
  // SB(index=1)から始めてBTN(0)で終わる
  for (let i = 1; i < count; i++) {
    if (!foldedIds.has(playerIds[i]) && !(allInIds?.has(playerIds[i]))) {
      order.push(playerIds[i]);
    }
  }
  if (!foldedIds.has(playerIds[0]) && !(allInIds?.has(playerIds[0]))) {
    order.push(playerIds[0]);
  }
  return order;
}

/**
 * そのストリートのアクション順（fold済み・allin済みを除いたアクティブプレイヤーのみ）を返す。
 * currentActorIdx はこのリスト上のインデックスとして管理する。
 */
export function activeOrder(s: HandFlowState, playerIds: string[]): string[] {
  if (s.currentStreet === 'preflop') {
    return s.preflopOrder.filter((id) => !s.foldedIds.has(id) && !s.allInIds.has(id));
  }
  return buildPostflopOrder(playerIds, s.foldedIds, s.allInIds);
}

/** 現在のアクターID */
export function currentActorId(s: HandFlowState, playerIds: string[]): string | null {
  return activeOrder(s, playerIds)[s.currentActorIdx] ?? null;
}

/** コール額 */
export function callAmount(s: HandFlowState, playerId: string): number {
  return Math.max(0, s.currentBet - (s.contributions[playerId] ?? 0));
}

/**
 * ショーダウン順を構築する。
 * ラストアグレッサー（最後にbet/raise/allinしたプレイヤー）から始まり、
 * そのプレイヤーから時計回り（ポストフロップ順）でアクティブプレイヤーを並べる。
 * ラストアグレッサーがいない場合はポストフロップ順そのまま（SBから）。
 */
function buildShowdownQueue(
  streets: Record<Street, RecordedAction[]>,
  playerIds: string[],
  foldedIds: Set<string>,
): string[] {
  // showdown対象はfoldしていない全員（allin含む）
  const active = buildPostflopOrder(playerIds, foldedIds);
  if (active.length <= 1) return active;

  // 最後にアクションがあったストリートのみでラストアグレッサーを探す。
  // リバーで誰もベットしなかった場合はそのストリートのアグレッサーは存在しないため
  // OOP順（SBから）になる。
  let lastAggressor: string | null = null;
  const reversedStreets = [...STREETS].reverse(); // river → turn → flop → preflop
  for (const street of reversedStreets) {
    if (streets[street].length === 0) continue; // このストリートにアクションなし（スキップ）
    for (const action of streets[street]) {
      if (
        (action.type === 'bet' || action.type === 'raise' || action.type === 'allin') &&
        !foldedIds.has(action.playerId)
      ) {
        lastAggressor = action.playerId;
      }
    }
    break; // 最後にアクションがあったストリートのみ見る
  }

  if (!lastAggressor || !active.includes(lastAggressor)) {
    return active; // SBから
  }

  // lastAggressorを先頭にして時計回りに並べる
  const idx = active.indexOf(lastAggressor);
  return [...active.slice(idx), ...active.slice(0, idx)];
}

// ============================================================
// 小さなヘルパー
// ============================================================

function emptyStreets(): Record<Street, RecordedAction[]> {
  return { preflop: [], flop: [], turn: [], river: [] };
}

function emptyBoards(): Record<BoardStreet, (Card | null)[]> {
  return {
    flop: [null, null, null],
    turn: [null],
    river: [null],
  };
}

/** ボードをフロップ→ターン→リバー順の1列にする */
function flatBoard(boards: HandFlowState['boards']): (Card | null)[] {
  return [...boards.flop, ...boards.turn, ...boards.river];
}

/** ショーダウンで muck したプレイヤー */
function muckedIdsOf(records: ShowdownRecord[]): Set<string> {
  return new Set(records.filter((r) => r.action === 'muck').map((r) => r.playerId));
}

/** 勝者以外（muck含む）を下位ポットの候補から除外する */
function eliminateLosers(
  eliminated: Set<string>,
  live: string[],
  winnerIds: string[],
  muckedIds: Set<string>,
): void {
  live.forEach((id) => {
    if (!winnerIds.includes(id)) eliminated.add(id);
  });
  muckedIds.forEach((id) => eliminated.add(id));
}

/** SB・BB を払うプレイヤーID。ヘッズアップは BTN が SB を払う */
function blindIds(playerIds: string[]): { sbId: string; bbId: string } {
  if (playerIds.length === 2) return { sbId: playerIds[0], bbId: playerIds[1] };
  return { sbId: playerIds[1], bbId: playerIds[2] };
}

function playerLabel(players: Player[], playerId: string): string {
  return players.find((p) => p.id === playerId)?.name ?? playerId;
}

// ============================================================
// サイドポットのカスケード解決
// ============================================================

/** ボード5枚と、候補全員の show 済みの手札から勝者を判定する。揃っていなければ null */
function evaluatePot(
  board: (Card | null)[],
  candidateIds: string[],
  showdownRecords: ShowdownRecord[],
): ShowdownEvaluation | null {
  const boardCards = board.filter((c): c is Card => c !== null);
  const hands: { playerId: string; cards: [Card, Card] }[] = [];
  for (const id of candidateIds) {
    const cards = showdownRecords.find((r) => r.playerId === id && r.action === 'show')?.cards;
    if (!cards) return null;
    hands.push({ playerId: id, cards });
  }
  return evaluateShowdown(boardCards, hands);
}

/**
 * 1ポットぶんの獲得エントリを作る。勝者が複数（チョップ）なら splitPot で分割する。
 * 端数の優先順は postflop のアクション順（SB が最優先）。
 * 複数ポット、またはチョップのときは label を付ける（チョップを後段で識別するため）。
 */
function buildPotEntries(
  pot: Pot,
  winnerIds: string[],
  multiPot: boolean,
  playerIds: string[],
): WinnerEntry[] {
  const priority = buildPostflopOrder(playerIds, new Set());
  const withLabel = multiPot || winnerIds.length > 1;
  return splitPot(pot.amount, winnerIds, priority).map((e) => ({
    playerId: e.playerId,
    amount: e.amount,
    ...(withLabel ? { label: pot.label } : {}),
  }));
}

/**
 * サイドポットのカスケード解決の「次の一手」。
 * - showdown: このポットでまだ見せていない参加者を見せる
 * - winner: このポットの勝者を選ぶ
 * - done: 全ポット解決済み（potWinners は main→side 順）
 */
type CascadeStep =
  | {
      kind: 'showdown';
      potResolveIdx: number;
      carriedWinnerIds: string[];
      eliminatedIds: Set<string>;
      potWinners: WinnerEntry[];
      showdownQueue: string[];
    }
  | {
      kind: 'winner';
      potResolveIdx: number;
      carriedWinnerIds: string[];
      eliminatedIds: Set<string>;
      potWinners: WinnerEntry[];
    }
  | { kind: 'done'; potWinners: WinnerEntry[] };

/**
 * 上位(side)ポットから下位(main)ポットへ順に解決し、次にユーザー操作が必要なステップを返す。
 * - 争い(生存候補2人以上)のポットは、まだ見せていない参加者を showdown させ、その後 winner 選択。
 * - 1人以下のポットは無抽選で確定（ショー不要）し、勝者を下位へ持ち越す。
 * - チョップ（勝者が複数）は全員を下位へ持ち越す。
 * - 上位ポットで敗退した人は下位ポットの候補から除外される。
 */
function advanceCascade(params: {
  pots: Pot[];
  startIdx: number;
  carried: string[];
  eliminated: Set<string>;
  potWinners: WinnerEntry[];
  showdownRecords: ShowdownRecord[];
  streets: Record<Street, RecordedAction[]>;
  playerIds: string[];
  foldedIds: Set<string>;
  /** 自動確定の判定に使うボード（フロップ→ターン→リバー順） */
  board: (Card | null)[];
  /** true なら、判定できるポットは勝者選択を出さずに確定する */
  autoResolve: boolean;
}): CascadeStep {
  const { pots, playerIds, foldedIds, streets } = params;
  let idx = params.startIdx;
  let carried = params.carried;
  const eliminated = new Set(params.eliminated);
  const potWinners = [...params.potWinners];
  const shownIds = new Set(params.showdownRecords.map((r) => r.playerId));
  const muckedIds = muckedIdsOf(params.showdownRecords);
  const multi = pots.length > 1;
  const order = buildShowdownQueue(streets, playerIds, foldedIds); // ラストアグレッサー順

  // 上位(side)から下位(main)へ解決していくので、先頭に積んで常に main→side 順を保つ
  const award = (pot: Pot, winnerIds: string[]) => {
    potWinners.unshift(...buildPotEntries(pot, winnerIds, multi, playerIds));
    carried = winnerIds;
  };

  while (idx >= 0) {
    const pot = pots[idx];
    const live = pot.eligiblePlayerIds.filter((id) => !eliminated.has(id));

    if (live.length <= 1) {
      const winners = live.length > 0 ? live : carried;
      if (winners.length > 0) award(pot, winners);
      idx--;
      continue;
    }

    // 争いのあるポット: まだ見せていない参加者を見せる
    const needShow = order.filter((id) => live.includes(id) && !shownIds.has(id));
    if (needShow.length > 0) {
      return { kind: 'showdown', potResolveIdx: idx, carriedWinnerIds: carried, eliminatedIds: eliminated, potWinners, showdownQueue: needShow };
    }

    // 全員 show/muck 済み → muck を除いた候補で判定
    const liveNonMucked = live.filter((id) => !muckedIds.has(id));
    if (liveNonMucked.length <= 1) {
      const winners = liveNonMucked.length > 0 ? liveNonMucked : carried;
      if (winners.length > 0) award(pot, winners);
      idx--;
      continue;
    }

    // 自動確定: ボードと全員の手札が揃っていれば、勝者選択を出さずに判定する（同率はチョップ）
    if (params.autoResolve) {
      const evaluation = evaluatePot(params.board, liveNonMucked, params.showdownRecords);
      if (evaluation) {
        award(pot, evaluation.winnerIds);
        eliminateLosers(eliminated, live, evaluation.winnerIds, muckedIds);
        idx--;
        continue;
      }
    }
    return { kind: 'winner', potResolveIdx: idx, carriedWinnerIds: carried, eliminatedIds: eliminated, potWinners };
  }
  return { kind: 'done', potWinners };
}

/** CascadeStep を state に反映する。 */
function applyCascadeStep(base: HandFlowState, pots: Pot[], step: CascadeStep): HandFlowState {
  if (step.kind === 'done') {
    return {
      ...base,
      pots,
      phase: 'done',
      potResolveIdx: -1,
      showdownQueue: [],
      carriedWinnerIds: [],
      potWinners: step.potWinners,
    };
  }
  if (step.kind === 'showdown') {
    return {
      ...base,
      pots,
      phase: 'showdown',
      potResolveIdx: step.potResolveIdx,
      carriedWinnerIds: step.carriedWinnerIds,
      eliminatedIds: step.eliminatedIds,
      potWinners: step.potWinners,
      showdownQueue: step.showdownQueue,
    };
  }
  return {
    ...base,
    pots,
    phase: 'winner',
    potResolveIdx: step.potResolveIdx,
    carriedWinnerIds: step.carriedWinnerIds,
    eliminatedIds: step.eliminatedIds,
    potWinners: step.potWinners,
    showdownQueue: [],
  };
}

// ============================================================
// 初期状態
// ============================================================

export function createInitialState(session: SessionConfig): HandFlowState {
  const { players, smallBlind, bigBlind, ante } = session;
  const playerIds = players.map((p) => p.id);

  // SB/BB の強制投資を初期 contributions に反映（ストラドルは後から動的に設定されるため初期は0）
  const contributions: Record<string, number> = {};
  playerIds.forEach((id) => (contributions[id] = 0));
  // ハンド通算の初期投入額。per-street の contributions と違い、アンティも含める。
  // アンティは BB アンティ（BB のみ支払い）なので BB の通算拠出へ織り込む。
  let totalContributions = { ...contributions };
  if (playerIds.length >= 2) {
    const { sbId, bbId } = blindIds(playerIds);
    contributions[sbId] = smallBlind;
    contributions[bbId] = bigBlind;
    totalContributions = { ...contributions };
    if (ante > 0) totalContributions[bbId] += ante;
  }

  const preflopOrder = buildPreflopOrder(playerIds, 0);
  return {
    currentStreet: 'preflop',
    streets: emptyStreets(),
    boards: emptyBoards(),
    currentActorIdx: 0,
    foldedIds: new Set(),
    allInIds: new Set(),
    currentBet: bigBlind,
    contributions,
    totalContributions,
    pot: smallBlind + bigBlind + ante,
    // ポジション選択 → 手札入力（スキップ可）→ アクションの順。
    // 手札入力は必須にせず、スキップしても後から set-hole-cards で入れられる
    // （ボード先行入力メモと同じ思想）。
    phase: 'hole-cards',
    holeCards: null,
    showdownQueue: [],
    showdownRecords: [],
    winnerId: null,
    pots: [],
    potResolveIdx: -1,
    carriedWinnerIds: [],
    eliminatedIds: new Set(),
    potWinners: [],
    // プリフロップ開始時: BBが必ず最後にアクションする締め切り人
    closingPlayerId: preflopOrder[preflopOrder.length - 1] ?? null,
    preflopOrder,
    currentStraddle: 0,
  };
}

// ============================================================
// 各操作
// ============================================================

/** ストリート終了時の次フェーズを返す */
function resolveStreetEnd(
  newState: HandFlowState,
  currentStreet: Street,
  ctx: HandFlowContext,
): HandFlowState {
  const { playerIds } = ctx;
  // fold していない（allin含む）アクティブプレイヤー
  const activePlayers = playerIds.filter((id) => !newState.foldedIds.has(id));

  // アクティブ1人以下 → fold勝ち → winner選択へ
  if (activePlayers.length <= 1) {
    // 全員フォールドで勝った場合、勝者のベットのうちコールされなかった分は
    // ポットに入らず勝者へ戻る（例: 誰かが80ベット→全員fold なら 80 は返却）。
    // 返却額 = 勝者の当該ストリート拠出 − 他プレイヤー（fold含む）の最大拠出。
    let pot = newState.pot;
    const winnerId = activePlayers[0];
    if (winnerId !== undefined) {
      const contribs = newState.contributions;
      const winnerContrib = contribs[winnerId] ?? 0;
      const maxOther = playerIds.reduce(
        (m, id) => (id !== winnerId ? Math.max(m, contribs[id] ?? 0) : m),
        0,
      );
      const uncalled = Math.max(0, winnerContrib - maxOther);
      pot = newState.pot - uncalled;
    }
    return {
      ...newState,
      pot,
      phase: 'winner',
      showdownQueue: [],
      showdownRecords: [],
    };
  }

  const nextStreetIdx = STREETS.indexOf(currentStreet) + 1;
  // リバー終了 → サイドポットのカスケード解決（side→main）を開始
  if (nextStreetIdx >= STREETS.length) {
    const { pots } = computeSidePots(
      newState.totalContributions,
      newState.foldedIds,
      playerIds,
    );
    const base: HandFlowState = { ...newState, showdownRecords: [] };
    if (pots.length === 0) {
      // 通常は起きない（拠出があれば必ず1ポット以上）。安全にwinnerフェーズへ。
      return { ...base, phase: 'winner', pots: [], potResolveIdx: -1, showdownQueue: [] };
    }
    const step = advanceCascade({
      pots,
      startIdx: pots.length - 1,
      carried: [],
      eliminated: new Set(),
      potWinners: [],
      showdownRecords: [],
      streets: newState.streets,
      playerIds,
      foldedIds: newState.foldedIds,
      board: flatBoard(newState.boards),
      autoResolve: ctx.autoResolve,
    });
    return applyCascadeStep(base, pots, step);
  }

  // 次のストリートへ（ボード入力）
  // postflop は check ラウンドから始まるので closingPlayerId = null（lappedEnd で判定）
  const nextStreet = STREETS[nextStreetIdx];
  return {
    ...newState,
    phase: 'board-input',
    currentStreet: nextStreet,
    currentActorIdx: 0,
    currentBet: 0,
    contributions: Object.fromEntries(playerIds.map((id) => [id, 0])),
    closingPlayerId: null,
  };
}

/** ストラドル: 額は現在のベットの2倍。ストラドラーが末尾になるようプリフロップ順を組み替える */
function applyStraddle(prev: HandFlowState, ctx: HandFlowContext): HandFlowState {
  const straddleAmount = prev.currentBet * 2;
  const order = activeOrder(prev, ctx.playerIds);
  const actorId = order[prev.currentActorIdx];
  if (!actorId) return prev;

  const recorded: RecordedAction = {
    playerId: actorId,
    playerLabel: playerLabel(ctx.players, actorId),
    type: 'straddle',
    amount: straddleAmount,
  };

  // ストラドル投資分をcontributionsとpotに反映
  const prevContrib = prev.contributions[actorId] ?? 0;
  const added = Math.max(0, straddleAmount - prevContrib);
  // 通算拠出額にも反映（サイドポット計算用）
  const totalContributions = { ...prev.totalContributions };
  if (added > 0) {
    totalContributions[actorId] = (totalContributions[actorId] ?? 0) + added;
  }

  // 新しいpreflopOrder: ストラドルしたプレイヤーの次から始まり、ストラドルプレイヤーが末尾
  const actorInPreflopIdx = prev.preflopOrder.indexOf(actorId);
  const preflopOrder = actorInPreflopIdx >= 0
    ? [
        ...prev.preflopOrder.slice(actorInPreflopIdx + 1),
        ...prev.preflopOrder.slice(0, actorInPreflopIdx),
        actorId,
      ]
    : prev.preflopOrder;

  // 新しいactiveOrder（fold/allin除外）。ストラドラー（末尾）が締め切り人
  const newActiveOrder = preflopOrder.filter(
    (id) => !prev.foldedIds.has(id) && !prev.allInIds.has(id),
  );

  return {
    ...prev,
    streets: { ...prev.streets, preflop: [...prev.streets.preflop, recorded] },
    contributions: { ...prev.contributions, [actorId]: straddleAmount },
    totalContributions,
    currentBet: straddleAmount,
    pot: prev.pot + added,
    // ストラドル後: 次のプレイヤー（新orderの先頭）がアクター
    currentActorIdx: 0,
    closingPlayerId: newActiveOrder[newActiveOrder.length - 1] ?? null,
    preflopOrder,
    currentStraddle: straddleAmount,
    phase: 'action',
  };
}

/** straddle 以外のアクション（fold/check/call/bet/raise/allin）を適用する */
function applyAction(
  prev: HandFlowState,
  ctx: HandFlowContext,
  type: ActionType,
  amount?: number,
): HandFlowState {
  const { players, playerIds } = ctx;
  // アクション前のアクティブ順でアクターを特定
  const order = activeOrder(prev, playerIds);
  const actorId = order[prev.currentActorIdx];
  if (!actorId) return prev;

  const recorded: RecordedAction = {
    playerId: actorId,
    playerLabel: playerLabel(players, actorId),
    type,
    amount,
  };

  const newStreets = {
    ...prev.streets,
    [prev.currentStreet]: [...prev.streets[prev.currentStreet], recorded],
  };

  const newFolded = new Set(prev.foldedIds);
  const newAllIn = new Set(prev.allInIds);
  const newContributions = { ...prev.contributions };
  const newTotalContributions = { ...prev.totalContributions };
  let newBet = prev.currentBet;
  let newPot = prev.pot;

  // そのアクションでポットに追加された額を通算拠出額へ反映する
  const addToTotal = (added: number) => {
    if (added > 0) {
      newTotalContributions[actorId] =
        (newTotalContributions[actorId] ?? 0) + added;
    }
  };

  if (type === 'fold') {
    newFolded.add(actorId);
  } else if (type === 'call') {
    const toCall = callAmount(prev, actorId);
    newContributions[actorId] = prev.currentBet;
    newPot += toCall;
    addToTotal(toCall);
  } else if (type === 'bet' || type === 'raise') {
    const total = amount ?? prev.currentBet;
    const added = total - (newContributions[actorId] ?? 0);
    newContributions[actorId] = total;
    newBet = total;
    newPot += added;
    addToTotal(added);
  } else if (type === 'allin') {
    // allin: amount が指定されていればその額、なければプレイヤーのスタック（実効スタック）を使用
    // スタックが未設定(0)の場合は currentBet をフォールバックとして使う
    const playerStack = players.find((p) => p.id === actorId)?.stack ?? 0;
    const fallback = playerStack > 0 ? playerStack : prev.currentBet;
    const total = (amount !== undefined && amount > 0) ? amount : fallback;
    if (total <= 0) return prev; // 0でオールインは不可
    const added = Math.max(0, total - (newContributions[actorId] ?? 0));
    newContributions[actorId] = total;
    if (total > newBet) newBet = total;
    newPot += added;
    addToTotal(added);
    newAllIn.add(actorId);
  }
  // check: nothing to update

  // このオールインが上乗せ（レイズ/ベット）か、コール額以下（ショートスタックのコール相当）か。
  // コール相当のオールインは closingPlayer をリセットせず、callと同じ終了判定を使う。
  const allinIsRaise = type === 'allin' && newBet > prev.currentBet;

  // アクション後の（fold除く）アクティブプレイヤーリスト
  const activePlayers = playerIds.filter((id) => !newFolded.has(id));

  // アクション後の新しいorder（fold済み・allin済みを除く）
  const newOrder = prev.currentStreet === 'preflop'
    ? prev.preflopOrder.filter((id) => !newFolded.has(id) && !newAllIn.has(id))
    : buildPostflopOrder(playerIds, newFolded, newAllIn);

  // ---- 次のインデックス計算 ----
  let newActorIdx: number;
  if (type === 'fold' || type === 'allin') {
    // fold/allin: リストが縮むので同じ位置インデックスで次の人が来る
    newActorIdx = newOrder.length > 0 ? prev.currentActorIdx % newOrder.length : 0;
  } else {
    newActorIdx = (prev.currentActorIdx + 1) % Math.max(newOrder.length, 1);
  }

  // ---- closingPlayerId の更新 ----
  let newClosingPlayerId = prev.closingPlayerId;
  if (type === 'bet' || type === 'raise' || allinIsRaise) {
    // ベッター/オールインの newOrder 上1つ前の人が最後にアクションする人
    const betterIdx = newOrder.indexOf(actorId);
    if (betterIdx >= 0) {
      const prevIdx = (betterIdx - 1 + newOrder.length) % newOrder.length;
      newClosingPlayerId = newOrder[prevIdx] ?? null;
    } else {
      // allinでnewOrderから除かれた場合:
      // allin前のactiveOrderでactorの1つ前のプレイヤーをclosingPlayerにする
      const actorInPrevIdx = order.indexOf(actorId);
      if (actorInPrevIdx >= 0 && order.length > 1) {
        const prevIdx = (actorInPrevIdx - 1 + order.length) % order.length;
        const candidate = order[prevIdx];
        // candidateがnewOrderに存在する場合はそのプレイヤー、なければnewOrderの末尾
        newClosingPlayerId = (candidate && newOrder.includes(candidate))
          ? candidate
          : (newOrder[newOrder.length - 1] ?? null);
      } else {
        newClosingPlayerId = newOrder[newOrder.length - 1] ?? null;
      }
    }
  } else if (type === 'fold' && prev.closingPlayerId !== null) {
    if (!newOrder.includes(prev.closingPlayerId)) {
      newClosingPlayerId = newOrder[newOrder.length - 1] ?? null;
    }
  }

  // ---- ストリート終了判定 ----
  const rawIdx = (type === 'fold' || type === 'allin') ? prev.currentActorIdx : prev.currentActorIdx + 1;
  const lappedEnd = rawIdx >= newOrder.length;
  // allSquared: fold/allinしていない全アクティブプレイヤーがベット額に揃っているか
  const allSquared = activePlayers.every(
    (id) => newAllIn.has(id) || newContributions[id] >= newBet,
  );

  // アクション可能なプレイヤー（fold・allin除く）
  const actionablePlayers = activePlayers.filter((id) => !newAllIn.has(id));

  let streetOver: boolean;
  if (activePlayers.length <= 1) {
    // fold勝ち
    streetOver = true;
  } else if (actionablePlayers.length === 0) {
    // 全員allin（またはallin+fold）→ アクション不要でストリート終了
    streetOver = true;
  } else if (newBet === 0) {
    // ベットなし（全員checkのみ）: 末尾を一周通過したら終了
    streetOver = lappedEnd;
  } else if (type === 'bet' || type === 'raise') {
    // bet/raise 直後: ベッターが末尾 かつ 全員揃っていれば即終了
    const actorNewIdx = newOrder.indexOf(actorId);
    const afterBetRaw = actorNewIdx >= 0 ? actorNewIdx + 1 : newOrder.length;
    streetOver = afterBetRaw >= newOrder.length && allSquared;
  } else if (type === 'allin') {
    if (allinIsRaise) {
      // レイズ/ベット相当のallin直後: newOrder（まだアクション必要な人）が空なら終了
      streetOver = newOrder.length === 0;
    } else {
      // コール相当（ショート額）のallin: callと同じ終了判定。
      // closingPlayer自身がオールインコールしたら揃っていれば終了。
      if (newClosingPlayerId !== null) {
        streetOver = actorId === newClosingPlayerId && allSquared;
      } else {
        streetOver = lappedEnd && allSquared;
      }
    }
  } else {
    // call / fold の後:
    if (newClosingPlayerId !== null) {
      const closingPlayerDidFold =
        type === 'fold' && prev.closingPlayerId === actorId;
      if (closingPlayerDidFold) {
        // closingPlayer自身がfoldした → 残り全員揃っていれば即終了
        streetOver = allSquared;
      } else {
        streetOver = actorId === newClosingPlayerId && allSquared;
      }
    } else {
      streetOver = lappedEnd && allSquared;
    }
  }

  // ---- アンコール分（未コールのベット）の返却 ----
  // ショートスタックのオールイン等で、トップの拠出が一部コールされなかった場合、
  // その差額（最高拠出 − 2番目の拠出）はポットに入らず拠出者へ戻る。
  let finalPot = newPot;
  let finalContributions = newContributions;
  if (streetOver && activePlayers.length > 1) {
    const sorted = activePlayers
      .map((id) => newContributions[id] ?? 0)
      .sort((a, b) => b - a);
    const uncalled = (sorted[0] ?? 0) - (sorted[1] ?? 0);
    if (uncalled > 0) {
      finalPot = newPot - uncalled;
      const topId = activePlayers.find(
        (id) => (newContributions[id] ?? 0) === sorted[0],
      );
      if (topId) {
        finalContributions = { ...newContributions, [topId]: sorted[1] ?? 0 };
      }
    }
  }

  const newState: HandFlowState = {
    ...prev,
    streets: newStreets,
    foldedIds: newFolded,
    allInIds: newAllIn,
    contributions: finalContributions,
    totalContributions: newTotalContributions,
    currentBet: newBet,
    pot: finalPot,
    currentActorIdx: newActorIdx,
    closingPlayerId: newClosingPlayerId,
    phase: 'action',
  };

  return streetOver ? resolveStreetEnd(newState, prev.currentStreet, ctx) : newState;
}

/** ボードカード確定してアクションフェーズへ（アクション可能者がいない場合は次のボード入力へ） */
function applyConfirmBoard(prev: HandFlowState, ctx: HandFlowContext): HandFlowState {
  const actionable = ctx.playerIds.filter(
    (id) => !prev.foldedIds.has(id) && !prev.allInIds.has(id),
  );
  if (actionable.length <= 1) {
    // アクション不要 → 即次ストリートへ
    return resolveStreetEnd({ ...prev, phase: 'action' }, prev.currentStreet, ctx);
  }
  return { ...prev, phase: 'action' };
}

/**
 * ショーダウン: 現在のプレイヤーのアクション（show or muck）を記録し次へ。
 * 現ポットの参加者を全員見せ終えたら、カスケードを進めて勝者選択/次ポットへ。
 */
function applyShowdown(
  prev: HandFlowState,
  ctx: HandFlowContext,
  record: ShowdownRecord,
): HandFlowState {
  const newRecords = [...prev.showdownRecords, record];
  const newQueue = prev.showdownQueue.slice(1);
  if (newQueue.length > 0) {
    return { ...prev, showdownRecords: newRecords, showdownQueue: newQueue };
  }
  // 現ポットの提示が終わった → カスケードを現在のポットから再評価
  const step = advanceCascade({
    pots: prev.pots,
    startIdx: prev.potResolveIdx,
    carried: prev.carriedWinnerIds,
    eliminated: prev.eliminatedIds,
    potWinners: prev.potWinners,
    showdownRecords: newRecords,
    streets: prev.streets,
    playerIds: ctx.playerIds,
    foldedIds: prev.foldedIds,
    board: flatBoard(prev.boards),
    autoResolve: ctx.autoResolve,
  });
  return applyCascadeStep({ ...prev, showdownRecords: newRecords }, prev.pots, step);
}

/**
 * 現在のポットの勝者を確定し、次の（下位）ポットへ進む。
 * 勝者が複数ならチョップ（ポットを等分し、端数は postflop のアクション順の早い人へ）。
 * 敗者は下位ポットの候補から除外し、勝者全員を持ち越す。全ポット終了で done。
 */
function applyPotWinner(
  prev: HandFlowState,
  ctx: HandFlowContext,
  winnerIds: string[],
): HandFlowState {
  if (winnerIds.length === 0) return prev;
  const idx = prev.potResolveIdx;
  const pot = prev.pots[idx];
  if (!pot) return prev;

  const live = pot.eligiblePlayerIds.filter((id) => !prev.eliminatedIds.has(id));
  const newEliminated = new Set(prev.eliminatedIds);
  eliminateLosers(newEliminated, live, winnerIds, muckedIdsOf(prev.showdownRecords));

  // 下位ポットほど前に来るよう先頭へ積む（main→side 順を保つ）
  const newPotWinners = [
    ...buildPotEntries(pot, winnerIds, prev.pots.length > 1, ctx.playerIds),
    ...prev.potWinners,
  ];

  const step = advanceCascade({
    pots: prev.pots,
    startIdx: idx - 1,
    carried: winnerIds,
    eliminated: newEliminated,
    potWinners: newPotWinners,
    showdownRecords: prev.showdownRecords,
    streets: prev.streets,
    playerIds: ctx.playerIds,
    foldedIds: prev.foldedIds,
    board: flatBoard(prev.boards),
    autoResolve: ctx.autoResolve,
  });
  return applyCascadeStep(prev, prev.pots, step);
}

/** 履歴を除いた state の遷移 */
function reduceState(
  prev: HandFlowState,
  event: Exclude<HandFlowEvent, { type: 'go-back' }>,
  ctx: HandFlowContext,
): HandFlowState {
  switch (event.type) {
    case 'start-action':
      // 手札入力画面からアクションフェーズへ進む（スキップ/入力完了で呼ぶ）
      return prev.phase === 'hole-cards' ? { ...prev, phase: 'action' } : prev;
    case 'back-to-hole-cards':
      // 1人目のアクション入力から手札入力画面へ戻る
      return prev.phase === 'action' ? { ...prev, phase: 'hole-cards' } : prev;
    case 'set-hole-cards':
      // 手札を後から設定/クリアする。フェーズは進めない（ボード先行入力メモと同じ思想）
      return { ...prev, holeCards: event.cards };
    case 'update-board':
      return {
        ...prev,
        boards: {
          ...prev.boards,
          [event.street]: prev.boards[event.street].map((c, i) => (i === event.idx ? event.card : c)),
        },
      };
    case 'commit-action':
      return event.actionType === 'straddle'
        ? applyStraddle(prev, ctx)
        : applyAction(prev, ctx, event.actionType, event.amount);
    case 'confirm-board':
      return applyConfirmBoard(prev, ctx);
    case 'commit-showdown':
      return applyShowdown(prev, ctx, event.record);
    case 'confirm-pot-winner':
      return applyPotWinner(prev, ctx, event.winnerIds);
  }
}

/**
 * ハンド進行の reducer。
 * 進行系の操作（HISTORY_EVENTS）で state が変わったときだけ、直前の state を履歴に積む。
 * go-back は履歴の末尾を取り出して戻す。
 */
export function handFlowReducer(
  flow: HandFlow,
  event: HandFlowEvent,
  ctx: HandFlowContext,
): HandFlow {
  if (event.type === 'go-back') {
    if (flow.history.length === 0) return flow;
    return {
      state: flow.history[flow.history.length - 1],
      history: flow.history.slice(0, -1),
    };
  }
  const next = reduceState(flow.state, event, ctx);
  if (next === flow.state) return flow;
  return {
    state: next,
    history: HISTORY_EVENTS.has(event.type) ? [...flow.history, flow.state] : flow.history,
  };
}

// ============================================================
// 派生値（画面表示用）
// ============================================================

/**
 * ストラドルボタンを表示するかどうか。
 * - プリフロップのアクションフェーズのみ、プレイヤー数が4人以上（UTGが存在する）
 * - UTGの番でストラドルを表示
 * - UTGがstraddleした場合、次のプレイヤー（新しいアクター）にもストラドルを表示
 * - 誰かがstraddle以外のアクション（fold/call/check/bet/raise/allin）を行ったら
 *   それ以降のプレイヤーにはストラドルを表示しない
 */
export function canStraddle(s: HandFlowState, playerIds: string[]): boolean {
  if (s.currentStreet !== 'preflop') return false;
  if (s.phase !== 'action') return false;
  if (playerIds.length < 4) return false; // UTGが必要

  const preflopActions = s.streets.preflop;
  // straddle以外のアクションが既に行われていたらストラドル不可
  if (preflopActions.some((a) => a.type !== 'straddle')) return false;

  const actorId = currentActorId(s, playerIds);
  if (!actorId) return false;

  const straddleCount = preflopActions.filter((a) => a.type === 'straddle').length;
  // straddleなし: UTG（playerIds[3]）がアクターの番のみ
  if (straddleCount === 0) return actorId === playerIds[3];
  // ストラドル連鎖中: 直前のストラドラーの次（新orderの先頭）がアクターであればOK
  return s.currentActorIdx === 0;
}

/**
 * 現在カスケードで解決中のポットと、その勝者候補（eligible − 敗退 − muck）、自動判定の結果。
 * 自動判定はボード5枚＋候補全員の手札が揃っているときだけで、揃っていなければ null（手動選択）。
 */
export function currentPotView(s: HandFlowState): {
  currentPot: Pot | null;
  currentPotCandidates: string[];
  currentPotSuggestion: ShowdownEvaluation | null;
} {
  const currentPot =
    s.phase === 'winner' && s.potResolveIdx >= 0 ? s.pots[s.potResolveIdx] ?? null : null;
  if (!currentPot) {
    return { currentPot: null, currentPotCandidates: [], currentPotSuggestion: null };
  }
  const mucked = muckedIdsOf(s.showdownRecords);
  const currentPotCandidates = currentPot.eligiblePlayerIds.filter(
    (id) => !s.eliminatedIds.has(id) && !mucked.has(id),
  );
  return {
    currentPot,
    currentPotCandidates,
    currentPotSuggestion: evaluatePot(flatBoard(s.boards), currentPotCandidates, s.showdownRecords),
  };
}
