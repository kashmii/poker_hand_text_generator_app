import type { HandData } from '../types/poker';
import { apiFetch } from './client';

/**
 * HandSummary は一覧表示用のハンドの概要。Go の hand.Summary と対応する。
 * playedOn はセッションの日付（YYYY-MM-DD）。不明なら null。
 */
export interface HandSummary {
  id: string;
  title: string;
  venueName: string;
  playedOn: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** Hand はハンド1件。概要に加えて data（HandData 丸ごと）を持つ。 */
export interface Hand extends HandSummary {
  data: HandData;
}

/**
 * listHands は自分のハンドの概要を新しい順に取得する。
 * 未ログインや 401 のときは apiFetch が ApiError を投げるので、呼び出し側でログインを促す。
 */
export async function listHands(): Promise<HandSummary[]> {
  const { hands } = await apiFetch<{ hands: HandSummary[] }>('/hands');
  return hands;
}

/** getHand は自分のハンド1件を取得する。存在しない・他人のものなら ApiError(404)。 */
export function getHand(id: string): Promise<Hand> {
  return apiFetch<Hand>(`/hands/${id}`);
}

/**
 * putHand はハンドを作成または更新する。本文は HandData をそのまま送る。
 * 同じ id で何度送っても結果は同じなので、通信失敗時に再送しても二重登録にならない。
 */
export function putHand(hand: HandData): Promise<HandSummary> {
  return apiFetch<HandSummary>(`/hands/${hand.id}`, {
    method: 'PUT',
    body: JSON.stringify(hand),
  });
}

/** deleteHand は自分のハンドを削除する。存在しない・他人のものなら ApiError(404)。 */
export function deleteHand(id: string): Promise<void> {
  return apiFetch<void>(`/hands/${id}`, { method: 'DELETE' });
}
