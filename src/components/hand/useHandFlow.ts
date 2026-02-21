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
  // 3人以上: index 3(UTG)から始まって一周し、SB(1)、BB(2) で終わる
  const order: string[] = [];
  for (let i = 3; i < count; i++) order.push(playerIds[i]);
  order.push(playerIds[0]); // BTN
  order.push(playerIds[1]); // SB
  if (straddle > 0) {
    // ストラドルあり: BB が先行投資済みなので UTG 扱いで BB を最後に
    order.push(playerIds[2]); // BB (ストラドル有りのとき最後)
  } else {
    order.push(playerIds[2]); // BB
  }
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
  const { players, straddle, smallBlind, bigBlind } = session;
  const playerIds = players.map((p) => p.id);

  // プリフロップのアクション順
  const preflopOrder = buildPreflopOrder(playerIds, straddle);

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
    currentBet: straddle > 0 ? straddle : bigBlind,
    contributions: initContributions(),
    pot: smallBlind + bigBlind + straddle,
    phase: 'hole-cards',
    holeCards: null,
    showdownQueue: [],
    showdownRecords: [],
    winnerId: null,
    // プリフロップ開始時: BBが必ず最後にアクションする締め切り人
    closingPlayerId: preflopOrder[preflopOrder.length - 1] ?? null,
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
        return preflopOrder.filter((id) => !s.foldedIds.has(id) && !s.allInIds.has(id));
      }
      return buildPostflopOrder(playerIds, s.foldedIds, s.allInIds);
    },
    [preflopOrder, playerIds],
  );

  /** 現在のアクターID */
  const currentActorId = (s: HandFlowState): string | null => {
    const order = activeOrder(s);
    return order[s.currentActorIdx] ?? null;
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
          const playerStack = players.find((p) => p.id === actorId)?.stack ?? 0;
          const total = amount ?? Math.max(playerStack, prev.currentBet);
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
            // allinでnewOrderから除かれた場合: newOrderの末尾が締め切り人
            newClosingPlayerId = newOrder[newOrder.length - 1] ?? null;
          }
        } else if ((type === 'fold' || type === 'allin') && prev.closingPlayerId !== null) {
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
    [state, activeOrder, preflopOrder, players, playerIds],
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

  const actorId = currentActorId(state);
  const actorPlayer = players.find((p) => p.id === actorId) ?? null;
  const toCall = actorId ? callAmount(state, actorId) : 0;

  return {
    state,
    history,
    actorId,
    actorPlayer,
    toCall,
    canGoBack: history.length > 0,
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
