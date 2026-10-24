/** 別のサイト（OAuth クライアントなど）へページごと移動する。テストで差し替えられるよう関数に分けている */
export function redirectTo(url: string): void {
  window.location.assign(url);
}
