import { supabase } from '../lib/supabase';

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Go の API を呼ぶ。ログイン中なら Authorization: Bearer <JWT> を付ける。
 * トークンは supabase-js が自動で更新するので、毎回最新のものを取り出して使う。
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!baseUrl) throw new Error('VITE_API_BASE_URL is not set');

  const headers = new Headers(init.headers);
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(baseUrl + path, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** ログイン中のユーザーIDを返す（ログインと Go の JWT 検証がつながったかの確認用） */
export function getMe() {
  return apiFetch<{ userId: string }>('/me');
}
