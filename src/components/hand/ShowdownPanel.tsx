import { useState } from 'react';
import type { Card, Rank, Suit, Player } from '../../types/poker';
import type { ShowdownRecord } from './types';
import { pickRandomCards } from '../../utils/randomCard';

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: { value: Suit; label: string; color: string }[] = [
  { value: 'h', label: '♥', color: '#e53e3e' },
  { value: 'd', label: '♦', color: '#e53e3e' },
  { value: 'c', label: '♣', color: 'var(--color-text)' },
  { value: 's', label: '♠', color: 'var(--color-text)' },
];

function cardKey(c: Card) {
  return `${c.rank}${c.suit}`;
}

function cardDisp(card: Card | null) {
  if (!card) return null;
  const suit = SUITS.find((s) => s.value === card.suit);
  return { label: `${card.rank}${suit?.label ?? ''}`, color: suit?.color ?? 'var(--color-text)' };
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
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [pendingRank, setPendingRank] = useState<Rank | null>(null);
  const [cards, setCards] = useState<[Card | null, Card | null]>([null, null]);

  // 使用済みセット（外部 + 同スロット以外）
  const usedSet = new Set<string>([
    ...usedCards.map(cardKey),
    ...cards.filter((c, i): c is Card => c !== null && i !== activeSlot).map(cardKey),
  ]);

  const isRankFullyUsed = (r: Rank) =>
    SUITS.every((s) => usedSet.has(`${r}${s.value}`));

  const isSuitUsed = (r: Rank, s: Suit) => usedSet.has(`${r}${s}`);

  const handleRank = (r: Rank) => {
    if (isRankFullyUsed(r)) return;
    setPendingRank(r);
  };

  const handleSuit = (s: Suit) => {
    if (pendingRank === null || isSuitUsed(pendingRank, s)) return;
    const card: Card = { rank: pendingRank, suit: s };
    const next: [Card | null, Card | null] = [...cards] as [Card | null, Card | null];
    next[activeSlot] = card;
    setCards(next);
    setPendingRank(null);
    if (activeSlot === 0 && next[1] === null) setActiveSlot(1);
    else if (activeSlot === 1 && next[0] === null) setActiveSlot(0);
  };

  const handleClear = (idx: 0 | 1) => {
    const next: [Card | null, Card | null] = [...cards] as [Card | null, Card | null];
    next[idx] = null;
    setCards(next);
    setActiveSlot(idx);
    setPendingRank(null);
  };

  // DEV only: 未入力スロットをランダムに埋める
  const handleRandomFill = () => {
    const filled = cards.filter((c): c is Card => c !== null);
    const need = cards.filter((c) => c === null).length;
    const picked = pickRandomCards([...usedCards, ...filled], need);
    const next: [Card | null, Card | null] = [...cards] as [Card | null, Card | null];
    let pi = 0;
    next.forEach((_, i) => { if (next[i] === null && pi < picked.length) next[i] = picked[pi++]; });
    setCards(next);
    setPendingRank(null);
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
                {presetCards.map((card, i) => {
                  const disp = cardDisp(card);
                  return (
                    <span key={i} className="showdown-preset__card" style={{ color: disp?.color }}>
                      {disp?.label}
                    </span>
                  );
                })}
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
          {/* カードスロット */}
          <div className="board-input__slots">
            {([0, 1] as const).map((idx) => {
              const disp = cardDisp(cards[idx]);
              const isActive = activeSlot === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  className={`board-slot ${isActive ? 'board-slot--active' : ''} ${cards[idx] ? 'board-slot--filled' : ''}`}
                  onClick={() => { setActiveSlot(idx); setPendingRank(null); }}
                >
                  {disp ? (
                    <>
                      <span className="board-slot__card" style={{ color: disp.color }}>{disp.label}</span>
                      <span
                        className="board-slot__clear"
                        role="button"
                        onClick={(e) => { e.stopPropagation(); handleClear(idx); }}
                      >×</span>
                    </>
                  ) : (
                    <span className="board-slot__empty">{idx + 1}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ランク・スーツ選択 */}
          <div className="board-picker-panel">
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
            {pendingRank && (
              <div className="board-picker__suits board-picker__suits--active">
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

          <div className="showdown-card-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setMode('choose'); setCards([null, null]); setPendingRank(null); }}
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
// WinnerPanel: ウィナー選択
// ============================================================
interface WinnerPanelProps {
  activePlayers: Player[];
  positionLabels: string[];
  pot: number;
  currency: string;
  showdownRecords: ShowdownRecord[];
  onConfirm: (winnerId: string) => void;
}

export function WinnerPanel({
  activePlayers,
  positionLabels,
  pot,
  currency,
  showdownRecords,
  onConfirm,
}: WinnerPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="winner-panel">
      <div className="winner-panel__title">ポットの勝者を選択</div>
      <div className="winner-panel__pot">
        POT: <span className="winner-panel__pot-amount">{currency}{pot.toLocaleString()}</span>
      </div>

      <div className="winner-list">
        {activePlayers.map((p, i) => {
          const record = showdownRecords.find((r) => r.playerId === p.id && r.action === 'show');
          return (
            <button
              key={p.id}
              type="button"
              className={`winner-btn ${selected === p.id ? 'winner-btn--selected' : ''}`}
              onClick={() => setSelected(p.id)}
            >
              <span className="winner-btn__pos">{positionLabels[i] ?? ''}</span>
              {record?.cards && (
                <span className="winner-btn__cards">
                  {record.cards.map((card, ci) => {
                    const suit = SUITS.find((s) => s.value === card.suit);
                    return (
                      <span
                        key={ci}
                        className="winner-btn__card"
                        style={{ color: suit?.color }}
                      >
                        {card.rank}{suit?.label}
                      </span>
                    );
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn-primary btn-full winner-confirm-btn"
        onClick={() => selected && onConfirm(selected)}
        disabled={!selected}
      >
        保存 →
      </button>
    </div>
  );
}
