import { useState } from 'react';
import type { Card, Rank, Suit } from '../../types/poker';
import type { Street } from './types';
import { pickRandomCards } from '../../utils/randomCard';

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
    const newCards = cards.map((c, i) => (i === activeSlot ? { rank: pendingRank, suit: s } : c));
    onCardChange(activeSlot, { rank: pendingRank, suit: s });
    setPendingRank(null);
    // 全スロットが埋まったら自動確定
    if (newCards.every((c) => c !== null)) {
      setActiveSlot(null);
      onConfirm();
      return;
    }
    // 次の空きスロットへ自動移動
    const nextEmpty = newCards.findIndex((c, i) => i > activeSlot && c === null);
    if (nextEmpty !== -1) {
      setActiveSlot(nextEmpty);
    } else {
      const anyEmpty = newCards.findIndex((c, i) => i !== activeSlot && c === null);
      setActiveSlot(anyEmpty !== -1 ? anyEmpty : null);
    }
  };

  const handleClear = (idx: number) => {
    onCardChange(idx, null);
    setActiveSlot(idx);
    setPendingRank(null);
  };

  // DEV only: 未入力スロットをランダムに埋めて自動確定
  const handleRandomFill = () => {
    const alreadyFilled = cards.filter((c): c is Card => c !== null);
    const need = cards.filter((c) => c === null).length;
    const picked = pickRandomCards([...usedCards, ...alreadyFilled], need);
    let pickIdx = 0;
    cards.forEach((c, i) => {
      if (c === null && pickIdx < picked.length) {
        onCardChange(i, picked[pickIdx++]);
      }
    });
    setPendingRank(null);
    setActiveSlot(null);
    // 全スロットが埋まる（空きが全部picked）なら自動確定
    if (need === picked.length) {
      onConfirm();
    }
  };

  return (
    <div className="board-input-wrap">
      <div className="board-input__title">
        {label}のカードを入力
        {import.meta.env.DEV && (
          <button
            type="button"
            className="rndm-btn"
            onClick={handleRandomFill}
            disabled={allFilled}
          >
            rndm
          </button>
        )}
      </div>

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

      {/* ランク・スーツ選択パネル（常時DOM、activeSlotなし時は非アクティブ） */}
      <div className={`board-picker-panel ${activeSlot === null ? 'board-picker-panel--inactive' : ''}`}>
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
                disabled={activeSlot === null || fullyUsed}
                tabIndex={activeSlot === null ? -1 : 0}
              >
                {r}
              </button>
            );
          })}
        </div>

        {/* スーツ選択（ランク選択後にアクティブ化） */}
        <div className={`board-picker__suits ${pendingRank ? 'board-picker__suits--active' : ''}`}>
          {SUITS.map((s) => {
            const used = pendingRank ? isSuitUsed(pendingRank, s.value) : false;
            return (
              <button
                key={s.value}
                type="button"
                className={`suit-btn suit-btn--large ${used ? 'suit-btn--used' : ''}`}
                style={{ color: used ? '#4b5563' : s.color }}
                onClick={() => { if (pendingRank) handleSuit(s.value); }}
                disabled={!pendingRank || used}
                tabIndex={pendingRank ? 0 : -1}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {onBack && (
        <div className="board-input__actions">
          <button
            type="button"
            className="btn-secondary board-input__back"
            onClick={onBack}
          >
            ← 1手戻る
          </button>
        </div>
      )}
    </div>
  );
}
