import { useState, useCallback } from 'react';
import type { SessionConfig, ActionType, Card } from '../../types/poker';
import type { HandFlowState, RecordedAction, ShowdownRecord, Street } from './types';
import { computeSidePots } from '../../utils/sidePots';
import type { Pot, WinnerEntry } from '../../utils/sidePots';
import { splitPot } from '../../utils/splitPot';
import { evaluateShowdown } from '../../utils/evaluateShowdown';
import type { ShowdownEvaluation } from '../../utils/evaluateShowdown';

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

/**
 * ショーダウンの勝者を手札評価で自動確定するか（チョップ含む）。
 * true: ボード5枚＋候補全員の手札が揃っていれば「ポットの勝者を選択」画面を出さずに確定する。
 * false: 従来どおり毎回 WinnerPanel で勝者を選ぶ（自動判定は初期選択として出るだけ）。
 * 手動に戻すときはここを false にする（フックの options.autoResolve でも上書きできる）。
 */
export const AUTO_RESOLVE_WINNERS = true;

function emptyStreets(): Record<Street, RecordedAction[]> {
  return { preflop: [], flop: [], turn: [], river: [] };
}

function emptyBoards(): Record<'flop' | 'turn' | 'river', (Card | null)[]> {
  return {
    flop: [null, null, null],
    turn: [null],
    river: [null],
  };
}

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
  const muckedIds = new Set(
    params.showdownRecords.filter((r) => r.action === 'muck').map((r) => r.playerId),
  );
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
        // 勝者以外（muck含む）は下位ポットの候補から除外
        live.forEach((id) => {
          if (!evaluation.winnerIds.includes(id)) eliminated.add(id);
        });
        muckedIds.forEach((id) => eliminated.add(id));
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

export function useHandFlow(
  session: SessionConfig,
  options: { autoResolve?: boolean } = {},
) {
  const autoResolve = options.autoResolve ?? AUTO_RESOLVE_WINNERS;
  const { players, smallBlind, bigBlind, ante } = session;
  const playerIds = players.map((p) => p.id);

  // SB/BB の強制投資を初期 contributions に反映
  const initContributions = (): Record<string, number> => {
    const c: Record<string, number> = {};
    playerIds.forEach((id) => (c[id] = 0));
    if (playerIds.length >= 2) {
      c[playerIds[1]] = smallBlind; // SB
      c[playerIds[2 > playerIds.length - 1 ? 0 : 2]] =
        playerIds.length === 2 ? bigBlind : bigBlind; // BB
      if (players.length === 2) {
        c[playerIds[0]] = smallBlind; // HU: BTN=SB
        c[playerIds[1]] = bigBlind;
      }
      // ストラドルは後から動的に設定されるため初期は0
    }
    return c;
  };

  // ハンド通算の初期投入額。per-street の contributions と違い、アンティも含める。
  // アンティは BB アンティ（BB のみ支払い）なので BB の通算拠出へ織り込む。
  const initTotalContributions = (): Record<string, number> => {
    const c = initContributions();
    if (ante > 0 && playerIds.length >= 2) {
      const bbId = players.length === 2 ? playerIds[1] : playerIds[2];
      c[bbId] = (c[bbId] ?? 0) + ante;
    }
    return c;
  };

  const initialPreflopOrder = buildPreflopOrder(playerIds, 0);
  const [state, setState] = useState<HandFlowState>({
    currentStreet: 'preflop',
    streets: emptyStreets(),
    boards: emptyBoards(),
    currentActorIdx: 0,
    foldedIds: new Set(),
    allInIds: new Set(),
    currentBet: bigBlind,
    contributions: initContributions(),
    totalContributions: initTotalContributions(),
    pot: smallBlind + bigBlind + ante,
    // ポジション選択 → 手札入力（スキップ可）→ アクションの順。
    // 手札入力は必須にせず、スキップしても後から setHoleCards で入れられる
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
    closingPlayerId: initialPreflopOrder[initialPreflopOrder.length - 1] ?? null,
    preflopOrder: initialPreflopOrder,
    currentStraddle: 0,
  });

  // 履歴スタック（「戻る」用）
  const [history, setHistory] = useState<HandFlowState[]>([]);

  /**
   * そのストリートのアクション順（fold済み・allin済みを除いたアクティブプレイヤーのみ）を返す。
   * currentActorIdx はこのリスト上のインデックスとして管理する。
   */
  const activeOrder = useCallback(
    (s: HandFlowState): string[] => {
      if (s.currentStreet === 'preflop') {
        return s.preflopOrder.filter((id) => !s.foldedIds.has(id) && !s.allInIds.has(id));
      }
      return buildPostflopOrder(playerIds, s.foldedIds, s.allInIds);
    },
    [playerIds],
  );

  /** 現在のアクターID */
  const currentActorId = (s: HandFlowState): string | null => {
    const ao = activeOrder(s);
    return ao[s.currentActorIdx] ?? null;
  };

  /** コール額 */
  const callAmount = (s: HandFlowState, playerId: string): number => {
    return Math.max(0, s.currentBet - (s.contributions[playerId] ?? 0));
  };

  /** ストリート終了時の次フェーズを返すヘルパー */
  const resolveStreetEnd = (
    newState: HandFlowState,
    currentStreet: Street,
  ): HandFlowState => {
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
        board: [...newState.boards.flop, ...newState.boards.turn, ...newState.boards.river],
        autoResolve,
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
  };

  /** アクションを実行 */
  const commitAction = useCallback(
    (type: ActionType, amount?: number) => {
      // straddleアクションは特別処理（preflopOrderを再構築してstateを更新）
      if (type === 'straddle') {
        // 次のストラドル額: 現在のcurrentBetの2倍（初回はbigBlind*2）
        const straddleAmount = state.currentBet * 2;
        setState((prev) => {
          const order = activeOrder(prev);
          const actorId = order[prev.currentActorIdx];
          if (!actorId) return prev;

          const playerLabel = players[players.findIndex((p) => p.id === actorId)]?.name ?? actorId;

          const recorded: RecordedAction = {
            playerId: actorId,
            playerLabel,
            type: 'straddle',
            amount: straddleAmount,
          };

          const newStreets = {
            ...prev.streets,
            preflop: [...prev.streets.preflop, recorded],
          };

          // ストラドル投資分をcontributionsとpotに反映
          const newContributions = { ...prev.contributions };
          const prevContrib = newContributions[actorId] ?? 0;
          const added = straddleAmount - prevContrib;
          newContributions[actorId] = straddleAmount;
          const newPot = prev.pot + (added > 0 ? added : 0);

          // 通算拠出額にも反映（サイドポット計算用）
          const newTotalContributions = { ...prev.totalContributions };
          if (added > 0) {
            newTotalContributions[actorId] = (newTotalContributions[actorId] ?? 0) + added;
          }

          // 新しいpreflopOrderを構築（straddleしたプレイヤーを末尾へ）
          // ストラドルしたアクターの次のプレイヤーから始まり、アクターが最後になる順番
          const preflopOrder = prev.preflopOrder;
          const actorInPreflopIdx = preflopOrder.indexOf(actorId);
          let newOrder: string[];
          if (actorInPreflopIdx >= 0) {
            // ストラドルしたプレイヤーの次から始まり、ストラドルプレイヤーが末尾
            const after = preflopOrder.slice(actorInPreflopIdx + 1);
            const before = preflopOrder.slice(0, actorInPreflopIdx);
            newOrder = [...after, ...before, actorId];
          } else {
            newOrder = preflopOrder;
          }

          // 新しいactiveOrder（fold/allin除外）
          const newActiveOrder = newOrder.filter(
            (id) => !prev.foldedIds.has(id) && !prev.allInIds.has(id),
          );

          // ストラドル後: 次のプレイヤー（新orderの先頭）がアクター
          const newActorIdx = 0;

          // closingPlayerId: ストラドラー（末尾）が締め切り人
          const newClosingPlayerId = newActiveOrder[newActiveOrder.length - 1] ?? null;

          return {
            ...prev,
            streets: newStreets,
            contributions: newContributions,
            totalContributions: newTotalContributions,
            currentBet: straddleAmount,
            pot: newPot,
            currentActorIdx: newActorIdx,
            closingPlayerId: newClosingPlayerId,
            preflopOrder: newOrder,
            currentStraddle: straddleAmount,
            phase: 'action',
          };
        });

        setHistory((h) => [...h, state]);
        return;
      }

      setState((prev) => {
        // アクション前のアクティブ順でアクターを特定
        const order = activeOrder(prev);
        const actorId = order[prev.currentActorIdx];
        if (!actorId) return prev;

        const playerLabel = players[players.findIndex((p) => p.id === actorId)]?.name ?? actorId;

        const recorded: RecordedAction = {
          playerId: actorId,
          playerLabel,
          type,
          amount,
        };

        const newStreets = {
          ...prev.streets,
          [prev.currentStreet]: [...prev.streets[prev.currentStreet], recorded],
        };

        let newFolded = new Set(prev.foldedIds);
        let newAllIn = new Set(prev.allInIds);
        let newContributions = { ...prev.contributions };
        let newTotalContributions = { ...prev.totalContributions };
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
            const prevOrder = order; // allin前のactiveOrder
            const actorInPrevIdx = prevOrder.indexOf(actorId);
            if (actorInPrevIdx >= 0 && prevOrder.length > 1) {
              const prevIdx = (actorInPrevIdx - 1 + prevOrder.length) % prevOrder.length;
              const candidate = prevOrder[prevIdx];
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

        if (streetOver) {
          return resolveStreetEnd(newState, prev.currentStreet);
        }

        return newState;
      });

      // 履歴に積む
      setHistory((h) => [...h, state]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, activeOrder, players, playerIds, bigBlind],
  );

  /** 手札入力画面からアクションフェーズへ進む（スキップ/入力完了で呼ぶ） */
  const startAction = useCallback(() => {
    setState((prev) => (prev.phase === 'hole-cards' ? { ...prev, phase: 'action' } : prev));
  }, []);

  /**
   * 手札を後から設定/クリアする。フェーズは進めない（ボード先行入力メモと同じ思想）。
   * ペアが揃っていないときは null を渡してクリアする。
   */
  const setHoleCards = useCallback((cards: [Card, Card] | null) => {
    setState((prev) => ({ ...prev, holeCards: cards }));
  }, []);

  /** ボードカード確定してアクションフェーズへ（アクション可能者がいない場合は次のボード入力へ） */
  const confirmBoard = useCallback(() => {
    setHistory((h) => [...h, state]);
    setState((prev) => {
      const actionable = playerIds.filter(
        (id) => !prev.foldedIds.has(id) && !prev.allInIds.has(id),
      );
      if (actionable.length <= 1) {
        // アクション不要 → 即次ストリートへ
        return resolveStreetEnd({ ...prev, phase: 'action' }, prev.currentStreet);
      }
      return { ...prev, phase: 'action' };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, playerIds]);

  /** ボードカードを更新 */
  const updateBoard = useCallback(
    (street: 'flop' | 'turn' | 'river', idx: number, card: Card | null) => {
      setState((prev) => {
        const newBoards = {
          ...prev.boards,
          [street]: prev.boards[street].map((c, i) => (i === idx ? card : c)),
        };
        return { ...prev, boards: newBoards };
      });
    },
    [],
  );

  /**
   * ショーダウン: 現在のプレイヤーのアクション（show or muck）を記録し次へ。
   * 現ポットの参加者を全員見せ終えたら、カスケードを進めて勝者選択/次ポットへ。
   */
  const commitShowdown = useCallback((record: ShowdownRecord) => {
    setHistory((h) => [...h, state]);
    setState((prev) => {
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
        playerIds,
        foldedIds: prev.foldedIds,
        board: [...prev.boards.flop, ...prev.boards.turn, ...prev.boards.river],
        autoResolve,
      });
      return applyCascadeStep({ ...prev, showdownRecords: newRecords }, prev.pots, step);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, playerIds]);

  /**
   * 現在のポットの勝者を確定し、次の（下位）ポットへ進む。
   * 勝者が複数ならチョップ（ポットを等分し、端数は postflop のアクション順の早い人へ）。
   * 敗者は下位ポットの候補から除外し、勝者全員を持ち越す。全ポット終了で done。
   */
  const confirmPotWinner = useCallback((winnerIds: string[]) => {
    if (winnerIds.length === 0) return;
    setHistory((h) => [...h, state]);
    setState((prev) => {
      const idx = prev.potResolveIdx;
      const pot = prev.pots[idx];
      if (!pot) return prev;

      const muckedIds = new Set(
        prev.showdownRecords.filter((r) => r.action === 'muck').map((r) => r.playerId),
      );
      const live = pot.eligiblePlayerIds.filter((id) => !prev.eliminatedIds.has(id));

      const newEliminated = new Set(prev.eliminatedIds);
      // 勝者以外（muck含む）は下位ポットの候補から除外
      live.forEach((id) => {
        if (!winnerIds.includes(id)) newEliminated.add(id);
      });
      muckedIds.forEach((id) => newEliminated.add(id));

      const multi = prev.pots.length > 1;
      // 下位ポットほど前に来るよう先頭へ積む（main→side 順を保つ）
      const newPotWinners = [
        ...buildPotEntries(pot, winnerIds, multi, playerIds),
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
        playerIds,
        foldedIds: prev.foldedIds,
        board: [...prev.boards.flop, ...prev.boards.turn, ...prev.boards.river],
        autoResolve,
      });
      return applyCascadeStep(prev, prev.pots, step);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, playerIds]);

  /** 1手戻る */
  const goBack = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setState(prev);
      return h.slice(0, -1);
    });
  }, []);

  /** 1人目のアクション入力から手札入力画面へ戻る（履歴が空のときだけ） */
  const backToHoleCards = useCallback(() => {
    setState((prev) => (prev.phase === 'action' ? { ...prev, phase: 'hole-cards' } : prev));
  }, []);

  const actorId = currentActorId(state);
  const actorPlayer = players.find((p) => p.id === actorId) ?? null;
  const toCall = actorId ? callAmount(state, actorId) : 0;

  // メイン/サイドポットの構成（通算拠出額から算出）。参照用。
  const { pots: sidePots } = computeSidePots(
    state.totalContributions,
    state.foldedIds,
    playerIds,
  );

  // 現在カスケードで解決中のポットと、その勝者候補（eligible − 敗退 − muck）
  const currentPot =
    state.phase === 'winner' && state.potResolveIdx >= 0
      ? state.pots[state.potResolveIdx] ?? null
      : null;
  const currentPotCandidates: string[] = (() => {
    if (!currentPot) return [];
    const mucked = new Set(
      state.showdownRecords.filter((r) => r.action === 'muck').map((r) => r.playerId),
    );
    return currentPot.eligiblePlayerIds.filter(
      (id) => !state.eliminatedIds.has(id) && !mucked.has(id),
    );
  })();

  // 現在のポットの自動判定（ボード5枚＋候補全員の手札が揃っているときだけ）。
  // 揃っていなければ null で、勝者は手動選択になる。
  const currentPotSuggestion = currentPot
    ? evaluatePot(
        [...state.boards.flop, ...state.boards.turn, ...state.boards.river],
        currentPotCandidates,
        state.showdownRecords,
      )
    : null;

  /**
   * ストラドルボタンを表示するかどうかを判定する。
   * - プリフロップのみ
   * - UTG（preflopOrder[0]、straddleなしの場合）またはストラドル連鎖中のプレイヤーがアクター
   * - プレイヤー数が4人以上（UTGが存在する）
   * - まだbet/raise/call/fold等のアクションが行われていない状態ではなく、
   *   ストラドル可能なプレイヤーの番であること
   *
   * 仕様:
   * - UTGの番でストラドルを表示
   * - UTGがstraddleした場合、次のプレイヤー（新しいアクター）にもストラドルを表示
   * - 誰かがstraddle以外のアクション（fold/call/check/bet/raise/allin）を行ったら
   *   それ以降のプレイヤーにはストラドルを表示しない
   * - プリフロップのみ
   */
  const canStraddle = (() => {
    if (state.currentStreet !== 'preflop') return false;
    if (state.phase !== 'action') return false;
    if (players.length < 4) return false; // UTGが必要

    // preflopアクション履歴を確認
    const preflopActions = state.streets.preflop;

    // straddle以外のアクションが既に行われていたらストラドル不可
    const hasNonStraddleAction = preflopActions.some(
      (a) => a.type !== 'straddle',
    );
    if (hasNonStraddleAction) return false;

    // 現在のアクターがストラドル可能な位置かチェック
    // straddleなしの場合: UTG（playerIds[3]）がアクター
    // straddleありの場合: straddleアクション後の次のプレイヤーがアクター
    // → preflopOrder上で最初にアクションする人（idx=0）または
    //   straddleアクションの連鎖中の次の人
    const currentAO = activeOrder(state);
    const currentActorInOrder = currentAO[state.currentActorIdx];

    if (!currentActorInOrder) return false;

    // ストラドル済みの人数をカウント
    const straddleCount = preflopActions.filter((a) => a.type === 'straddle').length;

    // straddleなしの場合: UTG（playerIds[3]）がアクターであればストラドル可
    // straddleありの場合: 直前にstraddleしたプレイヤーの次のプレイヤーがアクターであればストラドル可
    if (straddleCount === 0) {
      // UTGがアクターの番のみ
      return currentActorInOrder === playerIds[3];
    } else {
      // ストラドル連鎖中: 現在のアクターがアクティブな先頭（currentActorIdx=0）であればOK
      // ただし、ストラドルしたプレイヤー（末尾）と同一でないことを確認
      return state.currentActorIdx === 0;
    }
  })();

  return {
    state,
    history,
    actorId,
    actorPlayer,
    toCall,
    canGoBack: history.length > 0,
    canBackToHoleCards: history.length === 0 && state.phase === 'action',
    canStraddle,
    currentStraddle: state.currentStraddle,
    startAction,
    backToHoleCards,
    setHoleCards,
    commitAction,
    confirmBoard,
    updateBoard,
    commitShowdown,
    confirmPotWinner,
    goBack,
    players,
    playerIds,
    sidePots,
    currentPot,
    currentPotCandidates,
    currentPotSuggestion,
  };
}
