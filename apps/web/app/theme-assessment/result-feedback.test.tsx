/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeAssessmentPage from './page';
import { messages } from '../../messages/index';

const api = vi.hoisted(() => ({
  coverage: vi.fn(),
  start: vi.fn(),
  next: vi.fn(),
  answer: vi.fn(),
  complete: vi.fn(),
  result: vi.fn(),
  respond: vi.fn(),
}));

const telemetry = vi.hoisted(() => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
  submitFeedback: vi.fn().mockResolvedValue(undefined),
}));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const activeLocale = vi.hoisted(() => ({ current: 'zh-CN' as 'zh-CN' | 'en' | 'ja' | 'es' }));

vi.mock('@/lib/api', () => ({
  themeAssessmentApi: api,
  telemetryApi: telemetry,
}));
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ user: { id: 'user-1' }, loading: false }),
}));
vi.mock('../providers-impl', async () => {
  const { messages } = await import('../../messages/index');
  return {
    useLocale: () => ({
      locale: activeLocale.current,
      t: (key: string) => {
        const [section, name] = key.split('.');
        const bundle = messages[activeLocale.current] as unknown as Record<string, Record<string, string>>;
        return bundle[section]?.[name] ?? key;
      },
    }),
  };
});
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const question = {
  state: 'question' as const,
  item_id: 'item-1',
  decision_index: 6,
  question: {
    question_id: 'emotion-trigger-daily-v1',
    focus_label: '触发',
    context_label: '日常',
    role: 'core' as const,
    prompt: '你会怎么做？',
    options: [
      { id: 'A' as const, text: '选项 A' },
      { id: 'B' as const, text: '选项 B' },
      { id: 'C' as const, text: '选项 C' },
      { id: 'D' as const, text: '选项 D' },
    ],
  },
};

async function reachResult() {
  const view = render(<ThemeAssessmentPage />);
  const startButton = await screen.findByRole('button', { name: '从这个主题开始' });
  await act(async () => {
    fireEvent.click(startButton);
  });
  const option = await screen.findByText('选项 A');
  await act(async () => {
    fireEvent.click(option);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
  });
  const generateButton = await screen.findByRole('button', { name: '生成洞察报告' });
  await act(async () => {
    fireEvent.click(generateButton);
  });
  await screen.findByRole('heading', { name: '这和你真实吗？' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '我想补充' })).toHaveProperty('disabled', false)
  );
  return view;
}

describe('theme result feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeLocale.current = 'zh-CN';
    window.history.replaceState(null, '', '/theme-assessment');
    api.coverage.mockResolvedValue({
      themes: [
        {
          theme_lens: 'emotion',
          title: '情绪反应侧写',
          completed_rounds: 0,
          last_completed_at: null,
        },
      ],
      recommended_theme: 'emotion',
      recommendation: '先从情绪开始。',
    });
    api.start.mockResolvedValue({
      round: { id: 'round-1', theme_lens: 'emotion' },
      recommendation: null,
      next: question,
    });
    api.answer.mockResolvedValue({ state: 'ready' });
    api.next.mockResolvedValue({ state: 'completed' });
    api.complete.mockResolvedValue({
      round_id: 'round-1',
      result_revision_id: 'revision-1',
      revision_number: 1,
      published_at: '2026-07-30T00:00:00.000Z',
      feedback_state: 'needs_follow_up',
      whole_result_refuted: true,
      latest_feedback: {
        response_id: 'response-0',
        action: 'refute',
        explanation: '我只在某种关系里这样做',
        state: 'needs_follow_up',
        created_at: '2026-07-30T00:01:00.000Z',
      },
      result: {
        theme_lens: 'emotion',
        theme_title: '情绪反应侧写',
        headline: '你会先稳住自己',
        summary: '这是本轮摘要。',
        observations: [],
        strength: '你能保持行动。',
        watchout: '可能压住感受。',
        counterevidence: '不同情境可能不同。',
        boundary: '这是本轮观察。',
        evidence: [],
      },
    });
    api.respond.mockResolvedValue({
      response_id: 'response-1',
      result_revision_id: 'revision-1',
      action: 'clarify',
      explanation: '真实情况',
      state: 'needs_follow_up',
      created_at: '2026-07-30T00:02:00.000Z',
      replayed: false,
    });
  });

  it('shows a useful error instead of crashing when the coverage response is malformed', async () => {
    api.coverage.mockResolvedValueOnce({ recommendation: '先继续测试。' });

    render(<ThemeAssessmentPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '主题测试服务返回的数据不完整，请确认 Web 正连接 EVA API。',
    );
    expect(screen.queryByRole('heading', { name: '出错了' })).not.toBeInTheDocument();
  });

  it('shows loading on the selected theme button while a round is being created', async () => {
    let resolveStart!: (value: unknown) => void;
    api.start.mockReturnValue(new Promise((resolve) => { resolveStart = resolve; }));
    render(<ThemeAssessmentPage />);

    const startButton = await screen.findByRole('button', { name: '从这个主题开始' });
    fireEvent.click(startButton);

    expect(screen.getByRole('button', { name: '正在准备题目…' })).toBeDisabled();
    expect(document.querySelector('.action-loading-spinner')).toBeInTheDocument();

    await act(async () => {
      resolveStart({ round: { id: 'round-1', theme_lens: 'emotion' }, next: question });
    });
    expect(await screen.findByRole('heading', { name: '触发' })).toBeInTheDocument();
  });

  it('keeps report feedback loading visible when the API responds immediately', async () => {
    await reachResult();
    const startedAt = performance.now();

    fireEvent.click(screen.getByRole('button', { name: '大致符合' }));

    expect(await screen.findByText('正在保存反馈…')).toBeInTheDocument();
    const nextRoundButton = screen.getByRole('button', { name: '继续下一轮' });
    expect(nextRoundButton).toBeDisabled();
    expect(nextRoundButton).toHaveAttribute('aria-busy', 'false');
    expect(nextRoundButton.querySelector('.action-loading-spinner')).toBeNull();
    expect(await screen.findByText('已记录：这份结果大致符合你的真实情况。')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('正在保存反馈…')).toBeNull());
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(650);
  });

  it('keeps the start-next-step loading state visible when the API responds immediately', async () => {
    render(<ThemeAssessmentPage />);
    const startButton = await screen.findByRole('button', { name: '从这个主题开始' });
    const startedAt = performance.now();
    fireEvent.click(startButton);

    expect(await screen.findByRole('button', { name: '正在准备题目…' })).toBeDisabled();
    expect(await screen.findByRole('heading', { name: '触发' })).toBeInTheDocument();
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(380);
  });

  it('submits the answer only when the user clicks 下一题, then advances', async () => {
    let resolveAnswer!: (value: any) => void;
    api.answer.mockReturnValue(new Promise((resolve) => { resolveAnswer = resolve; }));
    render(<ThemeAssessmentPage />);
    fireEvent.click(await screen.findByRole('button', { name: '从这个主题开始' }));
    const firstQuestion = await screen.findByRole('heading', { name: '触发' });

    // 选中选项不提交：answer 未被调用，自由文本可以先填
    fireEvent.click(screen.getByRole('button', { name: /选项 A/ }));
    expect(api.answer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/如果愿意，可以说说你为什么会这样选/), {
      target: { value: '昨晚刚发生过' },
    });

    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(screen.getByRole('button', { name: /正在保存这一题的回答…/ })).toBeDisabled();
    expect(api.answer).toHaveBeenCalledWith('round-1', 'item-1', expect.objectContaining({
      choice_id: 'A',
      free_text: '昨晚刚发生过',
    }));

    await act(async () => {
      resolveAnswer({
        ...question,
        item_id: 'item-2',
        decision_index: 7,
        question: { ...question.question, question_id: 'emotion-recovery-v1', focus_label: '恢复' },
      });
    });
    expect(await screen.findByRole('heading', { name: '恢复' })).toBeInTheDocument();
    expect(firstQuestion).toHaveTextContent('恢复');
  });

  it('shows a ready screen with 生成洞察报告 after the last decision point', async () => {
    api.answer.mockResolvedValue({ state: 'ready' });
    render(<ThemeAssessmentPage />);
    fireEvent.click(await screen.findByRole('button', { name: '从这个主题开始' }));
    await screen.findByRole('heading', { name: '触发' });

    fireEvent.click(screen.getByRole('button', { name: /选项 A/ }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));

    // 不再自动 complete：等待用户手动触发
    expect(await screen.findByTestId('ready-summary')).toBeInTheDocument();
    expect(api.complete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('generate-insight'));
    expect(await screen.findByRole('heading', { name: '这和你真实吗？' })).toBeInTheDocument();
    expect(api.complete).toHaveBeenCalledWith('round-1');
  });

  it('keeps loading visible when an answer request resolves immediately, then advances', async () => {
    api.answer.mockResolvedValue({
      ...question,
      item_id: 'item-2',
      decision_index: 7,
      question: { ...question.question, question_id: 'emotion-recovery-v1', focus_label: '恢复' },
    });
    render(<ThemeAssessmentPage />);
    fireEvent.click(await screen.findByRole('button', { name: '从这个主题开始' }));
    const firstQuestion = await screen.findByRole('heading', { name: '触发' });

    const startedAt = performance.now();
    fireEvent.click(screen.getByRole('button', { name: /选项 A/ }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));

    expect(screen.getByRole('button', { name: /正在保存这一题的回答…/ })).toBeDisabled();
    expect(firstQuestion).toHaveTextContent('触发');

    expect(await screen.findByRole('heading', { name: '恢复' })).toBeInTheDocument();
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(650);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the ready screen interactive while the result is being prepared', async () => {
    const completedResult = await api.complete();
    api.answer.mockResolvedValue({ state: 'ready' });
    let resolveComplete!: (value: unknown) => void;
    api.complete.mockReturnValue(new Promise((resolve) => { resolveComplete = resolve; }));
    render(<ThemeAssessmentPage />);
    fireEvent.click(await screen.findByRole('button', { name: '从这个主题开始' }));
    await screen.findByRole('heading', { name: '触发' });

    fireEvent.click(screen.getByRole('button', { name: /选项 A/ }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    fireEvent.click(await screen.findByTestId('generate-insight'));

    expect(await screen.findByText('正在生成结果报告…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '从这个主题开始' })).toBeNull();

    await act(async () => { resolveComplete(completedResult); });
    expect(await screen.findByRole('heading', { name: '这份结果已被你标记为不符合' })).toBeInTheDocument();
  });

  it('prefills the saved answer when navigating back with 上一题', async () => {
    api.answer.mockResolvedValue({
      ...question,
      item_id: 'item-2',
      decision_index: 2,
      question: { ...question.question, question_id: 'emotion-recovery-v1', focus_label: '恢复' },
    });
    render(<ThemeAssessmentPage />);
    fireEvent.click(await screen.findByRole('button', { name: '从这个主题开始' }));
    await screen.findByRole('heading', { name: '触发' });

    fireEvent.change(screen.getByLabelText(/如果愿意，可以说说你为什么会这样选/), {
      target: { value: '真实情境说明' },
    });
    fireEvent.click(screen.getByRole('button', { name: /选项 B/ }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(await screen.findByRole('heading', { name: '恢复' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '上一题' }));

    expect(await screen.findByRole('heading', { name: '触发' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选项 B/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/如果愿意，可以说说你为什么会这样选/)).toHaveValue('真实情境说明');
    // 未改动作答再点下一题：直接前进到第二题，不重复提交
    const answerCallsBefore = api.answer.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(await screen.findByRole('heading', { name: '恢复' })).toBeInTheDocument();
    expect(api.answer.mock.calls.length).toBe(answerCallsBefore);
  });

  it('opens the supplement editor without submitting feedback', async () => {
    await reachResult();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '我想补充' }));
    });

    expect(api.respond).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '补充你的真实情况' })).toBeDefined();
    expect(screen.queryByText(/反馈已保存/)).toBeNull();
  });

  it('shows the persisted feedback target and actual selected focus when a follow-up round starts', async () => {
    api.start.mockResolvedValue({
      round: { id: 'round-followup', theme_lens: 'emotion' },
      recommendation: null,
      next: {
        ...question,
        selection: {
          rule_version: 'theme-feedback-v1',
          reason: 'clarify_partial',
          reason_zh: '你认为这条观察只符合一部分；本轮会换一个相同观察焦点的情境继续核对。',
          target: {
            response_id: 'response-1', result_revision_id: 'revision-1',
            observation_question_id: question.question.question_id, action: 'partial',
          },
          status: 'targeted',
          selected_question_id: question.question.question_id,
        },
      },
    });

    render(<ThemeAssessmentPage />);
    const startButton = await screen.findByRole('button', { name: '从这个主题开始' });
    await act(async () => {
      fireEvent.click(startButton);
    });

    expect(await screen.findByTestId('followup-selection-status')).toHaveTextContent('本轮实际选中的问题：触发（日常）');
    expect(screen.getByTestId('followup-selection-status')).toHaveTextContent('不代表异议已经解决');
  });

  it('does not label a later question as the selected follow-up question', async () => {
    api.start.mockResolvedValue({
      round: { id: 'round-followup', theme_lens: 'emotion' },
      recommendation: null,
      next: {
        ...question,
        selection: {
          status: 'targeted', reason_zh: '需要继续核对。',
          target: { observation_question_id: 'older-question' },
          selected_question_id: 'different-question',
        },
      },
    });

    render(<ThemeAssessmentPage />);
    const startButton = await screen.findByRole('button', { name: '从这个主题开始' });
    await act(async () => { fireEvent.click(startButton); });
    await screen.findByRole('heading', { name: '触发' });

    expect(screen.queryByTestId('followup-selection-status')).toBeNull();
  });

  it('describes a specific target from another round without calling it whole-result feedback', async () => {
    const completed = await api.complete();
    api.complete.mockResolvedValue({
      ...completed,
      result: { ...completed.result, observations: [{ focus: '本轮焦点', text: '本轮情境', evidence_question_id: 'current-question' }] },
    });
    api.coverage.mockResolvedValue({
      themes: [{ theme_lens: 'emotion', title: '情绪反应侧写', completed_rounds: 1, last_completed_at: null }],
      recommended_theme: 'emotion', recommendation: '继续核对。',
      recommendation_target: { observation_question_id: 'older-question' },
    });

    await reachResult();

    const recommendation = await screen.findByTestId('next-round-recommendation');
    expect(recommendation).toHaveTextContent('其他轮次的具体观察');
    expect(recommendation).not.toHaveTextContent('上一轮整体反馈');
    expect(recommendation).not.toHaveTextContent('本轮焦点');
  });

  it('shows feedback restored from the server when the result is loaded', async () => {
    await reachResult();

    expect(await screen.findByRole('status')).toHaveTextContent('你认为这轮观察不符合');
    expect(screen.getByRole('status')).toHaveTextContent('我只在某种关系里这样做');
  });

  it('shows the disputed-result notice before the historical conclusion even if the latest feedback confirms one observation', async () => {
    const completed = await api.complete();
    api.complete.mockResolvedValue({
      ...completed,
      latest_feedback: {
        response_id: 'response-confirmed', action: 'confirm', explanation: null,
        observation_question_id: 'q2', state: 'recorded', created_at: '2026-07-30T00:02:00.000Z',
      },
    });

    await reachResult();

    const notice = screen.getByText('这轮观察存在待核对的反馈。以下是当时生成的结果。');
    const historical = screen.getByText('历史生成的结论：你会先稳住自己');
    expect(notice.compareDocumentPosition(historical) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { name: '这份结果已被你标记为不符合' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: '你会先稳住自己' })).toBeNull();
    const historicalGroup = screen.getByRole('group', { name: messages['zh-CN'].theme_round.historical_result_label });
    expect(historicalGroup).toHaveTextContent('这是本轮摘要。');
    expect(historicalGroup).toHaveTextContent('你能保持行动。');
    expect(historicalGroup).toHaveTextContent('可能压住感受。');
    expect(historicalGroup).toHaveTextContent('不同情境可能不同。');
    expect(historicalGroup).toHaveTextContent('这是本轮观察。');
    expect(screen.getByRole('status')).toHaveTextContent('这条观察大致符合');
  });

  it('keeps a recorded result without a dispute notice', async () => {
    const completed = await api.complete();
    api.complete.mockResolvedValue({ ...completed, feedback_state: 'recorded', whole_result_refuted: false });

    await reachResult();

    expect(screen.queryByText('这轮观察存在待核对的反馈。以下是当时生成的结果。')).toBeNull();
    expect(screen.getByRole('heading', { name: '你会先稳住自己' })).toBeDefined();
  });

  it('moves a whole-result refutation into historical presentation immediately', async () => {
    const completed = await api.complete();
    api.complete.mockResolvedValue({ ...completed, feedback_state: 'not_responded', whole_result_refuted: false, latest_feedback: null });
    api.respond.mockResolvedValue({
      response_id: 'response-refute', result_revision_id: 'revision-1', action: 'refute',
      explanation: null, observation_question_id: null, state: 'needs_follow_up',
      created_at: '2026-09-26T00:03:00.000Z', replayed: false,
    });
    await reachResult();

    fireEvent.click(screen.getByRole('button', { name: '不太符合' }));

    expect(await screen.findByRole('heading', { name: messages['zh-CN'].theme_round.whole_refuted_heading })).toBeDefined();
    expect(screen.getByRole('group', { name: messages['zh-CN'].theme_round.historical_result_label }))
      .toHaveTextContent('你能保持行动。');
  });

  it.each([
    ['zh-CN', '这轮观察存在待核对的反馈。以下是当时生成的结果。'],
    ['en', 'This round has feedback to review. The result below was generated at the time.'],
    ['ja', 'この回には確認が必要なフィードバックがあります。以下は当時生成された結果です。'],
    ['es', 'Esta ronda tiene comentarios pendientes de revisión. El resultado siguiente se generó en ese momento.'],
  ] as const)('restores the disputed notice before the title and summary after refresh in %s', async (locale, expected) => {
    activeLocale.current = locale;
    window.history.replaceState(null, '', '/theme-assessment?roundId=round-1');
    api.next.mockResolvedValue({ state: 'completed' });
    api.result.mockResolvedValue(await api.complete());

    render(<ThemeAssessmentPage />);

    const notice = await screen.findByText(expected);
    const bundle = messages[locale] as unknown as Record<string, Record<string, string>>;
    const headline = screen.getByText(`${bundle.theme_round.historical_conclusion_label}：你会先稳住自己`);
    const summary = screen.getByText('这是本轮摘要。');
    expect(screen.getByRole('group', { name: bundle.theme_round.historical_result_label })).toContainElement(summary);
    expect(notice.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(api.result).toHaveBeenCalledWith('round-1');
  });

  it('submits clarification only after the user enters text and confirms', async () => {
    await reachResult();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '我想补充' }));
    });

    const submit = screen.getByRole('button', { name: '提交补充' });
    expect(submit).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByRole('textbox', { name: '补充你的真实情况' }), {
      target: { value: '我只会在工作压力很高时这样做。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交补充' }));

    await waitFor(() =>
      expect(api.respond).toHaveBeenCalledWith('round-1', {
        operation_id: expect.any(String),
        action: 'clarify',
        explanation: '我只会在工作压力很高时这样做。',
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('补充内容已保存');
    expect(telemetry.submitFeedback).not.toHaveBeenCalled();
  });

  it('shows the updated next-round reason after the user disagrees', async () => {
    await reachResult();
    api.coverage.mockResolvedValue({
      themes: [{ theme_lens: 'emotion', title: '情绪反应侧写', completed_rounds: 1, last_completed_at: null }],
      recommended_theme: 'emotion',
      recommendation: '你上次认为这轮观察不符合，换个情境继续核对。',
      recommendation_reason: 'verify_disagreement',
    });

    fireEvent.click(screen.getByRole('button', { name: '不太符合' }));

    expect(await screen.findByTestId('next-round-recommendation')).toHaveTextContent('换个情境继续核对');
    expect(screen.getByRole('button', { name: '继续下一轮' })).toBeDefined();
  });

  it('restores each observation feedback after refreshing a completed round', async () => {
    const view = await reachResult();
    expect(window.location.search).toBe('?roundId=round-1');
    const completed = await api.complete.mock.results[0].value;
    view.unmount();
    api.result.mockResolvedValue({
      ...completed,
      result: {
        ...completed.result,
        observations: [
          { focus: '观察一', text: '情境一', evidence_question_id: 'q1' },
          { focus: '观察二', text: '情境二', evidence_question_id: 'q2' },
        ],
      },
      latest_feedback: {
        response_id: 'response-2', action: 'confirm', explanation: null,
        observation_question_id: 'q2', state: 'recorded', created_at: '2026-09-26T00:02:00.000Z',
      },
      observation_feedback: {
        q1: { response_id: 'response-1', action: 'refute', explanation: null, observation_question_id: 'q1', state: 'needs_follow_up', created_at: '2026-09-26T00:01:00.000Z' },
        q2: { response_id: 'response-2', action: 'confirm', explanation: null, observation_question_id: 'q2', state: 'recorded', created_at: '2026-09-26T00:02:00.000Z' },
      },
      whole_result_refuted: false,
    });

    render(<ThemeAssessmentPage />);

    expect(await screen.findByTestId('observation-feedback-q1')).toHaveTextContent('这条观察不符合');
    expect(screen.getByTestId('observation-feedback-q2')).toHaveTextContent('这条观察大致符合');
    expect(screen.getByText('历史生成的观察（你已标记为不符合）：情境一')).toBeDefined();
    expect(screen.getByText('情境二')).toBeDefined();
    expect(screen.queryByRole('group', { name: messages['zh-CN'].theme_round.historical_result_label })).toBeNull();
    expect(screen.getByRole('heading', { name: '你会先稳住自己' })).toBeDefined();
    expect(screen.getByRole('status')).toHaveTextContent('这条观察大致符合');
    expect(api.result).toHaveBeenCalledWith('round-1');
  });

  it('resumes the next unanswered question after refreshing an active round', async () => {
    api.answer.mockResolvedValue({ ...question, decision_index: 2, item_id: 'item-2' });
    const view = render(<ThemeAssessmentPage />);
    const startButton = await screen.findByRole('button', { name: '从这个主题开始' });
    await act(async () => { fireEvent.click(startButton); });
    expect(await screen.findByRole('heading', { name: '触发' })).toBeInTheDocument();
    expect(window.location.search).toBe('?roundId=round-1');
    const option = await screen.findByRole('button', { name: /选项 A/ });
    await act(async () => { fireEvent.click(option); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '下一题' })); });
    expect(await screen.findByText(/第 2 个决策点/)).toBeDefined();
    view.unmount();

    api.next.mockResolvedValue({ ...question, decision_index: 2, item_id: 'item-2' });
    render(<ThemeAssessmentPage />);

    expect(await screen.findByText(/第 2 个决策点/)).toBeDefined();
    expect(api.next).toHaveBeenCalledWith('round-1');
    expect(api.result).not.toHaveBeenCalled();
  });

  it('marks the specific observation immediately after a targeted refutation', async () => {
    const completed = await api.complete();
    api.complete.mockResolvedValue({
      ...completed,
      result: {
        ...completed.result,
        observations: [{ focus: '观察一', text: '情境一', evidence_question_id: 'q1' }],
      },
      observation_feedback: {},
      whole_result_refuted: false,
    });
    api.respond.mockResolvedValue({
      response_id: 'response-q1', result_revision_id: 'revision-1', action: 'refute',
      explanation: null, observation_question_id: 'q1', state: 'needs_follow_up',
      created_at: '2026-09-26T00:03:00.000Z', replayed: false,
    });
    await reachResult();

    fireEvent.click(screen.getAllByRole('button', { name: '不太符合' })[0]);

    expect(await screen.findByTestId('observation-feedback-q1')).toHaveTextContent('这条观察不符合');
    expect(screen.getByText('已提出异议 · 不作为无争议结论使用')).toBeDefined();
    expect(screen.getByText('历史生成的观察（你已标记为不符合）：情境一')).toBeDefined();
    expect(screen.getByRole('heading', { name: '你会先稳住自己' })).toBeDefined();
    expect(api.respond).toHaveBeenCalledWith('round-1', expect.objectContaining({ observation_question_id: 'q1' }));
  });

  it('submits a per-observation clarification with custom explanation', async () => {
    const completed = await api.complete();
    api.complete.mockResolvedValue({
      ...completed,
      result: {
        ...completed.result,
        observations: [{ focus: '观察一', text: '情境一', evidence_question_id: 'q1' }],
      },
      observation_feedback: {},
      whole_result_refuted: false,
    });
    api.respond.mockResolvedValue({
      response_id: 'response-q1-clarify', result_revision_id: 'revision-1', action: 'clarify',
      explanation: '当时是因为对方不熟，不是没有精力', observation_question_id: 'q1', state: 'needs_follow_up',
      created_at: '2026-09-26T00:04:00.000Z', replayed: false,
    });
    await reachResult();

    fireEvent.click(screen.getAllByRole('button', { name: '补充说明' })[0]);
    const textarea = screen.getByLabelText('补充这条观察的背景理由');
    fireEvent.change(textarea, { target: { value: '当时是因为对方不熟，不是没有精力' } });
    fireEvent.click(screen.getByRole('button', { name: '提交说明' }));

    await waitFor(() => {
      expect(api.respond).toHaveBeenCalledWith('round-1', expect.objectContaining({
        action: 'clarify',
        observation_question_id: 'q1',
        explanation: '当时是因为对方不熟，不是没有精力',
      }));
    });
    expect(await screen.findByText('你的说明：“当时是因为对方不熟，不是没有精力”')).toBeDefined();
  });
});
