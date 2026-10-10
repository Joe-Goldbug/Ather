import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlayPage from './page';

const mocks = vi.hoisted(() => ({
  getOpening: vi.fn(),
  complete: vi.fn(),
  claim: vi.fn(),
  respond: vi.fn(),
  useSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/hooks/useSession', () => ({ useSession: mocks.useSession }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    guestAssessmentApi: {
      getOpening: mocks.getOpening,
      complete: mocks.complete,
      claim: mocks.claim,
    },
    themeAssessmentApi: { respond: mocks.respond },
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
  episode_title: '突发压力与协作应对',
  evidence_kind: 'simulation' as const,
  science_status: 'candidate_only' as const,
  source_independence_group: 'simulation:rain-before-stop:v1',
  summary: '本章记录',
  pattern: '选择形成的具体观察',
  benefits: '收益',
  costs: '代价',
  exceptions: '例外',
  unknowns: '仍不确定',
  story_replay: '故事回放',
  observations: [{
    id: 'guest:approach:primary',
    title: '主要做法',
    text: '这条观察有明确的情境依据。',
    evidence_node_ids: ['node-1'],
    evidence: [{ node_id: 'node-1', node_title: '节点 1', choice_text: '选择 A1' }],
    reflection_question: '这符合现实中的你吗？',
  }],
};

describe('PlayPage guest opening acceptance', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ user: null, loading: false });
    mocks.getOpening.mockResolvedValue(opening);
    mocks.complete.mockResolvedValue({ result: record, claim_token: 'payload.signature' });
  });

  it('does not fetch the story before user starts the scenario', async () => {
    render(<PlayPage />);

    expect(await screen.findByText('进去情景')).toBeInTheDocument();
    expect(mocks.getOpening).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('进去情景'));
    expect(await screen.findByText('节点 1')).toBeInTheDocument();
    expect(mocks.getOpening).toHaveBeenCalledTimes(1);
  });

  it('shows a busy spinner while preparing the next step', async () => {
    let resolveOpening!: (value: typeof opening) => void;
    mocks.getOpening.mockReturnValue(new Promise((resolve) => {
      resolveOpening = resolve;
    }));
    render(<PlayPage />);

    fireEvent.click(await screen.findByRole('button', { name: '进去情景' }));

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

    fireEvent.click(await screen.findByRole('button', { name: '进去情景' }));

    const button = screen.getByRole('button', { name: '正在准备…' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.action-loading-spinner')).toBeInTheDocument();
    expect(await screen.findByText('节点 1')).toBeInTheDocument();
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(650);
  });

  it('submits six decisions as an adult-confirmed chapter and offers the real login route', async () => {
    render(<PlayPage />);
    fireEvent.click(await screen.findByText('进去情景'));

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
    expect(screen.getByText('这次的你，怎样面对事情')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: '像这次的我' });
    const partialBtn = screen.getByRole('button', { name: '有一部分像' });
    const disputeBtn = screen.getByRole('button', { name: '这里说得不对' });

    expect(confirmBtn).toHaveAttribute('aria-pressed', 'false');
    expect(partialBtn).toHaveAttribute('aria-pressed', 'false');
    expect(disputeBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(disputeBtn);
    expect(screen.getByText(/这条需要重新理解，登录保存后会保留你的异议/)).toBeInTheDocument();
    expect(disputeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(confirmBtn).toHaveAttribute('aria-pressed', 'false');

    const noteInput = screen.getByPlaceholderText(/选填：补充你这样处理的真实原因或不同看法/);
    expect(noteInput).toHaveAttribute('aria-label', '补充真实原因或不同看法');
    expect(noteInput).toHaveAttribute('maxlength', '500');
    expect(noteInput).toHaveStyle({ fontSize: '1rem' });
    fireEvent.change(noteInput, { target: { value: '现实中我会直接找备用人选' } });
    expect(noteInput).toHaveValue('现实中我会直接找备用人选');

    expect(JSON.parse(sessionStorage.getItem('eva_guest_feedback')!)).toEqual({
      'guest:approach:primary': {
        action: 'dispute',
        note: '现实中我会直接找备用人选',
      },
    });

    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      guest_run_id: opening.guest_run_id,
      version: opening.episode_version,
      adult_confirmed: true,
      answers: expect.arrayContaining([{ node_id: 'node-6', choice_id: 'A' }]),
    }));
    expect(screen.getByRole('link', { name: '注册或登录并保存' }))
      .toHaveAttribute('href', '/login?returnTo=%2Fplay');
    await waitFor(() => expect(sessionStorage.getItem('eva_guest_claim_token')).toBe('payload.signature'));
  }, 15_000);

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
    fireEvent.click(await screen.findByText('进去情景'));

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

  it('restores previously recorded user feedback and note across sessions', async () => {
    sessionStorage.setItem('eva_guest_claim_token', 'payload.signature');
    sessionStorage.setItem('eva_guest_feedback', JSON.stringify({
      'guest:approach:primary': { action: 'confirm', note: '这确实符合我的应对方式' },
    }));
    mocks.useSession.mockReturnValue({ user: { id: 'user-1' }, loading: false });
    mocks.claim.mockResolvedValue({ round_id: 'round-1', result: { ...record, guest_report: record } });

    render(<PlayPage />);

    expect(await screen.findByText('本章记录已保存')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: '✓ 像这次的我' });
    expect(confirmBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('已记下：这条像你这次的反应。')).toBeInTheDocument();
    expect(screen.getByDisplayValue('这确实符合我的应对方式')).toBeInTheDocument();
    expect(mocks.respond).toHaveBeenCalledWith('round-1', expect.objectContaining({
      action: 'confirm',
      observation_question_id: 'guest:approach:primary',
      explanation: '这确实符合我的应对方式',
    }));
    expect(mocks.replace).toHaveBeenCalledWith('/theme-assessment?roundId=round-1');
  });

  it('resets feedback state and storage when starting a new assessment run', async () => {
    sessionStorage.setItem('eva_guest_feedback', JSON.stringify({
      action: 'dispute',
      note: '旧的反馈意见',
    }));

    render(<PlayPage />);

    expect(await screen.findByText('进去情景')).toBeInTheDocument();
    fireEvent.click(screen.getByText('进去情景'));

    expect(await screen.findByText('节点 1')).toBeInTheDocument();
    expect(sessionStorage.getItem('eva_guest_feedback')).toBeNull();
  });
});
