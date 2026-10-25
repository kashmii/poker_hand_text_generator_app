import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthBar from '../components/auth/AuthBar';

const CONTACT_EMAIL = 'pokerhtgapp@gmail.com';

/**
 * /settings : ログイン中のアカウントの画面（ログアウト・削除の依頼先など）。
 * 卓の設定（ブラインド・人数）は /setup の「セッション設定」で変える。
 */
export default function SettingsPage() {
  const { enabled, loading, session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // 戻り先（過去ハンド一覧など）と、戻るときにその画面へ返す state。URL直打ちなどで無いときはトップへ
  const { from = '/setup', returnState } = (location.state as { from?: string; returnState?: unknown } | null) ?? {};
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setError(null);
    try {
      await signOut();
      navigate('/setup');
    } catch {
      setError('ログアウトに失敗しました');
    }
  };

  let body;
  if (!enabled) {
    body = <p className="hint">ログイン機能が無効です（環境変数が未設定）。</p>;
  } else if (loading) {
    body = <p className="hint">読み込み中…</p>;
  } else if (!session) {
    body = (
      <div className="empty-state">
        <p>ログインしていません。</p>
        <AuthBar />
      </div>
    );
  } else {
    body = (
      <>
        <section className="settings__section">
          <h3>ログイン中のアカウント</h3>
          <p>{session.user.email ?? 'Google アカウント'}</p>
          <button type="button" className="btn-secondary btn-full" onClick={handleSignOut}>
            ログアウト
          </button>
          {error && <p className="auth-bar__error">{error}</p>}
        </section>

        <section className="settings__section">
          <h3>AI サービスとの連携</h3>
          <p className="hint">
            Claude などに接続している場合、接続の解除はそのサービスの設定（Claude なら「設定 → コネクタ」）から行えます。
          </p>
        </section>

        <section className="settings__section">
          <h3>アカウントの削除</h3>
          <p className="hint">
            アカウントと、記録したハンドをすべて削除したい場合は、
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> までご連絡ください。
            ハンドを1件ずつ消すときは、過去ハンド一覧から削除できます。
          </p>
        </section>
      </>
    );
  }

  return (
    <div className="settings">
      <div className="settings__header">
        <button type="button" className="btn-secondary" onClick={() => navigate(from, { state: returnState })}>
          ← 戻る
        </button>
        <h2>アカウント</h2>
      </div>
      {body}
      <p className="settings__legal">
        <Link to="/privacy">プライバシーポリシー</Link>
      </p>
    </div>
  );
}
