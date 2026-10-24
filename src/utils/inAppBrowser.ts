/**
 * アプリ内ブラウザ（LINE・Instagram・Facebook）の検出。
 * Google はこれらのブラウザからのログインを禁止している（403 disallowed_useragent）ため、
 * 検出したらログインボタンの代わりに Safari / Chrome で開くよう案内する。
 */
export type InAppBrowser = 'line' | 'instagram' | 'facebook';

const PATTERNS: { name: InAppBrowser; pattern: RegExp }[] = [
  { name: 'line', pattern: /\bLine\//i },
  { name: 'instagram', pattern: /\bInstagram\b/i },
  { name: 'facebook', pattern: /\bFB(AN|AV|_IAB)\b/ },
];

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  return PATTERNS.find(({ pattern }) => pattern.test(userAgent))?.name ?? null;
}

export const IN_APP_BROWSER_LABELS: Record<InAppBrowser, string> = {
  line: 'LINE',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

/**
 * LINE は URL に openExternalBrowser=1 を付けると、端末の標準ブラウザで開く。
 * 他のアプリには同じ仕組みがないので null（「ブラウザで開く」メニューを案内する）。
 */
export function externalBrowserUrl(browser: InAppBrowser, currentUrl: string): string | null {
  if (browser !== 'line') return null;
  const url = new URL(currentUrl);
  url.searchParams.set('openExternalBrowser', '1');
  return url.toString();
}
