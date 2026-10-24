import type { Card } from '../types/poker';
import type { HandSummary } from '../api/hands';

const SUIT_SYMBOLS: Record<Card['suit'], string> = { h: '♥', d: '♦', c: '♣', s: '♠' };

/** カードを色付きチップで並べて表示する（♥♦は赤）。 */
export function Cards({ cards }: { cards?: Card[] | null }) {
  if (!cards || cards.length === 0) return null;
  return (
    <span className="pcards">
      {cards.map((c, i) => (
        <span key={i} className={`pcard pcard--${c.suit}`}>
          {c.rank}
          {SUIT_SYMBOLS[c.suit]}
        </span>
      ))}
    </span>
  );
}

interface Props {
  hands: HandSummary[];
  onOpen: (id: string) => void;
}

/** ハンド概要の一覧（日付・店名・タイトル・手札・ボード）。クリックで onOpen。 */
export default function HistoryList({ hands, onOpen }: Props) {
  return (
    <ul className="history-list">
      {hands.map((h) => (
        <li key={h.id}>
          <button type="button" className="history-item" onClick={() => onOpen(h.id)}>
            <span className="history-item__meta">
              {h.playedOn ?? h.createdAt.slice(0, 10)}
              {h.venueName && <> ・ {h.venueName}</>}
            </span>
            <span className="history-item__title">
              {h.title || <span className="hand-title--placeholder">（タイトルなし）</span>}
            </span>
            {(h.heroHoleCards?.length || h.board?.length) ? (
              <span className="history-item__cards">
                {h.heroHoleCards?.length ? (
                  <span className="history-item__cards-group">
                    <span className="history-item__cards-label">手札</span>
                    <Cards cards={h.heroHoleCards} />
                  </span>
                ) : null}
                {h.board?.length ? (
                  <span className="history-item__cards-group">
                    <span className="history-item__cards-label">ボード</span>
                    <Cards cards={h.board} />
                  </span>
                ) : null}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
