import { useState } from 'react';
import type { Card, Rank, Suit } from '../../types/poker';
import type { Street } from './types';

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: { value: Suit; label: string; color: string }[] = [
  { value: 'h', label: '♥', color: '#e53e3e' },
  { value: 'd', label: '♦', color: '#e53e3e' },
  { value: 'c', label: '♣', color: 'var(--color-text)' },
  { value: 's', label: '♠', color: 'var(--color-text)' },
];

const STREET_LABELS: Record<string, string> = {
  flop: 'フロップ',
  turn: 'ターン',
  river: 'リバー',
};

interface Props {
  street: Street;
  cards: (Card | null)[];
  /** このストリート以外ですでに使用されているカード（重複禁止用） */
  usedCards?: Card[];
  onCardChange: (idx: number, card: Card | null) => void;
  onConfirm: () => void;
  onBack?: () => void;
}

function cardDisplay(card: Card | null) {
  if (!card) return null;
  const suit = SUITS.find((s) => s.value === card.suit);
  return { label: `${card.rank}${suit?.label ?? ''}`, color: suit?.color ?? 'var(--color-text)' };
}

/** card が usedSet に含まれるか判定 */
function cardKey(card: Card) {
  return `${card.rank}${card.suit}`;
}

export default function BoardInput({ street, cards, usedCards = [], onCardChange, onConfirm, onBack }: Props) {
  // 現在入力中のスロット（0〜cards.length-1）、nullなら選択待ち
  const [activeSlot, setActiveSlot] = useState<number | null>(
    // 最初の空きスロットを自動選択
    cards.findIndex((c) => c === null) !== -1 ? cards.findIndex((c) => c === null) : null
  );
  const [pendingRank, setPendingRank] = useState<Rank | null>(null);

  const label = STREET_LABELS[street] ?? street;
  const allFilled = cards.every((c) => c !== null);

  // 使用済みカードのセット（外部 + このストリートの他スロット）
  const buildUsedSet = (excludeSlot: number | null): Set<string> => {
    const set = new Set<string>(usedCards.map(cardKey));
    cards.forEach((c, i) => {
      if (c && i !== excludeSlot) set.add(cardKey(c));
    });
    return set;
  };

  // activeSlot を除いた使用済みセット（現在編集中スロットのカードは除外して選択可能にする）
  const usedSet = buildUsedSet(activeSlot);

  // ランクが完全使用済みか（4スーツ全て used）
  const isRankFullyUsed = (r: Rank): boolean =>
    SUITS.every((s) => usedSet.has(`${r}${s.value}`));

  // 特定のランク+スーツが使用済みか
  const isSuitUsed = (r: Rank, s: Suit): boolean => usedSet.has(`${r}${s}`);

  const handleSlotClick = (idx: number) => {
    setActiveSlot(idx);
    setPendingRank(null);
  };

  const handleRank = (r: Rank) => {
    if (isRankFullyUsed(r)) return;
    setPendingRank(r);
  };

  const handleSuit = (s: Suit) => {
    if (pendingRank === null || activeSlot === null) return;
    if (isSuitUsed(pendingRank, s)) return;
    onCardChange(activeSlot, { rank: pendingRank, suit: s });
    setPendingRank(null);
    // 次の空きスロットへ自動移動
    const nextEmpty = cards.findIndex((c, i) => i > activeSlot && c === null);
    if (nextEmpty !== -1) {
      setActiveSlot(nextEmpty);
    } else {
      // 前の空きも探す（全体から）
      const anyEmpty = cards.findIndex((c, i) => i !== activeSlot && c === null);
      setActiveSlot(anyEmpty !== -1 ? anyEmpty : null);
    }
  };

  const handleClear = (idx: number) => {
    onCardChange(idx, null);
    setActiveSlot(idx);
    setPendingRank(null);
  };

  return (
    <div className="board-input-wrap">
      <div className="board-input__title">{label}のカードを入力</div>

      {/* カードスロット群 */}
      <div className="board-input__slots">
        {cards.map((card, i) => {
          const disp = cardDisplay(card);
          const isActive = activeSlot === i;
          return (
            <button
              key={i}
              type="button"
              className={`board-slot ${isActive ? 'board-slot--active' : ''} ${card ? 'board-slot--filled' : ''}`}
              onClick={() => handleSlotClick(i)}
            >
              {disp ? (
                <>
                  <span className="board-slot__card" style={{ color: disp.color }}>{disp.label}</span>
                  <span
                    className="board-slot__clear"
                    role="button"
                    onClick={(e) => { e.stopPropagation(); handleClear(i); }}
                  >×</span>
                </>
              ) : (
                <span className="board-slot__empty">{i + 1}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ランク・スーツ選択パネル（active slotがある時だけ表示） */}
      {activeSlot !== null && (
        <div className="board-picker-panel">
          {/* ランク選択 */}
          <div className="board-picker__ranks">
            {RANKS.map((r) => {
              const fullyUsed = isRankFullyUsed(r);
              return (
                <button
                  key={r}
                  type="button"
                  className={`rank-btn ${pendingRank === r ? 'rank-btn--active' : ''} ${fullyUsed ? 'rank-btn--used' : ''}`}
                  onClick={() => handleRank(r)}
                  disabled={fullyUsed}
                >
                  {r}
                </button>
              );
            })}
          </div>

          {/* スーツ選択（ランク選択後に表示） */}
          {pendingRank && (
            <div className="board-picker__suits">
              {SUITS.map((s) => {
                const used = isSuitUsed(pendingRank, s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    className={`suit-btn suit-btn--large ${used ? 'suit-btn--used' : ''}`}
                    style={{ color: used ? '#4b5563' : s.color }}
                    onClick={() => handleSuit(s.value)}
                    disabled={used}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={`board-input__actions ${onBack ? 'board-input__actions--two' : ''}`}>
        {onBack && (
          <button
            type="button"
            className="btn-secondary board-input__back"
            onClick={onBack}
          >
            ← 1手戻る
          </button>
        )}
        <button
          type="button"
          className="btn-primary board-input__confirm"
          onClick={onConfirm}
          disabled={!allFilled}
        >
          確定 →
        </button>
      </div>
    </div>
  );
}
