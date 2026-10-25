import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// ログイン状態はモックにして、テストから切り替える
const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ hands: [] }) }));

import SettingsPage from '../pages/SettingsPage';
import AuthBar from '../components/auth/AuthBar';

const signOut = vi.fn();
const signInWithGoogle = vi.fn();

function auth(session: object | null) {
  mockUseAuth.mockReturnValue({ enabled: true, loading: false, session, signOut, signInWithGoogle });
}

const loggedIn = { user: { id: 'u1', email: 'me@example.com' } };

// 今いる画面と、受け取った state を表示する
function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + ' ' + JSON.stringify(location.state)}</p>;
}

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/setup" element={<><AuthBar /><Where /></>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsPage', () => {
  it('ログイン中のアカウントと、削除の依頼先を出す', () => {
    auth(loggedIn);
    renderAt('/settings');

    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'pokerhtgapp@gmail.com' })).toHaveAttribute('href', 'mailto:pokerhtgapp@gmail.com');
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/privacy');
  });

  it('ログアウトするとトップへ戻る', async () => {
    auth(loggedIn);
    signOut.mockResolvedValue(undefined);
    renderAt('/settings');

    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/setup'));
    expect(signOut).toHaveBeenCalled();
  });

  it('ログアウトに失敗したら、この画面に残ってエラーを出す', async () => {
    auth(loggedIn);
    signOut.mockRejectedValue(new Error('network'));
    renderAt('/settings');

    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));

    expect(await screen.findByText('ログアウトに失敗しました')).toBeInTheDocument();
  });

  it('「戻る」は来た画面へ、その画面の state ごと戻す', () => {
    auth(loggedIn);
    renderAt('/settings', { from: '/history', returnState: { from: '/result' } });

    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/history {"from":"/result"}');
  });

  it('戻り先がなければトップへ戻る', () => {
    auth(loggedIn);
    renderAt('/settings');

    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/setup');
  });

  it('未ログインならログインを促す', () => {
    auth(null);
    renderAt('/settings');

    expect(screen.getByText('ログインしていません。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google でログイン' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
  });
});

describe('AuthBar', () => {
  it('ログイン中はログアウトではなくアカウント画面への入口を出す', () => {
    auth(loggedIn);
    renderAt('/setup');

    expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'アカウント' }));

    // アカウント画面に移り、戻り先として今の画面を覚えている
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/setup');
  });
});
