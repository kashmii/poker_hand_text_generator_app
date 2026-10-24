import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ログイン状態と Supabase の OAuth API はモックにして、テストから制御する
const { mockUseAuth, oauth, redirectMock } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  oauth: {
    getAuthorizationDetails: vi.fn(),
    approveAuthorization: vi.fn(),
    denyAuthorization: vi.fn(),
  },
  redirectMock: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { oauth } } }));
vi.mock('../utils/redirect', () => ({ redirectTo: redirectMock }));

import OAuthConsentPage from '../pages/OAuthConsentPage';

const signInWithGoogle = vi.fn();
const signOut = vi.fn();

function auth(session: object | null) {
  mockUseAuth.mockReturnValue({ enabled: true, loading: false, session, signInWithGoogle, signOut });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OAuthConsentPage />
    </MemoryRouter>,
  );
}

const details = {
  authorization_id: 'auth-1',
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  client: { id: 'c1', name: 'Claude', uri: '', logo_uri: '' },
  user: { id: 'u1', email: 'me@example.com' },
  scope: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('OAuthConsentPage', () => {
  it('未ログインなら、ID を覚えてからこの画面に戻るログインへ進む', () => {
    auth(null);
    renderAt('/oauth/consent?authorization_id=auth-1');

    fireEvent.click(screen.getByRole('button', { name: 'Google でログインして続ける' }));

    expect(sessionStorage.getItem('oauth-consent:authorization-id')).toBe('auth-1');
    expect(signInWithGoogle).toHaveBeenCalledWith('/oauth/consent');
    expect(oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  });

  it('ログイン後に戻ってきたら、覚えておいた ID でリクエストを読む', async () => {
    auth({ user: { id: 'u1' } });
    sessionStorage.setItem('oauth-consent:authorization-id', 'auth-1');
    oauth.getAuthorizationDetails.mockResolvedValue({ data: details, error: null });
    renderAt('/oauth/consent');

    expect(await screen.findByText('Claude')).toBeInTheDocument();
    expect(oauth.getAuthorizationDetails).toHaveBeenCalledWith('auth-1');
  });

  it('許可すると、クライアントへ戻る', async () => {
    auth({ user: { id: 'u1' } });
    oauth.getAuthorizationDetails.mockResolvedValue({ data: details, error: null });
    oauth.approveAuthorization.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?code=x' }, error: null });
    renderAt('/oauth/consent?authorization_id=auth-1');

    expect(await screen.findByText(/ハンドの追加・変更・削除はできません/)).toBeInTheDocument();
    expect(screen.getByText(/me@example.com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '許可する' }));

    await waitFor(() => expect(redirectMock).toHaveBeenCalledWith('https://claude.ai/cb?code=x'));
    expect(oauth.approveAuthorization).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true });
    expect(oauth.denyAuthorization).not.toHaveBeenCalled();
  });

  it('拒否すると、拒否としてクライアントへ戻る', async () => {
    auth({ user: { id: 'u1' } });
    oauth.getAuthorizationDetails.mockResolvedValue({ data: details, error: null });
    oauth.denyAuthorization.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?error=access_denied' }, error: null });
    renderAt('/oauth/consent?authorization_id=auth-1');

    fireEvent.click(await screen.findByRole('button', { name: '拒否する' }));

    await waitFor(() => expect(redirectMock).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied'));
    expect(oauth.approveAuthorization).not.toHaveBeenCalled();
  });

  it('許可済みのクライアントなら、確認せずに戻す', async () => {
    auth({ user: { id: 'u1' } });
    oauth.getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?code=y' }, error: null });
    renderAt('/oauth/consent?authorization_id=auth-1');

    await waitFor(() => expect(redirectMock).toHaveBeenCalledWith('https://claude.ai/cb?code=y'));
    expect(screen.queryByRole('button', { name: '許可する' })).not.toBeInTheDocument();
  });

  it('リクエストが見つからないときは、やり直しを案内する', async () => {
    auth({ user: { id: 'u1' } });
    oauth.getAuthorizationDetails.mockResolvedValue({ data: null, error: new Error('not found') });
    renderAt('/oauth/consent?authorization_id=expired');

    expect(await screen.findByText(/期限が切れています/)).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('ID がなければ、何も呼ばずに案内だけ出す', () => {
    auth({ user: { id: 'u1' } });
    renderAt('/oauth/consent');

    expect(screen.getByText(/接続のリクエストが見つかりません/)).toBeInTheDocument();
    expect(oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  });
});
