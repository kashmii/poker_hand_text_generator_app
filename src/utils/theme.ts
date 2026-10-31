// 画面の配色テーマ。色の中身は App.css の :root（デフォルト）と :root[data-theme='...'] に定義する。
// 選んだテーマは端末の localStorage に保存する（アカウントとは紐付けない）。

export type Theme = 'navy' | 'mist';

export const DEFAULT_THEME: Theme = 'navy';

export const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'navy', label: 'ネイビー' },
  { value: 'mist', label: 'ミスト（ライト）' },
];

export const THEME_STORAGE_KEY = 'theme';

export function parseTheme(value: string | null | undefined): Theme {
  return THEME_OPTIONS.some((o) => o.value === value) ? (value as Theme) : DEFAULT_THEME;
}

// プライベートブラウズなどで localStorage が使えないときはデフォルトに倒す
export function loadTheme(storage: Pick<Storage, 'getItem'> | undefined): Theme {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(storage: Pick<Storage, 'setItem'> | undefined, theme: Theme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 保存できなくても、今開いている画面の切替は効かせる
  }
}

// デフォルトは属性なし（:root の値）、それ以外は data-theme で上書きを効かせる
export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === DEFAULT_THEME) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

function getStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// 起動時に保存済みテーマを適用する
export function initTheme(): Theme {
  const theme = loadTheme(getStorage());
  applyTheme(document.documentElement, theme);
  return theme;
}

// 設定画面での切替: 適用して保存する
export function setTheme(theme: Theme): void {
  applyTheme(document.documentElement, theme);
  saveTheme(getStorage(), theme);
}
