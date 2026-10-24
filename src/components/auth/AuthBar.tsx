import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { getMe } from '../../api/client';
import { detectInAppBrowser, externalBrowserUrl, IN_APP_BROWSER_LABELS } from '../../utils/inAppBrowser';

/**
 * ログイン状態の表示と、Google ログイン / ログアウトのボタン。
 * Supabase の設定がない環境では何も表示しない。
 */
export default function AuthBar() {
  const { enabled, loading, session, signInWithGoogle, signOut } = useAuth();
  const { hands } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [apiCheck, setApiCheck] = useState<string | null>(null);

  if (!enabled || loading) return null;

  if (session) {
    const handleSignOut = async () => {
      setError(null);
      try {
        await signOut();
      } catch {
        setError('ログアウトに失敗しました');
      }
    };
    // DEV専用: 本物の JWT で Go の /me を呼び、ログインと JWT 検証がつながったか確かめる
    const handleApiCheck = async () => {
      setApiCheck('確認中…');
      try {
        const me = await getMe();
        const same = me.userId === session.user.id;
        setApiCheck(same ? `OK（userId: ${me.userId.slice(0, 8)}…）` : `userId が一致しない: ${me.userId}`);
      } catch (e) {
        setApiCheck(`失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    return (
      <div className="auth-bar">
        <span className="auth-bar__status">
          ログイン中: <strong>{session.user.email ?? 'Google アカウント'}</strong>
        </span>
        <button type="button" className="btn-auth btn-auth--sub" onClick={() => navigate('/history')}>
          過去ハンド一覧
        </button>
        <button type="button" className="btn-auth btn-auth--sub" onClick={handleSignOut}>
          ログアウト
        </button>
        {import.meta.env.DEV && (
          <div className="auth-bar__dev">
            <button type="button" className="btn-dev" onClick={handleApiCheck}>
              🛠 DEV: Go の /me を呼ぶ
            </button>
            {apiCheck && <span className="auth-bar__dev-result">{apiCheck}</span>}
          </div>
        )}
        {error && <p className="auth-bar__error">{error}</p>}
      </div>
    );
  }

  // Google は LINE などのアプリ内ブラウザからのログインを禁止しているので、外部ブラウザへ案内する
  const inApp = detectInAppBrowser(navigator.userAgent);
  if (inApp) {
    const external = externalBrowserUrl(inApp, window.location.href);
    return (
      <div className="auth-bar auth-bar--notice">
        <p>
          {IN_APP_BROWSER_LABELS[inApp]} の中のブラウザでは Google ログインができません。
          ログインする場合は Safari / Chrome で開いてください（ログインしなくても今まで通り使えます）。
        </p>
        {external ? (
          <a className="btn-auth" href={external}>
            Safari / Chrome で開く
          </a>
        ) : (
          <p className="hint">画面右上などのメニューから「ブラウザで開く」を選んでください。</p>
        )}
      </div>
    );
  }

  const handleSignIn = async () => {
    // Google の画面へページごと移動するので、メモリ上のハンドは消える
    if (
      hands.length > 0 &&
      !window.confirm('ログインのために Google の画面へ移動します。記録中のハンドは消えます。続けますか？')
    ) {
      return;
    }
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError('ログインを開始できませんでした。時間をおいて試してください');
    }
  };

  return (
    <div className="auth-bar">
      <button type="button" className="btn-auth" onClick={handleSignIn}>
        Google でログイン
      </button>
      <span className="hint">ログインすると、ハンドを保存して後から見返せます</span>
      {error && <p className="auth-bar__error">{error}</p>}
    </div>
  );
}
