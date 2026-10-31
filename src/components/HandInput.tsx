import { useState, useEffect, useRef } from 'react';
import type { SessionConfig, HandData, Action, BoardStreet, Card, Street } from '../types/poker';
import { positionLabels } from '../utils/positions';

import { useHandFlow } from './hand/useHandFlow';
import { muckedIdsOf } from './hand/handFlowReducer';
import PokerTable from './hand/PokerTable';
import ActionPanel from './hand/ActionPanel';
import BoardInput from './hand/BoardInput';
import CardPickerPanel from './hand/CardPickerPanel';
import { ShowdownPlayerPanel, WinnerPanel, HandEndPanel } from './hand/ShowdownPanel';
import type { WinnerEntry } from './hand/ShowdownPanel';
import type { RecordedAction } from './hand/types';
import { fillRandomCards } from '../utils/randomCard';
import { cardKey, filledCards } from '../utils/card';
import { BOARD_STREETS } from '../utils/streets';
import { reachedBoards } from '../utils/reachedBoards';
import { uuid } from '../utils/uuid';
import { computeHeroResult } from '../utils/computeHeroResult';
import { EMPTY_PART, isCompleteCard, type PartialCard } from '../utils/cardPick';

interface Props {
  session: SessionConfig;
  handNumber: number;
  onSave: (hand: HandData) => void;
  onCancel: () => void;
  onUpdateSession: (patch: Partial<SessionConfig>) => void;
  onViewResult?: () => void;
}

function generateId() {
  // DBの主キーにそのまま使い、再送しても二重登録にならないよう全ユーザーで一意なUUIDにする
  return uuid();
}

const STREET_LABELS: Record<Street, string> = {
  preflop: 'PREFLOP', flop: 'FLOP', turn: 'TURN', river: 'RIVER',
};

/** ボードメモの5スロットと、書き込み先（ストリート・インデックス）の対応 */
const MEMO_SLOTS: [BoardStreet, number][] = [['flop', 0], ['flop', 1], ['flop', 2], ['turn', 0], ['river', 0]];

export default function HandInput({ session, handNumber, onSave, onCancel, onUpdateSession, onViewResult }: Props) {
  const {
    state,
    actorId,
    actorPlayer,
    toCall,
    canGoBack,
    canBackToHoleCards,
    backToHoleCards,
    canStraddle,
    startAction,
    setHoleCards: commitHoleCards,
    commitAction,
    confirmBoard,
    updateBoard,
    commitShowdown,
    confirmPotWinner,
    goBack,
    players,
    currentPot,
    currentPotCandidates,
    currentPotSuggestion,
  } = useHandFlow(session);

  // ホールカード入力用ローカル state: 2枠の入力状態（ランクだけ・スーツだけの入力途中も含む）
  const [holeSlots, setHoleSlots] = useState<PartialCard[]>([EMPTY_PART, EMPTY_PART]);
  const holeCards = holeSlots.map((s) => (isCompleteCard(s) ? s : null)) as [Card | null, Card | null];

  // ボード先行入力メモを開いているか
  const [memoOpen, setMemoOpen] = useState(false);
  // 手札の後入力パネルを開いているか
  const [holeMemoOpen, setHoleMemoOpen] = useState(false);

  /** 手札後入力パネルを開く。現在の手札（state）を編集バッファへ読み込む */
  const openHoleMemo = () => {
    setHoleSlots(state.holeCards ? [state.holeCards[0], state.holeCards[1]] : [EMPTY_PART, EMPTY_PART]);
    setMemoOpen(false);
    setHoleMemoOpen(true);
  };

  /** 手札の枠が変わったとき。2枚そろえばエンジンへ反映し、初期入力画面ならアクションへ進む */
  const updateHoleSlots = (next: PartialCard[]) => {
    setHoleSlots(next);
    const [c0, c1] = next;
    if (isCompleteCard(c0) && isCompleteCard(c1)) {
      commitHoleCards([c0, c1]);
      // 後入力パネルはフェーズを進めずに開いたまま
      if (!holeMemoOpen) startAction();
    }
  };

  const handleHoleSlotChange = (idx: number, slot: PartialCard) =>
    updateHoleSlots(holeSlots.map((p, i) => (i === idx ? slot : p)));

  // 1枚だけ空にする。ペアが崩れるのでエンジン側の手札もクリア
  const handleHoleRemove = (idx: number) => {
    setHoleSlots(holeSlots.map((p, i) => (i === idx ? EMPTY_PART : p)));
    commitHoleCards(null);
  };

  // 2枚とも空にして入力し直す
  const handleHoleClearAll = () => {
    setHoleSlots([EMPTY_PART, EMPTY_PART]);
    commitHoleCards(null);
  };

  /** ボードに入力済みのカード（先行入力メモで入れた未到達ストリートの分も含む） */
  const boardCards = BOARD_STREETS.flatMap((st) => filledCards(state.boards[st]));
  /** ホールカード入力フェーズの使用済みセット（先行入力メモのボードカードも含む） */
  const holeUsedSet = new Set<string>(boardCards.map(cardKey));

  /** ヒーローのホールカード（ホールカード入力中は入力済みの分） */
  const buildHeroUsedCards = (): Card[] =>
    state.holeCards ? [...state.holeCards] : filledCards(holeCards);

  /**
   * ボード入力（通常フェーズ・先行入力メモ）で使用済みとみなすカード一覧を計算する。
   * - ヒーローのホールカード（ホールカード入力中は入力済みの分）
   * - 他ストリートのボードカード（先行入力メモで入れた未到達ストリートの分も含む）
   */
  const buildBoardUsedCards = (currentStreet: BoardStreet): Card[] => {
    const otherBoards = BOARD_STREETS.filter((st) => st !== currentStreet)
      .flatMap((st) => filledCards(state.boards[st]));
    return [...buildHeroUsedCards(), ...otherBoards];
  };

  /**
   * ショーダウン時に使用済みとみなすカード一覧。
   * - ヒーローのホールカード
   * - 全ボードカード
   * - これまでのショーダウン記録（show済みのカード）
   */
  const buildShowdownUsedCards = (): Card[] => [
    ...(state.holeCards ?? []),
    ...boardCards,
    ...state.showdownRecords.flatMap((r) => r.cards ?? []),
  ];

  const posLabels = positionLabels(players.length);
  const actorIdx = players.findIndex((p) => p.id === actorId);
  const actorPositionLabel = actorIdx >= 0 ? posLabels[actorIdx] : '';

  const handleSave = (winnerEntriesArg?: WinnerEntry[]) => {
    const toActions = (arr: RecordedAction[]): Action[] =>
      arr.map((a) => ({ playerId: a.playerId, type: a.type, amount: a.amount }));

    // 先行入力メモで入れた未到達ストリートのボードは保存しない
    const boards = reachedBoards(state.boards, state.currentStreet);

    // showdown records → ShowdownEntry[]
    const showdownEntries = state.showdownRecords
      .filter((r) => r.action === 'show' && r.cards)
      .map((r) => ({ playerId: r.playerId, cards: r.cards! }));

    // winner（ポット毎のエントリ。サイドポットがある場合は label 付き）
    const winnerEntries = winnerEntriesArg ?? [];

    const hand: HandData = {
      id: generateId(),
      handNumber,
      dealerPosition: 0,
      streets: {
        preflop: { actions: toActions(state.streets.preflop) },
        ...(state.streets.flop.length > 0 || filledCards(boards.flop).length > 0 ? {
          flop: {
            actions: toActions(state.streets.flop),
            board: filledCards(boards.flop),
          },
        } : {}),
        ...(state.streets.turn.length > 0 || filledCards(boards.turn).length > 0 ? {
          turn: {
            actions: toActions(state.streets.turn),
            board: filledCards(boards.turn),
          },
        } : {}),
        ...(state.streets.river.length > 0 || filledCards(boards.river).length > 0 ? {
          river: {
            actions: toActions(state.streets.river),
            board: filledCards(boards.river),
          },
        } : {}),
      },
      pot: state.pot,
      heroHoleCards: state.holeCards ?? undefined,
      showdown: showdownEntries.length > 0 ? showdownEntries : undefined,
      winners: winnerEntries,
      session: { ...session },
    };
    hand.heroResult = computeHeroResult(hand) ?? undefined;
    onSave(hand);
  };

  // カスケード解決が完了（phase 'done'）したら、確定したポット勝者で保存する。
  const savedRef = useRef(false);
  useEffect(() => {
    if (state.phase === 'done' && !savedRef.current) {
      savedRef.current = true;
      handleSave(state.potWinners);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const isBoardInput = state.phase === 'board-input';
  const isHoleCardsPhase = state.phase === 'hole-cards';
  const isShowdown = state.phase === 'showdown';
  const isWinner = state.phase === 'winner';
  const boardStreet = state.currentStreet as BoardStreet;
  const holeAllFilled = holeCards[0] !== null && holeCards[1] !== null;

  const boardFilledCount = boardCards.length;
  const memoCards = MEMO_SLOTS.map(([st, i]) => state.boards[st][i]);
  const canOpenMemo = state.phase !== 'done';

  // ショーダウン: 現在対象のプレイヤー
  const currentShowdownPlayerId = state.showdownQueue[0] ?? null;
  const currentShowdownPlayer = players.find((p) => p.id === currentShowdownPlayerId) ?? null;
  const currentShowdownPosLabel = currentShowdownPlayer
    ? posLabels[players.indexOf(currentShowdownPlayer)] ?? ''
    : '';
  const showdownProgress = state.showdownRecords.length;
  const showdownTotal = state.showdownRecords.length + state.showdownQueue.length;

  // ウィナー選択: foldしておらず、muckもしていないプレイヤーのみ
  const muckedPlayerIds = muckedIdsOf(state.showdownRecords);
  const activePlayers = players.filter(
    (p) => !state.foldedIds.has(p.id) && !muckedPlayerIds.has(p.id),
  );
  const activePosLabels = activePlayers.map((p) => posLabels[players.indexOf(p)] ?? '');

  // 生き残りが1人なら勝者は決まっているので、勝者選択の代わりにハンド終了の確認だけ出す
  const soleWinnerId = isWinner && activePlayers.length === 1 ? activePlayers[0].id : null;

  // 手札入力の DEV ランダム入力ボタン（初期入力画面・後入力パネルで共用）
  const holeRndmBtn = import.meta.env.DEV ? (
    <button
      type="button"
      className="rndm-btn"
      onClick={() => updateHoleSlots(fillRandomCards(holeCards, boardCards).map((c) => c ?? EMPTY_PART))}
      disabled={holeAllFilled}
    >
      rndm
    </button>
  ) : null;

  // 手札入力の枠＋ランク/スーツピッカー（初期入力画面・後入力パネルで共用）
  const holePickerBody = (
    <CardPickerPanel
      slots={holeSlots}
      usedSet={holeUsedSet}
      onSlotChange={handleHoleSlotChange}
      onClear={handleHoleClearAll}
      onRemove={handleHoleRemove}
    />
  );

  return (
    <div className="hand-input-v2">
      {/* ヘッダー */}
      <div className="hand-input-v2__header">
        <button type="button" className="btn-back" onClick={onCancel}>← 戻る</button>
        <span className="hand-input-v2__title">Hand #{handNumber}</span>
        <span className="hand-input-v2__street">{STREET_LABELS[state.currentStreet]}</span>
        {onViewResult && (
          <button
            type="button"
            className="btn-view-result"
            onClick={() => {
              if (confirm('入力中のデータは失われますが、ハンド一覧へ移動しますか？')) {
                onViewResult();
              }
            }}
          >
            📋
          </button>
        )}
      </div>

      {/* 上半分: テーブル図 */}
      <div className="hand-input-v2__table">
        <PokerTable
          players={players}
          state={state}
          actorId={(state.phase === 'board-input' || state.phase === 'hole-cards') ? null : actorId}
          heroId={session.heroId}
          onBoardClick={canOpenMemo ? () => setMemoOpen(true) : undefined}
        />
        {/* ボード先行入力メモの入口（ボード5枠のタップでも開く） */}
        {canOpenMemo && (
          <button
            type="button"
            className={`btn-board-memo ${memoOpen ? 'btn-board-memo--active' : ''}`}
            onClick={() => setMemoOpen((v) => !v)}
          >
            🃏 ボード入力{boardFilledCount > 0 ? ` ${boardFilledCount}/5` : ''}
          </button>
        )}
        {/* 手札の後入力の入口（手札入力フェーズ中は入力画面があるので出さない） */}
        {canOpenMemo && !isHoleCardsPhase && (
          <button
            type="button"
            className={`btn-hole-memo ${holeMemoOpen ? 'btn-hole-memo--active' : ''}`}
            onClick={() => (holeMemoOpen ? setHoleMemoOpen(false) : openHoleMemo())}
          >
            🂠 手札入力{state.holeCards ? ' ✓' : ''}
          </button>
        )}
      </div>

      {/* 下半分 */}
      <div className="hand-input-v2__bottom">
        {memoOpen ? (
          /* ボード先行入力メモ: 5枚をまとめて入力し、本番の state.boards に直接書き込む（phase は進めない） */
          <BoardInput
            title="ボードをメモ"
            titleExtra={
              <button type="button" className="board-memo__close" onClick={() => setMemoOpen(false)}>
                ✕
              </button>
            }
            cards={memoCards}
            groupStarts={[3, 4]}
            usedCards={buildHeroUsedCards()}
            onCardChange={(idx, card) => updateBoard(MEMO_SLOTS[idx][0], MEMO_SLOTS[idx][1], card)}
            onConfirm={() => setMemoOpen(false)}
            confirmLabel="閉じる"
          />

        ) : isHoleCardsPhase && !session.heroPosition ? (
          /* ポジション選択フェーズ */
          <div className="hero-position-panel">
            <div className="board-input__title">自分のポジションを選択</div>
            <div className="hero-position-btns">
              {/* 表示順: BB, SB, BTN, CO, HJ, MP, UTG+2, UTG+1, UTG（直感的な選びやすい順） */}
              {(() => {
                const displayOrder = ['BB', 'SB', 'BTN', 'SB/BTN', 'CO', 'HJ', 'MP', 'UTG+2', 'UTG+1', 'UTG'];
                const sorted = [
                  ...displayOrder.filter((l) => posLabels.includes(l)),
                  ...posLabels.filter((l) => !displayOrder.includes(l)),
                ];
                return sorted.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="hero-pos-btn"
                    onClick={() => {
                      const newHeroIdx = posLabels.indexOf(label);
                      const newHeroId = players[newHeroIdx]?.id ?? players[0].id;
                      onUpdateSession({ heroPosition: label, heroId: newHeroId });
                    }}
                  >
                    {label}
                  </button>
                ));
              })()}
            </div>
          </div>

        ) : holeMemoOpen ? (
          /* 手札の後入力: state.holeCards へ直接書き込む（phase は進めない） */
          <div className="board-input-wrap">
            <div className="board-input__title">
              手札入力
              {holeRndmBtn}
              <button type="button" className="board-memo__close" onClick={() => setHoleMemoOpen(false)}>
                ✕
              </button>
            </div>
            {holePickerBody}
            <div className="board-input__actions">
              <button
                type="button"
                className="btn-primary board-input__confirm"
                onClick={() => setHoleMemoOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>

        ) : isHoleCardsPhase ? (
          /* 手札入力（初期）: 2枚入れると自動でアクションへ。スキップで手札なしのまま進める */
          <div className="board-input-wrap">
            <div className="board-input__title">
              手札入力
              {holeRndmBtn}
              <button
                type="button"
                className="board-input__back-top"
                onClick={() => onUpdateSession({ heroPosition: '', heroId: players[0]?.id ?? '' })}
              >
                ← 戻る
              </button>
              <button type="button" className="board-input__skip-top" onClick={startAction}>
                スキップ
              </button>
            </div>
            {holePickerBody}
          </div>

        ) : isShowdown && currentShowdownPlayer ? (
          /* ショーダウン */
          <div>
            <div className="showdown-progress">
              ショーダウン {showdownProgress + 1} / {showdownTotal}
            </div>
            <ShowdownPlayerPanel
              key={currentShowdownPlayerId}
              player={currentShowdownPlayer}
              positionLabel={currentShowdownPosLabel}
              usedCards={buildShowdownUsedCards()}
              presetCards={
                currentShowdownPlayerId === session.heroId && state.holeCards
                  ? state.holeCards
                  : undefined
              }
              onCommit={commitShowdown}
            />
            {canGoBack && (
              <button type="button" className="action-back-btn" onClick={goBack}>
                ← 1つ戻る
              </button>
            )}
          </div>

        ) : isWinner ? (
          /* ウィナー選択（生き残りが1人ならハンド終了の確認） */
          soleWinnerId ? (
            <HandEndPanel
              winnerPositionLabel={activePosLabels[0]}
              pot={state.pot}
              currency={session.currency}
              onConfirm={() => handleSave([{ playerId: soleWinnerId, amount: state.pot }])}
              onBack={canGoBack ? goBack : undefined}
            />
          ) : currentPot ? (
            <WinnerPanel
              key={`${currentPot.label}-${state.potResolveIdx}`}
              pot={currentPot}
              candidateIds={currentPotCandidates}
              potCount={state.pots.length}
              hasNextPot={state.potResolveIdx > 0}
              players={players}
              positionLabels={posLabels}
              currency={session.currency}
              showdownRecords={state.showdownRecords}
              suggestion={currentPotSuggestion}
              onConfirm={confirmPotWinner}
              onBack={canGoBack ? goBack : undefined}
            />
          ) : null

        ) : isBoardInput ? (
          /* ボード入力 */
          <BoardInput
            key={boardStreet}
            street={boardStreet}
            cards={state.boards[boardStreet]}
            usedCards={buildBoardUsedCards(boardStreet)}
            onCardChange={(idx, card) => updateBoard(boardStreet, idx, card)}
            onConfirm={confirmBoard}
            onBack={canGoBack ? goBack : undefined}
          />

        ) : (
          /* アクション入力 */
          <ActionPanel
            actorPlayer={actorPlayer}
            actorPositionLabel={actorPositionLabel}
            toCall={toCall}
            currentBet={state.currentBet}
            pot={state.pot}
            currency={session.currency}
            canGoBack={canGoBack || canBackToHoleCards}
            canStraddle={canStraddle}
            straddleAmount={state.currentBet * 2}
            onAction={commitAction}
            onBack={canGoBack ? goBack : backToHoleCards}
          />
        )}
      </div>
    </div>
  );
}
