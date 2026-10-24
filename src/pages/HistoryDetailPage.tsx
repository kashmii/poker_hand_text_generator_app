import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getHand, deleteHand, type Hand } from '../api/hands';
import { ApiError } from '../api/client';
import { generateHandText } from '../utils/formatHand';

/** /history/:id : 保存したハンド1件の詳細。テキストを再生成してコピー・削除できる。 */
export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { loading: authLoading, session } = useAuth();
  const navigate = useNavigate();
  // 一覧の「戻る」の行き先を保つため、一覧から受け取った state をそのまま返す
  const listState = useLocation().state;
  const [hand, setHand] = useState<Hand | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading || !session || !id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHand(id)
      .then((h) => { if (!cancelled) setHand(h); })
      .catch((e) => {
        if (!cancelled) {
          if (e instanceof ApiError && e.status === 404) setError('ハンドが見つかりません。');
          else setError('取得に失敗しました。');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authLoading, session, id]);

  // 保存時のセッションスナップショットでテキストを再生成する
  const handText = hand?.data.session
    ? generateHandText(hand.data, hand.data.session)
    : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(handText);
    } catch {
      const el = document.createElement('textarea');
      el.value = handText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('このハンドを削除しますか？')) return;
    setDeleting(true);
    try {
      await deleteHand(id);
      navigate('/history', { state: listState });
    } catch {
      setError('削除に失敗しました。');
      setDeleting(false);
    }
  };

  return (
    <div className="history">
      <div className="history__header">
        <button type="button" className="btn-secondary" onClick={() => navigate('/history', { state: listState })}>
          ← 一覧へ
        </button>
        <h2>ハンド詳細</h2>
      </div>

      {authLoading || loading ? (
        <p className="hint">読み込み中…</p>
      ) : !session ? (
        <p className="hint">履歴を見るにはログインしてください。</p>
      ) : error ? (
        <p className="auth-bar__error">{error}</p>
      ) : hand ? (
        <>
          <div className="output-header">
            <button
              type="button"
              className={`btn-copy ${copied ? 'btn-copy--done' : ''}`}
              onClick={handleCopy}
              disabled={!handText}
            >
              {copied ? '✓ コピー済み' : 'コピー'}
            </button>
            <button
              type="button"
              className="btn-delete"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '削除中…' : '🗑 削除'}
            </button>
          </div>
          {handText ? (
            <pre className="output-text">{handText}</pre>
          ) : (
            <p className="hint">このハンドにはセッション情報が無いため、テキストを再生成できません。</p>
          )}
        </>
      ) : null}
    </div>
  );
}
