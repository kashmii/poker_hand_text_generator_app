import { useState } from 'react';
import type { SessionConfig, HandData, Action, Card, Rank, Suit } from '../types/poker';
import { POSITION_LABELS_BY_COUNT } from './setup/constants';

import { useHandFlow } from './hand/useHandFlow';
import PokerTable from './hand/PokerTable';
import ActionPanel from './hand/ActionPanel';
import BoardInput from './hand/BoardInput';
import { ShowdownPlayerPanel, WinnerPanel } from './hand/ShowdownPanel';
import type { RecordedAction } from './hand/types';
import { pickRandomCards } from '../utils/randomCard';

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: { value: Suit; label: string; color: string }[] = [
  { value: 'h', label: '♥', color: '#e53e3e' },
  { value: 'd', label: '♦', color: '#e53e3e' },
  { value: 'c', label: '♣', color: 'var(--color-text)' },
  { value: 's', label: '♠', color: 'var(--color-text)' },
];

interface Props {
  session: SessionConfig;
  handNumber: number;
  onSave: (hand: HandData) => void;
  onCancel: () => void;
  onUpdateSession: (patch: Partial<SessionConfig>) => void;
  onViewResult?: () => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

const STREET_LABELS: Record<string, string> = {
  preflop: 'PREFLOP', flop: 'FLOP', turn: 'TURN', river: 'RIVER',
};

export default function HandInput({ session, handNumber, onSave, onCancel, onUpdateSession, onViewResult }: Props) {
  const {
    state,
    actorId,
    actorPlayer,
    toCall,
    canGoBack,
    canStraddle,
    confirmHoleCards,
    commitAction,
    confirmBoard,
    updateBoard,
    commitShowdown,
    goBack,
    players,
  } = useHandFlow(session);

  // ホールカード入力用ローカル state
  const [holeSlot, setHoleSlot] = useState<0 | 1>(0);
  const [holePendingRank, setHolePendingRank] = useState<Rank | null>(null);
  const [holeCards, setHoleCards] = useState<[Card | null, Card | null]>([null, null]);

  const handleHoleSlotClick = (idx: 0 | 1) => {
    setHoleSlot(idx);
    setHolePendingRank(null);
  };

  const handleHoleRank = (r: Rank) => setHolePendingRank(r);

  const handleHoleSuit = (s: Suit) => {
    if (holePendingRank === null) return;
    const card: Card = { rank: holePendingRank, suit: s };
    const next: [Card | null, Card | null] = [...holeCards] as [Card | null, Card | null];
    next[holeSlot] = card;
    setHolePendingRank(null);
    // 両スロット埋まったら自動確定
    if (next[0] && next[1]) {
      confirmHoleCards(next[0], next[1]);
      return;
    }
    setHoleCards(next);
    // 次の空きスロットへ
    if (holeSlot === 0 && next[1] === null) setHoleSlot(1);
    else if (holeSlot === 1 && next[0] === null) setHoleSlot(0);
  };

  const handleHoleClear = (idx: 0 | 1) => {
    const next: [Card | null, Card | null] = [...holeCards] as [Card | null, Card | null];
    next[idx] = null;
    setHoleCards(next);
    setHoleSlot(idx);
    setHolePendingRank(null);
  };

  const cardDisp = (card: Card | null) => {
    if (!card) return null;
    const suit = SUITS.find((s) => s.value === card.suit);
    return { label: `${card.rank}${suit?.label ?? ''}`, color: suit?.color ?? 'var(--color-text)' };
  };

  /** カードを "rank+suit" の文字列に変換 */
  const cardKey = (c: Card) => `${c.rank}${c.suit}`;

  /**
   * ボード入力フェーズで使用済みとみなすカード一覧を計算する。
   * - ヒーローのホールカード
   * - 過去ストリートで確定したボードカード
   */
  const buildBoardUsedCards = (currentStreet: 'flop' | 'turn' | 'river'): Card[] => {
    const used: Card[] = [];
    if (state.holeCards) used.push(...state.holeCards);
    if (currentStreet === 'turn' || currentStreet === 'river') {
      state.boards.flop.forEach((c) => { if (c) used.push(c); });
    }
    if (currentStreet === 'river') {
      state.boards.turn.forEach((c) => { if (c) used.push(c); });
    }
    return used;
  };

  /**
   * ショーダウン時に使用済みとみなすカード一覧。
   * - ヒーローのホールカード
   * - 全ボードカード
   * - これまでのショーダウン記録（show済みのカード）
   */
  const buildShowdownUsedCards = (): Card[] => {
    const used: Card[] = [];
    if (state.holeCards) used.push(...state.holeCards);
    (['flop', 'turn', 'river'] as const).forEach((st) => {
      state.boards[st].forEach((c) => { if (c) used.push(c); });
    });
    state.showdownRecords.forEach((r) => {
      if (r.cards) used.push(...r.cards);
    });
    return used;
  };

  /** ホールカード入力フェーズの使用済みセット */
  const holeUsedSet = new Set<string>(
    holeCards
      .filter((c, i): c is Card => c !== null && i !== holeSlot)
      .map(cardKey)
  );

  const isHoleRankFullyUsed = (r: Rank): boolean =>
    SUITS.every((s) => holeUsedSet.has(`${r}${s.value}`));

  const isHoleSuitUsed = (r: Rank, s: Suit): boolean =>
    holeUsedSet.has(`${r}${s}`);

  const posLabels = POSITION_LABELS_BY_COUNT[players.length] ?? [];
  const actorIdx = players.findIndex((p) => p.id === actorId);
  const actorPositionLabel = actorIdx >= 0 ? posLabels[actorIdx] : '';

  const handleSave = (winnerIdOverride?: string) => {
    const toActions = (arr: RecordedAction[]): Action[] =>
      arr.map((a) => ({ playerId: a.playerId, type: a.type, amount: a.amount }));

    const filterBoard = (cards: (Card | null)[]) =>
      cards.filter((c): c is Card => c !== null);

    // showdown records → ShowdownEntry[]
    const showdownEntries = state.showdownRecords
      .filter((r) => r.action === 'show' && r.cards)
      .map((r) => ({ playerId: r.playerId, cards: r.cards! }));

    // winner
    const effectiveWinnerId = winnerIdOverride ?? state.winnerId;
    const winnerEntries = effectiveWinnerId
      ? [{ playerId: effectiveWinnerId, amount: state.pot }]
      : [];

    const hand: HandData = {
      id: generateId(),
      handNumber,
      dealerPosition: 0,
      streets: {
        preflop: { actions: toActions(state.streets.preflop) },
        ...(state.streets.flop.length > 0 || filterBoard(state.boards.flop).length > 0 ? {
          flop: {
            actions: toActions(state.streets.flop),
            board: filterBoard(state.boards.flop),
          },
        } : {}),
        ...(state.streets.turn.length > 0 || filterBoard(state.boards.turn).length > 0 ? {
          turn: {
            actions: toActions(state.streets.turn),
            board: filterBoard(state.boards.turn),
          },
        } : {}),
        ...(state.streets.river.length > 0 || filterBoard(state.boards.river).length > 0 ? {
          river: {
            actions: toActions(state.streets.river),
            board: filterBoard(state.boards.river),
          },
        } : {}),
      },
      pot: state.pot,
      heroHoleCards: state.holeCards ?? undefined,
      showdown: showdownEntries.length > 0 ? showdownEntries : undefined,
      winners: winnerEntries,
    };
    onSave(hand);
  };

  const isBoardInput = state.phase === 'board-input';
  const isHoleCardsPhase = state.phase === 'hole-cards';
  const isShowdown = state.phase === 'showdown';
  const isWinner = state.phase === 'winner';
  const boardStreet = state.currentStreet as 'flop' | 'turn' | 'river';
  const holeAllFilled = holeCards[0] !== null && holeCards[1] !== null;

  // ショーダウン: 現在対象のプレイヤー
  const currentShowdownPlayerId = state.showdownQueue[0] ?? null;
  const currentShowdownPlayer = players.find((p) => p.id === currentShowdownPlayerId) ?? null;
  const currentShowdownPosLabel = currentShowdownPlayer
    ? posLabels[players.indexOf(currentShowdownPlayer)] ?? ''
    : '';
  const showdownProgress = state.showdownRecords.length;
  const showdownTotal = state.showdownRecords.length + state.showdownQueue.length;

  // ウィナー選択: foldしておらず、muckもしていないプレイヤーのみ
  const muckedPlayerIds = new Set(
    state.showdownRecords
      .filter((r) => r.action === 'muck')
      .map((r) => r.playerId),
  );
  const activePlayers = players.filter(
    (p) => !state.foldedIds.has(p.id) && !muckedPlayerIds.has(p.id),
  );
  const activePosLabels = activePlayers.map((p) => posLabels[players.indexOf(p)] ?? '');

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
              if (confirm('入力中のデータは失われますが、ハンド履歴へ移動しますか？')) {
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
        />
      </div>

      {/* 下半分 */}
      <div className="hand-input-v2__bottom">
        {isHoleCardsPhase && !session.heroPosition ? (
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

        ) : isHoleCardsPhase ? (
          /* ホールカード入力 */
          <div className="board-input-wrap">
            <div className="board-input__title">
              ホールカード
              {import.meta.env.DEV && (
                <button
                  type="button"
                  className="rndm-btn"
                  onClick={() => {
                    const filled = holeCards.filter((c): c is Card => c !== null);
                    const need = holeCards.filter((c) => c === null).length;
                    const picked = pickRandomCards(filled, need);
                    const next: [Card | null, Card | null] = [...holeCards] as [Card | null, Card | null];
                    let pi = 0;
                    next.forEach((c, i) => { if (c === null && pi < picked.length) next[i] = picked[pi++]; });
                    setHolePendingRank(null);
                    // 両スロット埋まったら自動確定
                    if (next[0] && next[1]) {
                      confirmHoleCards(next[0], next[1]);
                    } else {
                      setHoleCards(next);
                    }
                  }}
                  disabled={holeAllFilled}
                >
                  rndm
                </button>
              )}
            </div>

            <div className="board-input__slots">
              {([0, 1] as const).map((idx) => {
                const disp = cardDisp(holeCards[idx]);
                const isActive = holeSlot === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`board-slot ${isActive ? 'board-slot--active' : ''} ${holeCards[idx] ? 'board-slot--filled' : ''}`}
                    onClick={() => handleHoleSlotClick(idx)}
                  >
                    {disp ? (
                      <>
                        <span className="board-slot__card" style={{ color: disp.color }}>{disp.label}</span>
                        <span
                          className="board-slot__clear"
                          role="button"
                          onClick={(e) => { e.stopPropagation(); handleHoleClear(idx); }}
                        >×</span>
                      </>
                    ) : (
                      <span className="board-slot__empty">{idx + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="board-picker-panel">
              <div className="board-picker__ranks">
                {RANKS.map((r) => {
                  const fullyUsed = isHoleRankFullyUsed(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      className={`rank-btn ${holePendingRank === r ? 'rank-btn--active' : ''} ${fullyUsed ? 'rank-btn--used' : ''}`}
                      onClick={() => { if (!fullyUsed) handleHoleRank(r); }}
                      disabled={fullyUsed}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
              {/* スーツ選択（ランク選択後にアクティブ化） */}
              <div className={`board-picker__suits ${holePendingRank ? 'board-picker__suits--active' : ''}`}>
                {SUITS.map((s) => {
                  const used = holePendingRank ? isHoleSuitUsed(holePendingRank, s.value) : false;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      className={`suit-btn suit-btn--large ${used ? 'suit-btn--used' : ''}`}
                      style={{ color: used ? '#4b5563' : s.color }}
                      onClick={() => { if (holePendingRank) handleHoleSuit(s.value); }}
                      disabled={!holePendingRank || used}
                      tabIndex={holePendingRank ? 0 : -1}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="board-input__actions">
              <button
                type="button"
                className="btn-secondary board-input__back"
                onClick={() => onUpdateSession({ heroPosition: '', heroId: players[0]?.id ?? '' })}
              >
                ← 戻る
              </button>
            </div>
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
                ← 1手戻る
              </button>
            )}
          </div>

        ) : isWinner ? (
          /* ウィナー選択 */
          <WinnerPanel
            activePlayers={activePlayers}
            positionLabels={activePosLabels}
            pot={state.pot}
            currency={session.currency}
            showdownRecords={state.showdownRecords}
            onConfirm={(id) => handleSave(id)}
          />

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
            canGoBack={canGoBack}
            canStraddle={canStraddle}
            straddleAmount={state.currentBet * 2}
            onAction={commitAction}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  );
}
