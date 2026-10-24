import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { redirectTo } from '../utils/redirect';

// Google ログインから戻ってくると URL のクエリが消えるので、認可リクエストの ID をここに覚えておく
const PENDING_KEY = 'oauth-consent:authorization-id';

function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writePending(id: string | null) {
  try {
    if (id) sessionStorage.setItem(PENDING_KEY, id);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // 保存できない環境では、ログイン後にもう一度 Claude から接続し直してもらう
  }
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; details: OAuthAuthorizationDetails }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

/**
 * /oauth/consent : Claude などの MCP クライアントに、自分のハンドを読ませてよいかを確認する同意画面。
 * Supabase Auth の OAuth 2.1 サーバーが ?authorization_id=... を付けてここへ送ってくる。
 */
export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id') ?? readPending();
  const { enabled, loading: authLoading, session, signInWithGoogle, signOut } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!supabase || !authorizationId || authLoading || !session) return;
    let cancelled = false;
    supabase.auth.oauth
      .getAuthorizationDetails(authorizationId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setState({ kind: 'error', message: '接続のリクエストが見つからないか、期限が切れています。Claude からもう一度接続してください。' });
          return;
        }
        // すでに許可済みなら、確認せずにクライアントへ戻す
        if (!('authorization_id' in data)) {
          writePending(null);
          redirectTo(data.redirect_url);
          return;
        }
        setState({ kind: 'ready', details: data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error', message: '通信に失敗しました。時間をおいて試してください。' });
      });
    return () => {
      cancelled = true;
    };
  }, [authorizationId, authLoading, session]);

  const decide = async (approve: boolean) => {
    if (!supabase || !authorizationId) return;
    setState({ kind: 'submitting' });
    const oauth = supabase.auth.oauth;
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data) {
      setState({ kind: 'error', message: '処理に失敗しました。Claude からもう一度接続してください。' });
      return;
    }
    writePending(null);
    redirectTo(data.redirect_url);
  };

  const handleSignIn = async () => {
    if (!authorizationId) return;
    writePending(authorizationId);
    try {
      await signInWithGoogle('/oauth/consent');
    } catch {
      setState({ kind: 'error', message: 'ログインを開始できませんでした。時間をおいて試してください。' });
    }
  };

  let body;
  if (!enabled) {
    body = <p>この環境ではログインが使えません。</p>;
  } else if (!authorizationId) {
    body = <p>接続のリクエストが見つかりません。Claude などのアプリから接続をやり直してください。</p>;
  } else if (state.kind === 'error') {
    body = <p className="consent__error">{state.message}</p>;
  } else if (authLoading) {
    body = <p className="hint">読み込み中…</p>;
  } else if (!session) {
    body = (
      <>
        <p>AI サービスに、あなたのハンド履歴の読み取りを許可するには、まずログインしてください。</p>
        <button type="button" className="btn-primary btn-full" onClick={handleSignIn}>
          Google でログインして続ける
        </button>
      </>
    );
  } else if (state.kind === 'ready') {
    const { client, user } = state.details;
    body = (
      <>
        <p>
          <strong>{client.name || '名前のないアプリ'}</strong> が、あなたのハンド履歴へのアクセスを求めています。
        </p>
        <ul className="consent__list">
          <li>記録したハンドの一覧と中身を<strong>読み取り</strong>ます</li>
          <li>ハンドの追加・変更・削除はできません</li>
          <li>許可はいつでも取り消せます</li>
        </ul>
        <p className="hint">
          ログイン中のアカウント：{user.email}{' '}
          <button type="button" className="consent__switch" onClick={() => void signOut()}>
            別のアカウントにする
          </button>
        </p>
        <div className="consent__actions">
          <button type="button" className="btn-primary btn-full" onClick={() => void decide(true)}>
            許可する
          </button>
          <button type="button" className="btn-secondary btn-full" onClick={() => void decide(false)}>
            拒否する
          </button>
        </div>
      </>
    );
  } else {
    body = <p className="hint">{state.kind === 'submitting' ? '処理中…' : '読み込み中…'}</p>;
  }

  return (
    <div className="consent">
      <h2>アクセスの許可</h2>
      {body}
      <p className="consent__legal">
        <Link to="/privacy">プライバシーポリシー</Link>
      </p>
    </div>
  );
}
