import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// supabase はログイン状態を返すモックに差し替える（テストでは実際の Supabase に繋がない）
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

/**
 * client.ts は読み込み時に VITE_API_BASE_URL を読む。
 * 環境変数を差し込んでから import し直すため、毎回モジュールをリセットして動的 import する。
 */
async function loadClient(token: string | null) {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
  const { supabase } = await import('../lib/supabase');
  (supabase!.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
  });
  const client = await import('../api/client');
  return client;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('apiFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('ログイン中は Authorization: Bearer を付けて呼ぶ', async () => {
    const { apiFetch } = await loadClient('tok123');
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200));

    await apiFetch('/hands');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/hands');
    expect((opts.headers as Headers).get('Authorization')).toBe('Bearer tok123');
  });

  it('未ログインのときは Authorization を付けない', async () => {
    const { apiFetch } = await loadClient(null);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200));

    await apiFetch('/hands');

    const [, opts] = fetchMock.mock.calls[0];
    expect((opts.headers as Headers).get('Authorization')).toBeNull();
  });

  it('401 のときは status 付きの ApiError を投げる', async () => {
    const { apiFetch, ApiError } = await loadClient('tok123');
    fetchMock.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));

    await expect(apiFetch('/hands')).rejects.toMatchObject({
      status: 401,
      message: 'unauthorized',
    });
    // ApiError のインスタンスであること
    const err = await apiFetch('/hands').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
  });
});
