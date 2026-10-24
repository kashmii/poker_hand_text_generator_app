import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ========== Context型 ==========
interface AuthContextValue {
  /** Supabase の設定があり、ログイン機能が使えるか */
  enabled: boolean;
  /** 起動直後、ログイン状態を確認している間は true */
  loading: boolean;
  session: Session | null;
  /** Google のログイン画面へ移動する（ページ全体が移動するので、メモリ上の入力内容は消える） */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ========== Provider ==========
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabase !== null);

  useEffect(() => {
    if (!supabase) return;
    // 起動時: 保存済みのログイン状態を読む（Google から戻ってきた直後は ?code= をここで交換する）
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // ログイン・ログアウト・トークン更新のたびに呼ばれる
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // ログイン後に今の画面へ戻る（Supabase の Redirect URLs に登録した URL のみ可）
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return (
    <AuthContext.Provider
      value={{ enabled: supabase !== null, loading, session, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ========== Hook ==========
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
