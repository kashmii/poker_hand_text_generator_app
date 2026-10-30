import { useState } from 'react';
import type { Card, Rank, Suit, Player } from '../../types/poker';
import type { ShowdownRecord } from './types';
import { pickRandomCards } from '../../utils/randomCard';
import type { Pot, WinnerEntry } from '../../utils/sidePots';
import type { ShowdownEvaluation } from '../../utils/evaluateShowdown';
import { splitPot } from '../../utils/splitPot';
import { buildPostflopOrder } from './useHandFlow';
export type { WinnerEntry };

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
                    <span key={i} className="showdown-preset__card" style={{ color: onWhiteColor(card.suit) }}>
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
                  {record.map((card, ci) => {
                    const suit = SUITS.find((s) => s.value === card.suit);
                    return (
                      <span
                        key={ci}
                        className="winner-btn__card"
                        style={{ color: onWhiteColor(card.suit) }}
                      >
                        {card.rank}{suit?.label}
                      </span>
                    );
                  })}
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
