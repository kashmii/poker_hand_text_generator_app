import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  initTheme,
  loadTheme,
  parseTheme,
  saveTheme,
  setTheme,
} from '../utils/theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('parseTheme', () => {
  it('既知のテーマはそのまま返す', () => {
    expect(parseTheme('navy')).toBe('navy');
    expect(parseTheme('mist')).toBe('mist');
  });

  it('未知の値・空はデフォルトに倒す', () => {
    expect(parseTheme('pink')).toBe(DEFAULT_THEME);
    expect(parseTheme(null)).toBe(DEFAULT_THEME);
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME);
  });
});

describe('loadTheme / saveTheme', () => {
  it('保存したテーマを読み戻せる', () => {
    const storage = memoryStorage();
    saveTheme(storage, 'mist');
    expect(storage.data[THEME_STORAGE_KEY]).toBe('mist');
    expect(loadTheme(storage)).toBe('mist');
  });

  it('未保存ならデフォルト', () => {
    expect(loadTheme(memoryStorage())).toBe(DEFAULT_THEME);
  });

  it('storage が無い・例外を投げるときも落ちない', () => {
    expect(loadTheme(undefined)).toBe(DEFAULT_THEME);
    expect(loadTheme(throwingStorage)).toBe(DEFAULT_THEME);
    expect(() => saveTheme(undefined, 'mist')).not.toThrow();
    expect(() => saveTheme(throwingStorage, 'mist')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('デフォルト以外は data-theme を付け、デフォルトでは外す', () => {
    const el = document.createElement('html');
    applyTheme(el, 'mist');
    expect(el.getAttribute('data-theme')).toBe('mist');
    applyTheme(el, DEFAULT_THEME);
    expect(el.hasAttribute('data-theme')).toBe(false);
  });
});

describe('initTheme / setTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('setTheme で適用と保存をし、initTheme で復元する', () => {
    setTheme('mist');
    expect(document.documentElement.getAttribute('data-theme')).toBe('mist');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('mist');

    document.documentElement.removeAttribute('data-theme');
    expect(initTheme()).toBe('mist');
    expect(document.documentElement.getAttribute('data-theme')).toBe('mist');
  });
});
