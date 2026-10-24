/**
 * UUID v4 を作る（ハンドのID。DBの主キーにそのまま使う）。
 * crypto.randomUUID は安全なコンテキスト（HTTPS・localhost）でしか使えず、
 * スマホから LAN の IP（http）で開いた開発サーバーでは存在しないため、
 * そのときは crypto.getRandomValues で同じ形式を組み立てる。
 */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // バージョン 4
  b[8] = (b[8] & 0x3f) | 0x80; // バリアント（RFC 4122）
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
