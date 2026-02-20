import { useState } from 'react';
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
        <div className="card-picker__popup">
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
