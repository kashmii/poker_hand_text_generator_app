import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * Supabase クライアント（ログインにだけ使う。テーブルの読み書きは Go の API 経由）。
 * 環境変数が未設定のとき（テストなど）は null になり、ログイン機能は表示されない。
 */
export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          // Google から戻ってきたとき、URL の ?code= をトークンに交換する方式（トークンが URL に載らない）
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
