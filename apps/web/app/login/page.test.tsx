import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';
import { zhCN } from '@/messages/zh-CN';
import { en } from '@/messages/en';
import { ja } from '@/messages/ja';
import { es } from '@/messages/es';
const messages = { 'zh-CN': zhCN, en, ja, es };
type Locale = keyof typeof messages;
const devButtons = {
  'zh-CN': '本地测试：跳过邮箱，直接进入下一步',
  en: 'Local test: skip email and continue',
  ja: 'ローカルテスト：メール認証を省略して次へ',
  es: 'Prueba local: omitir el correo y continuar',
};
const text = (key: string) => (messages[mocks.locale].login as Record<string, string>)[key];
const mocks = vi.hoisted(() => ({
  devLogin: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  useSession: vi.fn(),
  locale: 'zh-CN' as Locale,
  hostname: 'localhost',
  returnTo: '',
}));
vi.mock('@/components/email-code-auth-form', () => ({ EmailCodeAuthForm: () => null }));
vi.mock('@/hooks/useSession', () => ({ useSession: mocks.useSession }));
vi.mock('@/app/providers-impl', () => ({
  useLocale: () => ({ locale: mocks.locale, t: (key: string) => text(key.replace('login.', '')) ?? key }),
}));
vi.mock('@/lib/assessment-entry', () => ({ resolveAssessmentEntryPath: () => '/assessment' }));
vi.mock('@/lib/guest-assessment', () => ({ migrateGuestAssessment: vi.fn() }));
vi.mock('@/lib/api', () => ({ authApi: { devLogin: mocks.devLogin } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams({ returnTo: mocks.returnTo }),
}));
describe.each(Object.keys(messages) as Locale[])('LoginPage local dev login (%s)', (locale) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locale = locale;
    mocks.hostname = 'localhost';
    mocks.returnTo = '';
    vi.stubGlobal('window', new Proxy(window, {
      get(target, key) {
        if (key === 'location') return { hostname: mocks.hostname, replace: mocks.replace };
        return Reflect.get(target, key, target);
      },
    }));
    mocks.useSession.mockReturnValue({ user: null, loading: false, refresh: mocks.refresh });
    mocks.refresh.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders translated local-only copy with complete locale keys', () => {
    render(<LoginPage />);
    for (const key of ['dev_label', 'dev_button', 'dev_hint', 'dev_session_missing', 'dev_timeout', 'dev_failed', 'entering_hint']) {
      expect(text(key), key).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: devButtons[locale] })).toBeEnabled();
    expect(screen.getByText(text('dev_label'))).toBeInTheDocument();
    expect(screen.getByText(text('dev_hint'))).toBeInTheDocument();
  });

  it.each(['eva.live', 'localhost.example.com'])('hides dev login on %s', (hostname) => {
    mocks.hostname = hostname;
    render(<LoginPage />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mocks.devLogin).not.toHaveBeenCalled();
  });

  it('shows dev login on 127.0.0.1', () => {
    mocks.hostname = '127.0.0.1';
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: devButtons[locale] })).toBeEnabled();
  });

  it.each([undefined, null, {}])('localizes a failure without a server message (%s)', async (error) => {
    vi.useFakeTimers();
    mocks.devLogin.mockRejectedValue(error);
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: devButtons[locale] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByText(text('dev_failed'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: devButtons[locale] })).toBeEnabled();
  });

  it('preserves the original server error instead of translating it', async () => {
    vi.useFakeTimers();
    mocks.devLogin.mockRejectedValue(new Error('服务端返回：开发登录不可用'));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: devButtons[locale] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByText('服务端返回：开发登录不可用')).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ['/profile?tab=history#latest', '/profile?tab=history#latest'],
    ['https://example.com', '/assessment'],
    ['//example.com', '/assessment'],
    ['/api/auth/me', '/assessment'],
    ['/_next/static/file', '/assessment'],
  ])('keeps safe returnTo navigation (%s)', (returnTo, target) => {
    mocks.returnTo = returnTo;
    mocks.useSession.mockReturnValue({
      user: { id: 'local-user', email: 'dev@eva.local' },
      loading: false,
      refresh: mocks.refresh,
    });
    render(<LoginPage />);
    expect(screen.getByRole('status')).toHaveTextContent(text('btn_entering'));
    expect(screen.getByText(text('entering_hint'))).toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith(target);
  });

  it('shows a visible loading state while login is pending, then restores retry on failure', async () => {
    let resolveLogin!: () => void;
    mocks.devLogin.mockReturnValue(new Promise<void>((resolve) => { resolveLogin = resolve; }));
    render(<LoginPage />);

    const button = await screen.findByRole('button', { name: devButtons[locale] });
    fireEvent.click(button);

    expect(await screen.findByRole('status')).toHaveTextContent(text('btn_entering'));
    expect(screen.getByRole('button', { name: text('btn_entering') })).toBeDisabled();
    expect(screen.getByRole('button', { name: text('btn_entering') })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('.dev-login-btn .dev-login-spinner')).toBeInTheDocument();

    resolveLogin();
    expect(await screen.findByText(
      text('dev_session_missing'),
      {},
      { timeout: 2500 },
    ))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: devButtons[locale] })).toBeEnabled());
    expect(screen.queryByRole('button', { name: text('btn_entering') })).not.toBeInTheDocument();
  });

  it('keeps loading visible for 1.5 seconds when the local login fails immediately', async () => {
    vi.useFakeTimers();
    mocks.devLogin.mockRejectedValue(new Error('API unavailable'));
    render(<LoginPage />);

    const button = screen.getByRole('button', { name: devButtons[locale] });
    fireEvent.click(button);

    expect(screen.getByRole('status')).toHaveTextContent(text('btn_entering'));
    expect(screen.getByRole('button', { name: text('btn_entering') })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('API unavailable')).not.toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('API unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: devButtons[locale] })).toBeEnabled();
  });

  it('keeps the clicked button visibly loading until fast local login redirects', async () => {
    vi.useFakeTimers();
    mocks.devLogin.mockResolvedValue(undefined);
    mocks.refresh.mockResolvedValue({ id: 'local-user', email: 'dev@eva.local' });
    const view = render(<LoginPage />);

    const button = screen.getByRole('button', { name: devButtons[locale] });
    fireEvent.click(button);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    mocks.useSession.mockReturnValue({
      user: { id: 'local-user', email: 'dev@eva.local' },
      loading: false,
      refresh: mocks.refresh,
    });
    view.rerender(<LoginPage />);

    expect(screen.getByRole('status')).toHaveTextContent(text('btn_entering'));
    expect(screen.getByRole('button', { name: text('btn_entering') })).toBeDisabled();
    expect(document.querySelector('.dev-login-btn .dev-login-spinner')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(screen.getByRole('button', { name: text('btn_entering') })).toBeDisabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledWith({ force: true, signal: expect.any(AbortSignal) });
    expect(mocks.devLogin).toHaveBeenCalledWith(expect.any(AbortSignal));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText(text('entering_hint'))).toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith('/assessment');
    view.unmount();
  });

  it('times out a stalled local login and lets the user retry', async () => {
    vi.useFakeTimers();
    mocks.devLogin.mockImplementation((signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    render(<LoginPage />);

    const button = screen.getByRole('button', { name: devButtons[locale] });
    fireEvent.click(button);
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByText(text('dev_timeout')))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: devButtons[locale] })).toBeEnabled();
  });

  it('times out a stalled session refresh after dev login succeeds', async () => {
    vi.useFakeTimers();
    mocks.devLogin.mockResolvedValue(undefined);
    mocks.refresh.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: devButtons[locale] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText(text('dev_timeout'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: devButtons[locale] })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
