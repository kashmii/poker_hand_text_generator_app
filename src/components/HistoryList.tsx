import type { Card } from '../types/poker';
import type { HandSummary } from '../api/hands';
import { cardLabel } from '../utils/card';

/** カードを色付きチップで並べて表示する（♥♦は赤）。 */
export function Cards({ cards }: { cards?: Card[] | null }) {
  if (!cards || cards.length === 0) return null;
  return (
    <span className="pcards">
      {cards.map((c, i) => (
        <span key={i} className={`pcard pcard--${c.suit}`}>
          {cardLabel(c)}
        </span>
      ))}
    </span>
  );
}

interface Props {
  hands: HandSummary[];
  onOpen: (id: string) => void;
}

/** 収支バッジ。勝ち＝緑(+)、負け＝赤(−)、ちょうど0は±0。heroResult が無ければ null。 */
function ResultBadge({ result, currency }: { result?: number | null; currency?: string | null }) {
  if (result === null || result === undefined) return null;
  const c = currency ?? '';
  const tone = result > 0 ? 'win' : result < 0 ? 'loss' : 'even';
  const sign = result > 0 ? '+' : result < 0 ? '−' : '±';
  const abs = Math.abs(result).toLocaleString();
  return (
    <span className={`history-item__result history-item__result--${tone}`}>
      {sign}{c}{abs}
    </span>
  );
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
            {/* 3行目: 手札＋ボードを左、収支を右に置く。カードが無くても収支は出す */}
            <span className="history-item__bottom">
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
              <ResultBadge result={h.heroResult} currency={h.currency} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
