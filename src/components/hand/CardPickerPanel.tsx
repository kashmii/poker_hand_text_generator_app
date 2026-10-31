import {
  applyPart, isEmptyPart, isRankDisabled, isSuitDisabled,
  type CardPart, type PartialCard,
} from '../../utils/cardPick';
import { RANKS } from '../../utils/card';
import { SUITS } from './suits';

interface Props {
  /** 枠ごとの入力状態（確定カードも含む） */
  slots: PartialCard[];
  /** この入力欄以外で使用済みのカード "rank+suit" の集合 */
  usedSet: Set<string>;
  /** ランクかスーツが入って枠の状態が変わったとき（両方そろえばカード確定） */
  onSlotChange: (idx: number, slot: PartialCard) => void;
  /** 全枠を空にする */
  onClear: () => void;
  /** 指定時のみ各枠に × を出し、その枠だけ空にできる（1枚だけのターン・リバーでは渡さない） */
  onRemove?: (idx: number) => void;
  /** 区切りの余白を左に入れる枠のインデックス（ボードメモでフロップ|ターン|リバーを分ける） */
  groupStarts?: number[];
}

/**
 * カード入力の枠＋ランク・スーツ選択パネル。
 * ランク・スーツはどの順で押してもよく、それぞれ「その種類が未入力の一番左の枠」に入る。
 * やり直しはランク「2」の右のクリア（全枠）と、onRemove 指定時の各枠の ×。
 */
export default function CardPickerPanel({
  slots, usedSet, onSlotChange, onClear, onRemove, groupStarts = [],
}: Props) {
  const pick = (part: CardPart) => {
    const result = applyPart(slots, part);
    if (result) onSlotChange(result.idx, result.slot);
  };

  return (
    <>
      <div className="board-input__slots">
        {slots.map((slot, i) => {
          const suit = SUITS.find((s) => s.value === slot.suit);
          const filled = slot.rank !== null && slot.suit !== null;
          return (
            <div
              key={i}
              className={`board-slot ${filled ? 'board-slot--filled' : ''} ${groupStarts.includes(i) ? 'board-slot--group-start' : ''}`}
            >
              {isEmptyPart(slot) ? (
                <span className="board-slot__empty">{i + 1}</span>
              ) : (
                <>
                  <span className="board-slot__card">
                    {slot.rank ?? <span className="board-slot__missing">?</span>}
                    {suit
                      ? <span style={{ color: suit.color }}>{suit.label}</span>
                      : <span className="board-slot__missing">?</span>}
                  </span>
                  {onRemove && (
                    <button
                      type="button"
                      className="board-slot__clear"
                      aria-label={`${i + 1}枚目を消す`}
                      onClick={() => onRemove(i)}
                    >×</button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="board-picker-panel">
        <div className="board-picker__ranks">
          {RANKS.map((r) => {
            const disabled = isRankDisabled(r, slots, usedSet);
            return (
              <button
                key={r}
                type="button"
                className={`rank-btn ${disabled ? 'rank-btn--used' : ''}`}
                onClick={() => pick({ rank: r })}
                disabled={disabled}
              >
                {r}
              </button>
            );
          })}
          <button
            type="button"
            className="rank-btn picker-clear-btn"
            onClick={onClear}
            disabled={slots.every(isEmptyPart)}
          >
            クリア
          </button>
        </div>

        <div className="board-picker__suits">
          {SUITS.map((s) => {
            const disabled = isSuitDisabled(s.value, slots, usedSet);
            return (
              <button
                key={s.value}
                type="button"
                className={`suit-btn suit-btn--large ${disabled ? 'suit-btn--used' : ''}`}
                style={{ color: disabled ? '#4b5563' : s.color }}
                onClick={() => pick({ suit: s.value })}
                disabled={disabled}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
