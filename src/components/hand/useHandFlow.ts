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
 */
export function buildPostflopOrder(playerIds: string[], foldedIds: Set<string>): string[] {
  const count = playerIds.length;
  const order: string[] = [];
  // SB(index=1)から始めてBTN(0)で終わる
  for (let i = 1; i < count; i++) {
    if (!foldedIds.has(playerIds[i])) order.push(playerIds[i]);
  }
  if (!foldedIds.has(playerIds[0])) order.push(playerIds[0]);
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

  /**
   * プリフロップの初期 closingActorIdx を計算する。
   * BB（preflopOrder の末尾）が必ずアクションを持つため、
   * BB の activeOrder 上のインデックス = preflopOrder.length - 1（fold なし時）。
   */
  const initClosingActorIdx = (): number => {
    // プリフロップ開始時は全員アクティブなので preflopOrder の末尾インデックス
    return preflopOrder.length - 1;
  };

  const [state, setState] = useState<HandFlowState>({
    currentStreet: 'preflop',
    streets: emptyStreets(),
    boards: emptyBoards(),
    currentActorIdx: 0,
    foldedIds: new Set(),
    currentBet: straddle > 0 ? straddle : bigBlind,
    contributions: initContributions(),
    pot: smallBlind + bigBlind + straddle,
    phase: 'hole-cards',
    holeCards: null,
    showdownQueue: [],
    showdownRecords: [],
    winnerId: null,
    closingActorIdx: initClosingActorIdx(),
  });

  // 履歴スタック（「戻る」用）
  const [history, setHistory] = useState<HandFlowState[]>([]);

  /**
   * そのストリートのアクション順（fold済みを除いたアクティブプレイヤーのみ）を返す。
   * currentActorIdx はこのリスト上のインデックスとして管理する。
   */
  const activeOrder = useCallback(
    (s: HandFlowState): string[] => {
      if (s.currentStreet === 'preflop') {
        return preflopOrder.filter((id) => !s.foldedIds.has(id));
      }
      return buildPostflopOrder(playerIds, s.foldedIds);
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
    active: string[],
    currentStreet: Street,
  ): HandFlowState => {
    // アクティブ1人以下 → showdownなし（fold勝ち）→ winner選択へ
    if (active.length <= 1) {
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
    // postflop は check ラウンドから始まるので closingActorIdx = -1（lappedEnd で判定）
    const nextStreet = STREETS[nextStreetIdx];
    return {
      ...newState,
      phase: 'board-input',
      currentStreet: nextStreet,
      currentActorIdx: 0,
      currentBet: 0,
      contributions: Object.fromEntries(playerIds.map((id) => [id, 0])),
      closingActorIdx: -1,
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
        let newContributions = { ...prev.contributions };
        let newBet = prev.currentBet;
        let newPot = prev.pot;

        if (type === 'fold') {
          newFolded.add(actorId);
        } else if (type === 'call') {
          const toCall = callAmount(prev, actorId);
          newContributions[actorId] = prev.currentBet;
          newPot += toCall;
        } else if (type === 'bet' || type === 'raise' || type === 'allin') {
          const total = amount ?? prev.currentBet;
          const added = total - (newContributions[actorId] ?? 0);
          newContributions[actorId] = total;
          newBet = total;
          newPot += added;
        }
        // check: nothing to update

        // アクション後のアクティブプレイヤーリスト
        const active = playerIds.filter((id) => !newFolded.has(id));

        // アクション後の新しいorder（foldした場合はactorIdが除かれる）
        const newOrder = prev.currentStreet === 'preflop'
          ? preflopOrder.filter((id) => !newFolded.has(id))
          : buildPostflopOrder(playerIds, newFolded);

        // ---- 次のインデックス計算 ----
        // fold: リストが1人縮むので同じ位置インデックスで次の人が来る（% で境界を守る）。
        // それ以外: +1 して末尾を超えたら 0 に折り返す。
        let newActorIdx: number;
        if (type === 'fold') {
          newActorIdx = newOrder.length > 0 ? prev.currentActorIdx % newOrder.length : 0;
        } else {
          newActorIdx = (prev.currentActorIdx + 1) % Math.max(newOrder.length, 1);
        }

        // ---- closingActorIdx の更新 ----
        // bet/raise/allin: ベットしたプレイヤーが新しい「締め切り」になる。
        //   newOrder 上でのベッターのインデックスが新しい closingActorIdx。
        // それ以外: closingActorIdx はそのまま維持（ただし fold でリストが縮む場合は調整）。
        let newClosingActorIdx = prev.closingActorIdx;
        if (type === 'bet' || type === 'raise' || type === 'allin') {
          // ベッター自身が新しい締め切り基準
          newClosingActorIdx = newOrder.indexOf(actorId);
          if (newClosingActorIdx < 0) newClosingActorIdx = newOrder.length - 1;
        } else if (type === 'fold' && prev.closingActorIdx >= 0) {
          // fold でリストが1つ縮むとき、締め切りインデックスも調整する。
          // fold したアクターの元インデックス (prev.currentActorIdx) より前の人が fold した場合は
          // closingActorIdx が1ずれる可能性がある。
          // 簡単な方法: newOrder での締め切りプレイヤーのインデックスを再計算。
          const closingPlayerId = order[prev.closingActorIdx];
          if (closingPlayerId) {
            const newClosingIdx = newOrder.indexOf(closingPlayerId);
            newClosingActorIdx = newClosingIdx >= 0 ? newClosingIdx : newOrder.length - 1;
          } else {
            // 締め切りプレイヤー自身がfoldした場合はリストの末尾を新たな締め切りとする
            newClosingActorIdx = newOrder.length - 1;
          }
        }

        // ---- ストリート終了判定 ----
        //
        // rawIdx: アクション後の「次に進もうとしているインデックス（折り返し前）」
        //   fold の場合は位置はそのまま (prev.currentActorIdx)、
        //   それ以外は +1 した値。
        const rawIdx = type === 'fold' ? prev.currentActorIdx : prev.currentActorIdx + 1;
        const lappedEnd = rawIdx >= newOrder.length;

        const allSquared = active.every((id) => newContributions[id] >= newBet);

        let streetOver: boolean;
        if (active.length <= 1) {
          // アクティブが1人以下: 全員fold → fold勝ち
          streetOver = true;
        } else if (newBet === 0) {
          // ベットなし（全員checkのみ）のラウンド:
          // order の末尾を一周通過した = 全員checkした
          // closingActorIdx が -1 のとき（postflop 開始時など）はこちらで判定
          streetOver = lappedEnd;
        } else if (type === 'bet' || type === 'raise' || type === 'allin') {
          // bet/raise/allin の直後:
          // betアクターが newOrder の最後にいるなら（afterBetRaw >= length）、
          // かつ全員揃っていれば終了（全員が既にcallしていたケース）。
          const actorNewIdx = newOrder.indexOf(actorId);
          const afterBetRaw = actorNewIdx >= 0 ? actorNewIdx + 1 : newOrder.length;
          streetOver = afterBetRaw >= newOrder.length && allSquared;
        } else {
          // call / fold の後:
          // 「rawIdx が closingActorIdx を超えた」= 締め切りプレイヤーを通過した
          // かつ全員のcontributionがcurrentBetに揃っていれば終了。
          //
          // closingActorIdx >= 0: bet/raise が起きたストリート（プリフロップ含む）
          //   → rawIdx > newClosingActorIdx で締め切り通過を判定
          // closingActorIdx < 0: check ラウンド（通常は newBet===0 で上で処理済み）
          //   → lappedEnd で判定（フォールバック）
          if (newClosingActorIdx >= 0) {
            streetOver = rawIdx > newClosingActorIdx && allSquared;
          } else {
            streetOver = lappedEnd && allSquared;
          }
        }

        const newState: HandFlowState = {
          ...prev,
          streets: newStreets,
          foldedIds: newFolded,
          contributions: newContributions,
          currentBet: newBet,
          pot: newPot,
          currentActorIdx: newActorIdx,
          closingActorIdx: newClosingActorIdx,
          phase: 'action',
        };

        if (streetOver) {
          return resolveStreetEnd(newState, active, prev.currentStreet);
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

  /** ボードカード確定してアクションフェーズへ */
  const confirmBoard = useCallback(() => {
    setHistory((h) => [...h, state]);
    setState((prev) => ({ ...prev, phase: 'action' }));
  }, [state]);

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
