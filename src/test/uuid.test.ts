import { describe, it, expect, vi, afterEach } from 'vitest';
import { uuid } from '../utils/uuid';

// UUID v4 の形式（バージョン 4、バリアント 8〜b）
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uuid', () => {
  it('crypto.randomUUID があればそれを使う', () => {
    expect(uuid()).toMatch(UUID_V4);
  });

  it('randomUUID が無い環境（http の LAN IP など）でも UUID v4 を作る', () => {
    // 安全なコンテキストでないブラウザと同じく、getRandomValues だけがある状態にする
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });

    const ids = Array.from({ length: 100 }, () => uuid());
    ids.forEach((id) => expect(id).toMatch(UUID_V4));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
