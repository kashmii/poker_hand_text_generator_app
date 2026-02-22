import { useState, useCallback } from 'react';
import type { SessionConfig, ActionType, Card } from '../../types/poker';
import type { HandFlowState, RecordedAction, ShowdownRecord, Street } from './types';

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

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

  // 全ストリートを時系列順に並べてラストアグレッサーを探す
  let lastAggressor: string | null = null;
  for (const street of STREETS) {
    for (const action of streets[street]) {
      if (
        (action.type === 'bet' || action.type === 'raise' || action.type === 'allin') &&
        !foldedIds.has(action.playerId)
      ) {
        lastAggressor = action.playerId;
      }
    }
  }

  if (!lastAggressor || !active.includes(lastAggressor)) {
    return active; // SBから
  }

  // lastAggressorを先頭にして時計回りに並べる
  const idx = active.indexOf(lastAggressor);
  return [...active.slice(idx), ...active.slice(0, idx)];
}


export function useHandFlow(session: SessionConfig) {
  const { players, smallBlind, bigBlind } = session;
  const playerIds = players.map((p) => p.id);

  // ストラドル額を動的に管理（アクション中にstraddleが決まる）
  const [currentStraddle, setCurrentStraddle] = useState<number>(0);
  // preflopOrderも動的に管理（straddle確定後に再構築）
  const [preflopOrder, setPreflopOrder] = useState<string[]>(() =>
    buildPreflopOrder(playerIds, 0),
  );

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

  const [state, setState] = useState<HandFlowState>({
    currentStreet: 'preflop',
    streets: emptyStreets(),
    boards: emptyBoards(),
    currentActorIdx: 0,
    foldedIds: new Set(),
    allInIds: new Set(),
    currentBet: bigBlind,
    contributions: initContributions(),
    pot: smallBlind + bigBlind,
    phase: 'hole-cards',
    holeCards: null,
    showdownQueue: [],
    showdownRecords: [],
    winnerId: null,
    // プリフロップ開始時: BBが必ず最後にアクションする締め切り人
    closingPlayerId: buildPreflopOrder(playerIds, 0)[buildPreflopOrder(playerIds, 0).length - 1] ?? null,
  });

  // 履歴スタック（「戻る」用）
  const [history, setHistory] = useState<HandFlowState[]>([]);

  /**
   * そのストリートのアクション順（fold済み・allin済みを除いたアクティブプレイヤーのみ）を返す。
   * currentActorIdx はこのリスト上のインデックスとして管理する。
   */
  const activeOrder = useCallback(
    (s: HandFlowState, order: string[]): string[] => {
      if (s.currentStreet === 'preflop') {
        return order.filter((id) => !s.foldedIds.has(id) && !s.allInIds.has(id));
      }
      return buildPostflopOrder(playerIds, s.foldedIds, s.allInIds);
    },
    [playerIds],
  );

  /** 現在のアクターID */
  const currentActorId = (s: HandFlowState, order: string[]): string | null => {
    const ao = activeOrder(s, order);
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
      return {
        ...newState,
        phase: 'winner',
        showdownQueue: [],
        showdownRecords: [],
      };
    }

    const nextStreetIdx = STREETS.indexOf(currentStreet) + 1;
    // リバー終了 → ショーダウンへ
    if (nextStreetIdx >= STREETS.length) {
      const queue = buildShowdownQueue(newState.streets, playerIds, newState.foldedIds);
      return {
        ...newState,
        phase: 'showdown',
        showdownQueue: queue,
        showdownRecords: [],
      };
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
          const order = activeOrder(prev, preflopOrder);
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

          // straddleをstate外で管理
          setCurrentStraddle(straddleAmount);

          // 新しいpreflopOrderを構築（straddleしたプレイヤーを末尾へ）
          // ストラドルしたアクターの次のプレイヤーから始まり、アクターが最後になる順番
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
          setPreflopOrder(newOrder);

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
            currentBet: straddleAmount,
            pot: newPot,
            currentActorIdx: newActorIdx,
            closingPlayerId: newClosingPlayerId,
            phase: 'action',
          };
        });

        setHistory((h) => [...h, state]);
        return;
      }

      setState((prev) => {
        // アクション前のアクティブ順でアクターを特定
        const order = activeOrder(prev, preflopOrder);
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
        let newBet = prev.currentBet;
        let newPot = prev.pot;

        if (type === 'fold') {
          newFolded.add(actorId);
        } else if (type === 'call') {
          const toCall = callAmount(prev, actorId);
          newContributions[actorId] = prev.currentBet;
          newPot += toCall;
        } else if (type === 'bet' || type === 'raise') {
          const total = amount ?? prev.currentBet;
          const added = total - (newContributions[actorId] ?? 0);
          newContributions[actorId] = total;
          newBet = total;
          newPot += added;
        } else if (type === 'allin') {
          // allin: amount が指定されていればその額、なければプレイヤーのスタック（実効スタック）を使用
          // スタックが未設定(0)の場合は currentBet をフォールバックとして使う
          const playerStack = players.find((p) => p.id === actorId)?.stack ?? 0;
          const fallback = playerStack > 0 ? playerStack : prev.currentBet;
          const total = (amount !== undefined && amount > 0) ? amount : fallback;
          const added = Math.max(0, total - (newContributions[actorId] ?? 0));
          newContributions[actorId] = total;
          if (total > newBet) newBet = total;
          newPot += added;
          newAllIn.add(actorId);
        }
        // check: nothing to update

        // アクション後の（fold除く）アクティブプレイヤーリスト
        const activePlayers = playerIds.filter((id) => !newFolded.has(id));

        // アクション後の新しいorder（fold済み・allin済みを除く）
        const newOrder = prev.currentStreet === 'preflop'
          ? preflopOrder.filter((id) => !newFolded.has(id) && !newAllIn.has(id))
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
        if (type === 'bet' || type === 'raise' || type === 'allin') {
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
          // allin直後: newOrder（まだアクション必要な人のリスト）が空になったら終了
          streetOver = newOrder.length === 0;
        } else {
          // call / fold の後:
          if (newClosingPlayerId !== null) {
            const closingPlayerFolded =
              type === 'fold' && prev.closingPlayerId !== newClosingPlayerId;
            if (closingPlayerFolded) {
              streetOver = lappedEnd && allSquared;
            } else {
              streetOver = actorId === newClosingPlayerId && allSquared;
            }
          } else {
            streetOver = lappedEnd && allSquared;
          }
        }

        const newState: HandFlowState = {
          ...prev,
          streets: newStreets,
          foldedIds: newFolded,
          allInIds: newAllIn,
          contributions: newContributions,
          currentBet: newBet,
          pot: newPot,
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
    [state, activeOrder, preflopOrder, players, playerIds, bigBlind],
  );

  /** ホールカードを確定してアクションフェーズへ */
  const confirmHoleCards = useCallback((card1: Card, card2: Card) => {
    setHistory((h) => [...h, state]);
    setState((prev) => ({ ...prev, holeCards: [card1, card2], phase: 'action' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
   * ショーダウン: 現在のプレイヤーのアクション（show or muck）を記録し次へ
   */
  const commitShowdown = useCallback((record: ShowdownRecord) => {
    setHistory((h) => [...h, state]);
    setState((prev) => {
      const newRecords = [...prev.showdownRecords, record];
      const newQueue = prev.showdownQueue.slice(1);
      if (newQueue.length === 0) {
        // 全員終了 → ウィナー選択へ
        return {
          ...prev,
          showdownRecords: newRecords,
          showdownQueue: [],
          phase: 'winner',
        };
      }
      return {
        ...prev,
        showdownRecords: newRecords,
        showdownQueue: newQueue,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /**
   * ウィナーを確定して done へ
   */
  const confirmWinner = useCallback((winnerId: string) => {
    setHistory((h) => [...h, state]);
    setState((prev) => ({ ...prev, winnerId, phase: 'done' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /** 1手戻る */
  const goBack = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setState(prev);
      return h.slice(0, -1);
    });
  }, []);

  const actorId = currentActorId(state, preflopOrder);
  const actorPlayer = players.find((p) => p.id === actorId) ?? null;
  const toCall = actorId ? callAmount(state, actorId) : 0;

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
    const currentAO = activeOrder(state, preflopOrder);
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
    canStraddle,
    currentStraddle,
    confirmHoleCards,
    commitAction,
    confirmBoard,
    updateBoard,
    commitShowdown,
    confirmWinner,
    goBack,
    players,
    playerIds,
  };
}
