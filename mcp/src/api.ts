import type { Card, HandData } from '../../src/types/poker';

/** HandSummary は一覧用のハンドの概要。Go の hand.Summary と対応する。 */
export interface HandSummary {
  id: string;
  title: string;
  venueName: string;
  playedOn: string | null; // YYYY-MM-DD。不明なら null
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  heroHoleCards?: Card[] | null;
  board?: Card[];
}

/** Hand はハンド1件。概要に加えて data（フロントの HandData 丸ごと）を持つ。 */
export interface Hand extends HandSummary {
  data: HandData;
}

/** HandsApi は MCP の tool から使う、Go の /hands の読み取り口。テストでは偽物を差し込む */
export interface HandsApi {
  listHands(): Promise<HandSummary[]>;
  getHand(id: string): Promise<Hand>;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Cloud Run のコールドスタートを待てる程度の長さ
const timeoutMs = 15_000;

/**
 * createHandsApi は個人用APIキーで Go の API を呼ぶ HandsApi を作る。
 * キーは読み取り専用なので、ここにも GET しか用意しない。
 */
export function createHandsApi(baseUrl: string, apiKey: string, fetchFn: typeof fetch = fetch): HandsApi {
  const base = baseUrl.replace(/\/$/, '');

  async function get<T>(path: string): Promise<T> {
    const res = await fetchFn(base + path, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(res.status, `GET ${path} failed: ${res.status} ${body?.error ?? res.statusText}`);
    }
    return (await res.json()) as T;
  }

  return {
    async listHands() {
      const { hands } = await get<{ hands: HandSummary[] }>('/hands');
      return hands;
    },
    getHand(id) {
      return get<Hand>(`/hands/${encodeURIComponent(id)}`);
    },
  };
}
