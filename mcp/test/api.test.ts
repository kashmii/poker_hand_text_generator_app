import { describe, expect, it } from 'vitest';

import { ApiError, createHandsApi } from '../src/api';

type Call = { url: string; init?: RequestInit };

function fakeFetch(status: number, body: unknown, calls: Call[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

describe('createHandsApi', () => {
  it('個人用キーを Bearer で付けて GET する', async () => {
    const calls: Call[] = [];
    const api = createHandsApi('https://api.example.com/', 'secret-key', fakeFetch(200, { hands: [] }, calls));

    expect(await api.listHands()).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.example.com/hands'); // 末尾のスラッシュは重ねない
    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe('Bearer secret-key');
    expect(calls[0].init?.method ?? 'GET').toBe('GET');
  });

  it('getHand は id をパスに入れる', async () => {
    const calls: Call[] = [];
    const api = createHandsApi('https://api.example.com', 'k', fakeFetch(200, { id: 'x' }, calls));
    await api.getHand('6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b');
    expect(calls[0].url).toBe('https://api.example.com/hands/6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b');
  });

  it('エラーは status と API のメッセージを持つ ApiError にする', async () => {
    const api = createHandsApi('https://api.example.com', 'k', fakeFetch(404, { error: 'not found' }, []));
    const err = await api.getHand('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toBe('GET /hands/x failed: 404 not found');
  });
});
