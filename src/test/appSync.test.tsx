import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { HandData } from '../types/poker';

// useAuth はログイン状態を切り替えられるようモックにする
const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: mockUseAuth }));

// API 呼び出しはモックにして、同期の成否をテストから制御する
vi.mock('../api/hands', () => ({ putHand: vi.fn(), deleteHand: vi.fn() }));

import { AppProvider, useApp } from '../context/AppContext';
import { putHand, deleteHand } from '../api/hands';

const putHandMock = vi.mocked(putHand);
const deleteHandMock = vi.mocked(deleteHand);

function loggedIn() {
  mockUseAuth.mockReturnValue({ session: { user: { id: 'u1' } } });
}
function loggedOut() {
  mockUseAuth.mockReturnValue({ session: null });
}

const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

// 同期対象の最小限のハンド（putHand はモックなので中身は問わない）
const hand = { id: 'h1', handNumber: 1 } as HandData;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveHand の同期', () => {
  it('ログイン中に保存が成功すると「同期済み」になる', async () => {
    loggedIn();
    putHandMock.mockResolvedValue({} as never);
    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      result.current.saveHand(hand);
    });

    expect(putHandMock).toHaveBeenCalledWith(hand);
    expect(result.current.syncStatus['h1']).toBe('synced');
  });

  it('保存の送信が失敗すると「未同期」になり、再送で「同期済み」になる', async () => {
    loggedIn();
    putHandMock.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      result.current.saveHand(hand);
    });
    expect(result.current.syncStatus['h1']).toBe('unsynced');

    // 再送は成功させる
    putHandMock.mockResolvedValueOnce({} as never);
    await act(async () => {
      result.current.resendHand('h1');
    });
    expect(result.current.syncStatus['h1']).toBe('synced');
  });

  it('未ログインのときは同期せず、状態も持たない', async () => {
    loggedOut();
    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      result.current.saveHand(hand);
    });

    expect(putHandMock).not.toHaveBeenCalled();
    expect(result.current.syncStatus['h1']).toBeUndefined();
    // 手元には保存されている
    expect(result.current.hands).toHaveLength(1);
  });

  it('削除するとログイン中は API を呼び、同期状態も消える', async () => {
    loggedIn();
    putHandMock.mockResolvedValue({} as never);
    deleteHandMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useApp(), { wrapper });

    await act(async () => {
      result.current.saveHand(hand);
    });
    expect(result.current.syncStatus['h1']).toBe('synced');

    await act(async () => {
      result.current.deleteHand('h1');
    });
    expect(deleteHandMock).toHaveBeenCalledWith('h1');
    expect(result.current.syncStatus['h1']).toBeUndefined();
    expect(result.current.hands).toHaveLength(0);
  });
});
