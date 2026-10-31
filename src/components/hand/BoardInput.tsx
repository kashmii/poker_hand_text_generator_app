import { useState, type ReactNode } from 'react';
import type { BoardStreet, Card } from '../../types/poker';
import { fillRandomCards } from '../../utils/randomCard';
import { cardKey } from '../../utils/card';
import { EMPTY_PART, isCompleteCard, mergeSlots, type PartialCard } from '../../utils/cardPick';
import CardPickerPanel from './CardPickerPanel';

const STREET_LABELS: Record<BoardStreet, string> = {
  flop: 'フロップ',
  turn: 'ターン',
  river: 'リバー',
};

interface Props {
  /** title を渡さない場合は「{ストリート}のカードを入力」をタイトルにする */
  street?: BoardStreet;
  title?: string;
  /** タイトル行の右側に置く要素（閉じるボタンなど） */
  titleExtra?: ReactNode;
  cards: (Card | null)[];
  /** 区切りの余白を左に入れるスロットのインデックス（ボードメモでフロップ|ターン|リバーを分ける） */
  groupStarts?: number[];
  /** このストリート以外ですでに使用されているカード（重複禁止用） */
  usedCards?: Card[];
  onCardChange: (idx: number, card: Card | null) => void;
  onConfirm: () => void;
  onBack?: () => void;
  /** 全スロット入力済みのときに出す確定ボタンの文言 */
  confirmLabel?: string;
}

export default function BoardInput({
  street, title, titleExtra, cards, groupStarts = [], usedCards = [], onCardChange, onConfirm, onBack, confirmLabel = '確定',
}: Props) {
  // 確定前の枠の入力途中（ランクだけ・スーツだけ）。確定カードは cards（親）が持つ
  const [partials, setPartials] = useState<PartialCard[]>(() => cards.map(() => EMPTY_PART));

  const label = title ?? `${street ? STREET_LABELS[street] : ''}のカードを入力`;
  const allFilled = cards.every((c) => c !== null);
  const slots = mergeSlots(cards, partials);

  // この入力欄以外で使用済みのカード
  const usedSet = new Set<string>(usedCards.map(cardKey));

  const setPartial = (idx: number, part: PartialCard) =>
    setPartials((prev) => prev.map((p, i) => (i === idx ? part : p)));

  const handleSlotChange = (idx: number, slot: PartialCard) => {
    if (!isCompleteCard(slot)) {
      setPartial(idx, slot);
      return;
    }
    setPartial(idx, EMPTY_PART);
    onCardChange(idx, slot);
    // 全スロットが埋まったら自動確定
    if (cards.every((c, i) => i === idx || c !== null)) onConfirm();
  };

  // 1枚だけ空にする（フロップ・ボードメモ）
  const handleRemove = (idx: number) => {
    if (cards[idx]) onCardChange(idx, null);
    setPartial(idx, EMPTY_PART);
  };

  // 全スロットを空にして入力し直す
  const handleClearAll = () => {
    cards.forEach((c, i) => { if (c) onCardChange(i, null); });
    setPartials(cards.map(() => EMPTY_PART));
  };

  // DEV only: 未入力スロットをランダムに埋めて自動確定
  const handleRandomFill = () => {
    const filled = fillRandomCards(cards, usedCards);
    filled.forEach((c, i) => {
      if (cards[i] === null && c !== null) onCardChange(i, c);
    });
    setPartials(cards.map(() => EMPTY_PART));
    // 全スロットが埋まったら自動確定
    if (filled.every((c) => c !== null)) {
      onConfirm();
    }
  };

  return (
    <div className="board-input-wrap">
      <div className="board-input__title">
        {label}
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
        {titleExtra}
        {onBack && (
          <button
            type="button"
            className="board-input__back-top"
            onClick={onBack}
          >
            ← 戻る
          </button>
        )}
      </div>

      {/* カード枠＋ランク・スーツ選択パネル。1枚だけのターン・リバーは × なし（クリアで足りる） */}
      <CardPickerPanel
        slots={slots}
        usedSet={usedSet}
        onSlotChange={handleSlotChange}
        onClear={handleClearAll}
        onRemove={cards.length > 1 ? handleRemove : undefined}
        groupStarts={groupStarts}
      />

      {/* 戻るはタイトル行へ移動。全スロット入力済みのときだけ下部に確定ボタンを出す
          （先行入力などで自動確定されないケース用） */}
      {allFilled && (
        <div className="board-input__actions">
          <button
            type="button"
            className="btn-primary board-input__confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}
