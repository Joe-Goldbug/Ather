import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlayPage from './page';

const mocks = vi.hoisted(() => ({
  getOpening: vi.fn(),
  complete: vi.fn(),
  claim: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@/hooks/useSession', () => ({ useSession: mocks.useSession }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    guestAssessmentApi: {
      getOpening: mocks.getOpening,
      complete: mocks.complete,
      claim: mocks.claim,
    },
  };
});

const opening = {
  guest_run_id: '8f5691be-f7d0-4d9f-b21a-52fc40b17c1e',
  episode_id: 'rain-before-stop',
  episode_version: 'v1',
  question_bank_version: 'guest-rain-before-stop-v1',
  copy_version: 'zh-CN-v1',
  expires_at: '2099-01-01T00:00:00.000Z',
  nodes: Array.from({ length: 6 }, (_, index) => ({
    id: `node-${index + 1}`,
    title: `节点 ${index + 1}`,
    context: `情境 ${index + 1}`,
    options: [
      { id: 'A' as const, text: `选择 A${index + 1}`, consequence: `后果 A${index + 1}` },
      { id: 'B' as const, text: `选择 B${index + 1}`, consequence: `后果 B${index + 1}` },
      { id: 'C' as const, text: `选择 C${index + 1}`, consequence: `后果 C${index + 1}` },
      { id: 'D' as const, text: `选择 D${index + 1}`, consequence: `后果 D${index + 1}` },
    ],
  })),
};

const record = {
  episode_id: 'rain-before-stop',
  episode_version: 'v1',
  episode_title: '雨停之前',
  evidence_kind: 'simulation' as const,
  science_status: 'candidate_only' as const,
  source_independence_group: 'simulation:rain-before-stop:v1',
  summary: '本章记录',
  pattern: '选择形成的具体观察',
  benefits: '收益',
  costs: '代价',
  exceptions: '例外',
  unknowns: '仍不确定',
};

describe('PlayPage guest opening acceptance', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ user: null, loading: false });
    mocks.getOpening.mockResolvedValue(opening);
    mocks.complete.mockResolvedValue({ result: record, claim_token: 'payload.signature' });
  });

  it('does not fetch the story before explicit 18+ confirmation', async () => {
    render(<PlayPage />);

    expect(await screen.findByText('我已满 18 岁，开始玩')).toBeInTheDocument();
    expect(mocks.getOpening).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('我已满 18 岁，开始玩'));
    expect(await screen.findByText('节点 1')).toBeInTheDocument();
    expect(mocks.getOpening).toHaveBeenCalledTimes(1);
  });

  it('shows a busy spinner while preparing the next step', async () => {
    let resolveOpening!: (value: typeof opening) => void;
    mocks.getOpening.mockReturnValue(new Promise((resolve) => {
      resolveOpening = resolve;
    }));
    render(<PlayPage />);

    fireEvent.click(await screen.findByRole('button', { name: '我已满 18 岁，开始玩' }));

    const button = await screen.findByRole('button', { name: '正在准备…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.action-loading-spinner')).toBeInTheDocument();

    resolveOpening(opening);
    expect(await screen.findByText('节点 1')).toBeInTheDocument();
  });

  it('keeps the next-step loading visible when the request resolves immediately', async () => {
    render(<PlayPage />);
    const startedAt = performance.now();

    fireEvent.click(await screen.findByRole('button', { name: '我已满 18 岁，开始玩' }));

    const button = screen.getByRole('button', { name: '正在准备…' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.action-loading-spinner')).toBeInTheDocument();
    expect(await screen.findByText('节点 1')).toBeInTheDocument();
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(650);
  });

  it('submits six decisions as an adult-confirmed chapter and offers the real login route', async () => {
    render(<PlayPage />);
    fireEvent.click(await screen.findByText('我已满 18 岁，开始玩'));

    for (let index = 1; index <= 6; index += 1) {
      const startedAt = index === 1 ? performance.now() : 0;
      fireEvent.click(await screen.findByText(`选择 A${index}`));
      if (index === 1) {
        expect(screen.getByRole('status')).toHaveTextContent('正在记录选择并进入下一题…');
        const pendingChoice = screen.getByRole('button', { name: /正在记录并进入下一题/ });
        expect(pendingChoice).toBeDisabled();
        expect(pendingChoice).toHaveAttribute('aria-busy', 'true');
        expect(pendingChoice.querySelector('.action-loading-spinner')).toBeInTheDocument();
      }
      expect(screen.queryByRole('button', { name: '继续' })).toBeNull();
      if (index < 6) {
        expect(await screen.findByText(`节点 ${index + 1}`)).toBeInTheDocument();
        if (index === 1) expect(performance.now() - startedAt).toBeGreaterThanOrEqual(650);
        expect(screen.getByRole('status')).toHaveTextContent(`后果 A${index}`);
      }
    }

    expect(await screen.findByText('本章记录')).toBeInTheDocument();
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      guest_run_id: opening.guest_run_id,
      version: opening.episode_version,
      adult_confirmed: true,
      answers: expect.arrayContaining([{ node_id: 'node-6', choice_id: 'A' }]),
    }));
    expect(screen.getByRole('link', { name: '注册或登录并保存' }))
      .toHaveAttribute('href', '/login?returnTo=%2Fplay');
    await waitFor(() => expect(sessionStorage.getItem('eva_guest_claim_token')).toBe('payload.signature'));
  });

  it('restores an older pending consequence directly into the next question', async () => {
    sessionStorage.setItem('eva_guest_session', JSON.stringify({
      adult_confirmed: true,
      opening,
      answers: [{ node_id: 'node-1', choice_id: 'A' }],
      pending_consequence: '后果 A1',
    }));

    render(<PlayPage />);

    expect(await screen.findByText('节点 2')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('后果 A1');
    expect(screen.queryByRole('button', { name: '继续' })).toBeNull();
  });

  it('keeps completed answers available to retry when automatic settlement fails', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('network unavailable'));
    render(<PlayPage />);
    fireEvent.click(await screen.findByText('我已满 18 岁，开始玩'));

    for (let index = 1; index <= 6; index += 1) {
      fireEvent.click(await screen.findByText(`选择 A${index}`));
    }

    expect(await screen.findByRole('button', { name: '重试结算' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('你的选择仍保存在这个浏览器中');
    fireEvent.click(screen.getByRole('button', { name: '重试结算' }));
    expect(await screen.findByText('本章记录')).toBeInTheDocument();
    expect(mocks.complete).toHaveBeenCalledTimes(2);
  });

  it('keeps local chapter data when authenticated claiming fails', async () => {
    mocks.useSession.mockReturnValue({ user: { id: 'user-1' }, loading: false });
    mocks.claim.mockRejectedValue(new Error('network unavailable'));
    sessionStorage.setItem('eva_guest_claim_token', 'payload.signature');
    sessionStorage.setItem('eva_guest_session', JSON.stringify({
      adult_confirmed: true,
      opening,
      answers: [],
      pending_consequence: null,
    }));

    render(<PlayPage />);

    expect(await screen.findByText('保存暂时失败。你的本地记录仍在，可以稍后重试。')).toBeInTheDocument();
    expect(sessionStorage.getItem('eva_guest_claim_token')).toBe('payload.signature');
    expect(sessionStorage.getItem('eva_guest_session')).not.toBeNull();
  });
});
