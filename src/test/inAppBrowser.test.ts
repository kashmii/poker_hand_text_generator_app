import { describe, it, expect } from 'vitest';
import { detectInAppBrowser, externalBrowserUrl } from '../utils/inAppBrowser';

// 実機の User-Agent に近い文字列
const UA = {
  lineIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.16.0',
  lineAndroid:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36 Line/13.18.1/IAB',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 305.0.0.0 (iPhone14,5; iOS 17_0; ja_JP)',
  facebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/430.0.0.0;FBBV/1]',
  safariIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
  chromeDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

describe('detectInAppBrowser', () => {
  it('LINE のアプリ内ブラウザを検出する（iOS / Android）', () => {
    expect(detectInAppBrowser(UA.lineIOS)).toBe('line');
    expect(detectInAppBrowser(UA.lineAndroid)).toBe('line');
  });

  it('Instagram・Facebook のアプリ内ブラウザを検出する', () => {
    expect(detectInAppBrowser(UA.instagram)).toBe('instagram');
    expect(detectInAppBrowser(UA.facebook)).toBe('facebook');
  });

  it('普通のブラウザは検出しない', () => {
    expect(detectInAppBrowser(UA.safariIOS)).toBeNull();
    expect(detectInAppBrowser(UA.chromeAndroid)).toBeNull();
    expect(detectInAppBrowser(UA.chromeDesktop)).toBeNull();
  });

  it('"Online" などの単語の一部には反応しない', () => {
    expect(detectInAppBrowser('SomeApp OnLine/1.0')).toBeNull();
  });
});

describe('externalBrowserUrl', () => {
  it('LINE なら openExternalBrowser=1 を付ける', () => {
    expect(externalBrowserUrl('line', 'https://example.com/setup')).toBe(
      'https://example.com/setup?openExternalBrowser=1',
    );
  });

  it('既存のクエリは残す', () => {
    expect(externalBrowserUrl('line', 'https://example.com/setup?a=1')).toBe(
      'https://example.com/setup?a=1&openExternalBrowser=1',
    );
  });

  it('LINE 以外は null（ブラウザで開くメニューを案内する）', () => {
    expect(externalBrowserUrl('instagram', 'https://example.com/')).toBeNull();
    expect(externalBrowserUrl('facebook', 'https://example.com/')).toBeNull();
  });
});
