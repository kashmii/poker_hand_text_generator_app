import { useState } from 'react';
import type { Card, Suit, Player } from '../../types/poker';
import type { ShowdownRecord } from './types';
import { fillRandomCards } from '../../utils/randomCard';
import { cardKey, cardLabel } from '../../utils/card';
import type { Pot, WinnerEntry } from '../../utils/sidePots';
import type { ShowdownEvaluation } from '../../utils/evaluateShowdown';
import { splitPot } from '../../utils/splitPot';
import { buildPostflopOrder } from './handFlowReducer';
import { EMPTY_PART, isCompleteCard, type PartialCard } from '../../utils/cardPick';
import CardPickerPanel from './CardPickerPanel';
export type { WinnerEntry };

/** 白地のカード表示用の色（黒スートは黒。ダークテーマの文字色だと白地で読めない） */
function onWhiteColor(suit: Suit): string {
  return suit === 'h' || suit === 'd' ? '#e53e3e' : '#111';
}

// ============================================================
// ShowdownPlayerPanel: 1人のshow/muck入力
// ============================================================
interface ShowdownPlayerProps {
  player: Player;
  positionLabel: string;
  usedCards: Card[]; // 重複禁止カード
  /** heroが事前入力したホールカード。渡された場合はカード再入力をスキップ */
  presetCards?: [Card, Card];
  onCommit: (record: ShowdownRecord) => void;
}

export function ShowdownPlayerPanel({
  player,
  positionLabel,
  usedCards,
  presetCards,
  onCommit,
}: ShowdownPlayerProps) {
  const [mode, setMode] = useState<'choose' | 'card-input'>('choose');
  // 2枠の入力状態（ランクだけ・スーツだけの入力途中も含む）
  const [slots, setSlots] = useState<PartialCard[]>([EMPTY_PART, EMPTY_PART]);
  const cards = slots.map((s) => (isCompleteCard(s) ? s : null)) as [Card | null, Card | null];

  // この入力欄以外で使用済みのカード
  const usedSet = new Set<string>(usedCards.map(cardKey));

  const handleSlotChange = (idx: number, slot: PartialCard) =>
    setSlots((prev) => prev.map((p, i) => (i === idx ? slot : p)));

  const resetSlots = () => setSlots([EMPTY_PART, EMPTY_PART]);

  const handleRemove = (idx: number) => handleSlotChange(idx, EMPTY_PART);

  // DEV only: 未入力スロットをランダムに埋める
  const handleRandomFill = () => {
    setSlots(fillRandomCards(cards, usedCards).map((c) => c ?? EMPTY_PART));
  };

  const handleShow = () => {
    if (cards[0] && cards[1]) {
      onCommit({ playerId: player.id, action: 'show', cards: [cards[0], cards[1]] });
    }
  };

  const handleMuck = () => {
    onCommit({ playerId: player.id, action: 'muck' });
  };

  return (
    <div className="showdown-panel">
      <div className="showdown-panel__header">
        <span className="showdown-panel__pos">{positionLabel}</span>
        <span className="showdown-panel__name">{player.name}</span>
        <span className="showdown-panel__label">のハンド</span>
      </div>

      {mode === 'choose' ? (
        <div className="showdown-choose">
          {presetCards ? (
            /* hero: 事前入力済みのカードをプレビュー表示してワンタップでSHOW */
            <div className="showdown-preset">
              <div className="showdown-preset__cards">
                {presetCards.map((card, i) => (
                  <span key={i} className="showdown-preset__card" style={{ color: onWhiteColor(card.suit) }}>
                    {cardLabel(card)}
                  </span>
                ))}
              </div>
              <div className="showdown-choose">
                <button
                  type="button"
                  className="showdown-btn showdown-btn--show"
                  onClick={() => onCommit({ playerId: player.id, action: 'show', cards: presetCards })}
                >
                  SHOW
                </button>
                <button
                  type="button"
                  className="showdown-btn showdown-btn--muck"
                  onClick={handleMuck}
                >
                  MUCK
                </button>
              </div>
            </div>
          ) : (
            /* 他プレイヤー: SHOWを押したらカード入力へ */
            <div className="showdown-choose">
              <button
                type="button"
                className="showdown-btn showdown-btn--show"
                onClick={() => setMode('card-input')}
              >
                SHOW
              </button>
              <button
                type="button"
                className="showdown-btn showdown-btn--muck"
                onClick={handleMuck}
              >
                MUCK
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="board-input-wrap">
          {import.meta.env.DEV && (
            <div className="board-input__title">
              <button
                type="button"
                className="rndm-btn"
                onClick={handleRandomFill}
                disabled={cards[0] !== null && cards[1] !== null}
              >
                rndm
              </button>
            </div>
          )}
          {/* カード枠＋ランク・スーツ選択 */}
          <CardPickerPanel
            slots={slots}
            usedSet={usedSet}
            onSlotChange={handleSlotChange}
            onClear={resetSlots}
            onRemove={handleRemove}
          />

          <div className="showdown-card-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setMode('choose'); resetSlots(); }}
            >
              ← 戻る
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleShow}
              disabled={!cards[0] || !cards[1]}
            >
              SHOW 確定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// WinnerPanel: 現在解決中の1ポットの勝者選択（カスケードはフック側が駆動）
// ============================================================
interface WinnerPanelProps {
  /** 現在解決中のポット */
  pot: Pot;
  /** このポットの勝者候補のID（eligible − 敗退 − muck。フック側で算出） */
  candidateIds: string[];
  /** 全ポット数（ラベル表示の切替用） */
  potCount: number;
  /** 下位ポットがまだ残っているか（確定ボタンの文言切替） */
  hasNextPot: boolean;
  /** 全プレイヤー（id→ラベル・カード引き当て用） */
  players: Player[];
  /** players と同じ並びのポジションラベル */
  positionLabels: string[];
  currency: string;
  showdownRecords: ShowdownRecord[];
  /** 手札とボードからの自動判定。あれば初期選択になる（無ければ手動選択） */
  suggestion?: ShowdownEvaluation | null;
  /** 勝者が複数ならチョップ */
  onConfirm: (winnerIds: string[]) => void;
  /** 「1つ戻る」（フロー側の goBack） */
  onBack?: () => void;
}

export function WinnerPanel({
  pot,
  candidateIds,
  potCount,
  hasNextPot,
  players,
  positionLabels,
  currency,
  showdownRecords,
  suggestion,
  onConfirm,
  onBack,
}: WinnerPanelProps) {
  const [selected, setSelected] = useState<string[]>(suggestion?.winnerIds ?? []);
  // チョップは「チョップ」ボタンで選ぶ。金色になる選択肢は常に1つ（プレイヤーか、チョップ）。
  // チョップ中のプレイヤーは ✓ だけで示し、枠は光らせない（誤タップで勝者が複数になるのも防ぐ）
  const [chop, setChop] = useState((suggestion?.winnerIds.length ?? 0) > 1);

  const toggle = (id: string) => {
    if (chop) {
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelected([id]);
    }
  };
  const toggleChop = () => {
    if (chop) {
      // チョップをやめる: 自動判定が単独勝者ならそれ、無ければ未選択に戻す
      setSelected(suggestion?.winnerIds.length === 1 ? suggestion.winnerIds : []);
    } else {
      // チョップにする: 自動判定のチョップ相手、無ければ候補全員（3人以上なら ✓ で外せる）
      setSelected(
        suggestion && suggestion.winnerIds.length > 1 ? suggestion.winnerIds : candidateIds,
      );
    }
    setChop((v) => !v);
  };

  const multiPot = potCount > 1;
  const labelOf = (id: string) => positionLabels[players.findIndex((p) => p.id === id)] ?? '';
  const cardsOf = (id: string) =>
    showdownRecords.find((r) => r.playerId === id && r.action === 'show')?.cards;

  // チョップ時の配分プレビュー（端数は postflop のアクション順の早い人へ）
  const splitPreview =
    selected.length > 1
      ? splitPot(
          pot.amount,
          selected,
          buildPostflopOrder(players.map((p) => p.id), new Set()),
        )
          .map((e) => `${labelOf(e.playerId)} ${currency}${e.amount.toLocaleString()}`)
          .join(' / ')
      : null;

  return (
    <div className="winner-panel">
      <div className="winner-panel__title">
        {multiPot ? `${pot.label} の勝者を選択` : 'ポットの勝者を選択'}
      </div>
      <div className="winner-panel__pot">
        POT: <span className="winner-panel__pot-amount">{currency}{pot.amount.toLocaleString()}</span>
      </div>

      {suggestion && (
        <div className="winner-panel__auto">
          自動判定: {suggestion.winnerIds.map(labelOf).join(' / ')}
          {suggestion.winnerIds.length > 1 ? '（チョップ）' : ''}
          ・違う場合は選び直してください
        </div>
      )}

      <div className="winner-list">
        {candidateIds.map((id) => {
          const record = cardsOf(id);
          return (
            <button
              key={id}
              type="button"
              className={`winner-btn ${
                selected.includes(id) ? (chop ? 'winner-btn--chopped' : 'winner-btn--selected') : ''
              }`}
              onClick={() => toggle(id)}
            >
              <span className="winner-btn__pos">{labelOf(id)}</span>
              {chop && selected.includes(id) && <span className="winner-btn__check">✓</span>}
              {record && (
                <span className="winner-btn__cards">
                  {record.map((card, ci) => (
                    <span
                      key={ci}
                      className="winner-btn__card"
                      style={{ color: onWhiteColor(card.suit) }}
                    >
                      {cardLabel(card)}
                    </span>
                  ))}
                </span>
              )}
              {suggestion?.descriptions[id] && (
                <span className="winner-btn__descr">{suggestion.descriptions[id]}</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`winner-chop-toggle ${chop ? 'winner-chop-toggle--on' : ''}`}
        onClick={toggleChop}
        aria-pressed={chop}
      >
        チョップ（引き分け）
      </button>
      {splitPreview && <div className="winner-panel__split">配分: {splitPreview}</div>}

      <div className="hand-end__actions">
        {onBack && (
          <button type="button" className="btn-secondary hand-end__back" onClick={onBack}>
            ← 1つ戻る
          </button>
        )}
        <button
          type="button"
          className="btn-primary hand-end__confirm"
          onClick={() => selected.length > 0 && onConfirm(selected)}
          disabled={selected.length === 0}
        >
          {hasNextPot ? '次のポットへ →' : '保存 →'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// HandEndPanel: 生き残りが1人で決着したときの確認（勝者選択の代わり）
// ============================================================
interface HandEndPanelProps {
  winnerPositionLabel: string;
  pot: number;
  currency: string;
  onConfirm: () => void;
  onBack?: () => void;
}

export function HandEndPanel({ winnerPositionLabel, pot, currency, onConfirm, onBack }: HandEndPanelProps) {
  return (
    <div className="winner-panel">
      <div className="winner-panel__title">ハンド終了</div>
      <div className="winner-panel__pot">
        POT: <span className="winner-panel__pot-amount">{currency}{pot.toLocaleString()}</span>
      </div>
      <div className="winner-btn winner-btn--selected hand-end__winner">
        <span className="winner-btn__pos">{winnerPositionLabel}</span>
        の勝ち
      </div>
      <div className="hand-end__actions">
        {onBack && (
          <button type="button" className="btn-secondary hand-end__back" onClick={onBack}>
            ← 1つ戻る
          </button>
        )}
        <button type="button" className="btn-primary hand-end__confirm" onClick={onConfirm}>
          保存 →
        </button>
      </div>
    </div>
  );
}
