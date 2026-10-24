import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listHands, type HandSummary } from '../api/hands';
import { ApiError } from '../api/client';
import AuthBar from '../components/auth/AuthBar';
import HistoryList from '../components/HistoryList';

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
        <HistoryList hands={hands} onOpen={(id) => navigate(`/history/${id}`)} />
      ) : (
        <div className="empty-state">
          <p>保存されたハンドはまだありません。</p>
        </div>
      )}
    </div>
  );
}
