import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listHands, type HandSummary } from '../api/hands';
import { ApiError } from '../api/client';
import type { Card } from '../types/poker';
import AuthBar from '../components/auth/AuthBar';

const SUIT_SYMBOLS: Record<Card['suit'], string> = { h: '♥', d: '♦', c: '♣', s: '♠' };

/** カードを色付きチップで並べて表示する（♥♦は赤）。 */
function Cards({ cards }: { cards?: Card[] | null }) {
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

/** /history : DBに保存した自分のハンド一覧（新しい順）。ログイン必須。 */
export default function HistoryPage() {
  const { enabled, loading: authLoading, session } = useAuth();
  const navigate = useNavigate();
  const [hands, setHands] = useState<HandSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listHands()
      .then((hs) => { if (!cancelled) setHands(hs); })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? `取得に失敗しました (${e.status})` : '取得に失敗しました');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authLoading, session]);

  return (
    <div className="history">
      <div className="history__header">
        <button type="button" className="btn-secondary" onClick={() => navigate('/setup')}>
          ← 戻る
        </button>
        <h2>保存した履歴</h2>
      </div>

      {!enabled ? (
        <p className="hint">ログイン機能が無効です（環境変数が未設定）。</p>
      ) : authLoading ? (
        <p className="hint">読み込み中…</p>
      ) : !session ? (
        <div className="empty-state">
          <p>履歴を見るにはログインしてください。</p>
          <AuthBar />
        </div>
      ) : loading ? (
        <p className="hint">読み込み中…</p>
      ) : error ? (
        <p className="auth-bar__error">{error}</p>
      ) : hands && hands.length > 0 ? (
        <ul className="history-list">
          {hands.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="history-item"
                onClick={() => navigate(`/history/${h.id}`)}
              >
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
      ) : (
        <div className="empty-state">
          <p>保存されたハンドはまだありません。</p>
        </div>
      )}
    </div>
  );
}
