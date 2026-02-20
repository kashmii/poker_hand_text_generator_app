import { useState, useRef, useEffect } from 'react';
import type { Card, Rank, Suit } from '../types/poker';

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: { value: Suit; label: string; color: string }[] = [
  { value: 'h', label: '♥', color: '#e53e3e' },
  { value: 'd', label: '♦', color: '#e53e3e' },
  { value: 'c', label: '♣', color: 'var(--color-text)' },
  { value: 's', label: '♠', color: 'var(--color-text)' },
];

interface Props {
  value: Card | null;
  onChange: (card: Card | null) => void;
  label: string;
}

export default function CardPicker({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedRank, setSelectedRank] = useState<Rank | null>(value?.rank ?? null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // ポップアップ位置を画面内に収める
  useEffect(() => {
    if (!open || !popupRef.current || !btnRef.current) return;
    const popup = popupRef.current;
    const btnRect = btnRef.current.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 横方向: 右にはみ出す場合は左寄せ
    let left = btnRect.left;
    if (left + popupRect.width > vw - 8) {
      left = Math.max(8, vw - popupRect.width - 8);
    }

    // 縦方向: 下にはみ出す場合はボタン上に表示
    let top = btnRect.bottom + 4;
    if (top + popupRect.height > vh - 8) {
      top = Math.max(8, btnRect.top - popupRect.height - 4);
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }, [open, selectedRank]);

  const handleRank = (r: Rank) => setSelectedRank(r);

  const handleSuit = (s: Suit) => {
    if (selectedRank) {
      onChange({ rank: selectedRank, suit: s });
      setSelectedRank(null);
      setOpen(false);
    }
  };

  const handleClear = () => {
    onChange(null);
    setSelectedRank(null);
    setOpen(false);
  };

  return (
    <div className="card-picker">
      <button
        ref={btnRef}
        type="button"
        className={`card-btn ${value ? 'card-btn--selected' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {value ? (
          <span style={{ color: value.suit === 'h' || value.suit === 'd' ? '#e53e3e' : 'var(--color-text)' }}>
            {value.rank}
            {SUITS.find((s) => s.value === value.suit)?.label}
          </span>
        ) : (
          <span className="card-btn__placeholder">{label}</span>
        )}
      </button>

      {open && (
        <div ref={popupRef} className="card-picker__popup card-picker__popup--fixed">
          <div className="card-picker__ranks">
            {RANKS.map((r) => (
              <button
                key={r}
                type="button"
                className={`rank-btn ${selectedRank === r ? 'rank-btn--active' : ''}`}
                onClick={() => handleRank(r)}
              >
                {r}
              </button>
            ))}
          </div>
          {selectedRank && (
            <div className="card-picker__suits">
              {SUITS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="suit-btn"
                  style={{ color: s.color }}
                  onClick={() => handleSuit(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="clear-btn" onClick={handleClear}>クリア</button>
          <button type="button" className="close-btn" onClick={() => setOpen(false)}>閉じる</button>
        </div>
      )}
    </div>
  );
}
