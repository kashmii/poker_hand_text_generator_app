import { useState, useMemo } from 'react';
import type { SessionConfig, ActionType, BoardStreet, Card } from '../../types/poker';
import type { ShowdownRecord } from './types';
import { computeSidePots } from '../../utils/sidePots';
import {
  handFlowReducer,
  createInitialState,
  currentActorId,
  callAmount,
  canStraddle,
  currentPotView,
  type HandFlow,
  type HandFlowContext,
  type HandFlowEvent,
} from './handFlowReducer';

/**
 * ショーダウンの勝者を手札評価で自動確定するか（チョップ含む）。
 * true: ボード5枚＋候補全員の手札が揃っていれば「ポットの勝者を選択」画面を出さずに確定する。
 * false: 従来どおり毎回 WinnerPanel で勝者を選ぶ（自動判定は初期選択として出るだけ）。
 * 手動に戻すときはここを false にする（フックの options.autoResolve でも上書きできる）。
 */
export const AUTO_RESOLVE_WINNERS = true;

/**
 * ハンド1件の進行を管理するフック。進行ロジックは handFlowReducer（純粋関数）にあり、
 * ここは state と「1つ戻る」用の履歴を保持して操作を reducer へ流すだけ。
 */
export function useHandFlow(
  session: SessionConfig,
  options: { autoResolve?: boolean } = {},
) {
  const autoResolve = options.autoResolve ?? AUTO_RESOLVE_WINNERS;
  const { players } = session;

  const ctx = useMemo<HandFlowContext>(
    () => ({ players, playerIds: players.map((p) => p.id), autoResolve }),
    [players, autoResolve],
  );
  const { playerIds } = ctx;

  const [flow, setFlow] = useState<HandFlow>(() => ({
    state: createInitialState(session),
    history: [],
  }));
  const { state, history } = flow;

  const actions = useMemo(() => {
    const dispatch = (event: HandFlowEvent) =>
      setFlow((f) => handFlowReducer(f, event, ctx));
    return {
      /** 手札入力画面からアクションフェーズへ進む（スキップ/入力完了で呼ぶ） */
      startAction: () => dispatch({ type: 'start-action' }),
      /** 1人目のアクション入力から手札入力画面へ戻る（履歴が空のときだけ） */
      backToHoleCards: () => dispatch({ type: 'back-to-hole-cards' }),
      /**
       * 手札を後から設定/クリアする。フェーズは進めない（ボード先行入力メモと同じ思想）。
       * ペアが揃っていないときは null を渡してクリアする。
       */
      setHoleCards: (cards: [Card, Card] | null) => dispatch({ type: 'set-hole-cards', cards }),
      /** アクションを実行 */
      commitAction: (actionType: ActionType, amount?: number) =>
        dispatch({ type: 'commit-action', actionType, amount }),
      /** ボードカード確定してアクションフェーズへ（アクション可能者がいない場合は次のボード入力へ） */
      confirmBoard: () => dispatch({ type: 'confirm-board' }),
      /** ボードカードを更新 */
      updateBoard: (street: BoardStreet, idx: number, card: Card | null) =>
        dispatch({ type: 'update-board', street, idx, card }),
      /** ショーダウン: 現在のプレイヤーの show / muck を記録し次へ */
      commitShowdown: (record: ShowdownRecord) => dispatch({ type: 'commit-showdown', record }),
      /** 現在のポットの勝者を確定し、次の（下位）ポットへ進む（複数ならチョップ） */
      confirmPotWinner: (winnerIds: string[]) => dispatch({ type: 'confirm-pot-winner', winnerIds }),
      /** 1手戻る */
      goBack: () => dispatch({ type: 'go-back' }),
    };
  }, [ctx]);

  const actorId = currentActorId(state, playerIds);
  const actorPlayer = players.find((p) => p.id === actorId) ?? null;
  const toCall = actorId ? callAmount(state, actorId) : 0;

  // メイン/サイドポットの構成（通算拠出額から算出）。参照用。
  const { pots: sidePots } = computeSidePots(
    state.totalContributions,
    state.foldedIds,
    playerIds,
  );

  return {
    state,
    history,
    actorId,
    actorPlayer,
    toCall,
    canGoBack: history.length > 0,
    canBackToHoleCards: history.length === 0 && state.phase === 'action',
    canStraddle: canStraddle(state, playerIds),
    currentStraddle: state.currentStraddle,
    ...actions,
    players,
    playerIds,
    sidePots,
    ...currentPotView(state),
  };
}
