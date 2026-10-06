/** @vitest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './page';
import { messages } from '../../messages/index';
import { consentApi, themeAssessmentApi } from '@/lib/api';

const defaultThemeRounds = vi.hoisted(() => [{
  id: 'round-1', theme_lens: 'emotion', theme_title: '情绪', status: 'completed',
  completed_at: '2026-09-26T00:00:00.000Z', headline: '本轮观察', boundary: '只限这轮',
  feedback_state: 'needs_follow_up', whole_result_refuted: true, latest_feedback_action: 'refute',
}, {
  id: 'round-2', theme_lens: 'relationship', theme_title: '关系', status: 'in_progress',
  completed_at: null, headline: null, boundary: null,
  feedback_state: 'not_responded', whole_result_refuted: false, latest_feedback_action: null,
}, {
  id: 'round-3', theme_lens: 'workplace', theme_title: '工作', status: 'completed',
  completed_at: '2026-09-25T00:00:00.000Z', headline: '普通历史观察', boundary: '只限本轮',
  feedback_state: 'recorded', whole_result_refuted: false, latest_feedback_action: 'confirm',
}]);

vi.mock('@/lib/api', () => ({
  authApi: { me: vi.fn().mockResolvedValue({ id: 'user-1', email: 'user@example.com' }) },
  consentApi: { exportData: vi.fn().mockResolvedValue({ users: [{ id: 'user-1' }] }) },
  evidenceApi: { getByDimension: vi.fn().mockResolvedValue([]) },
  portraitV1Api: { current: vi.fn().mockResolvedValue(null) },
  observationsV1Api: { list: vi.fn().mockResolvedValue([]) },
  themeAssessmentApi: { history: vi.fn().mockResolvedValue(defaultThemeRounds) },
}));
const activeLocale = vi.hoisted(() => ({ current: 'zh-CN' as 'zh-CN' | 'en' | 'ja' | 'es' }));
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('@/components/portrait-sections', () => ({
  ProfilePortraitView: () => null,
  PublishedObservationResponseSection: () => null,
}));

describe('profile round history', () => {
  beforeEach(() => {
    activeLocale.current = 'zh-CN';
    vi.mocked(consentApi.exportData).mockClear();
    vi.mocked(themeAssessmentApi.history).mockReset().mockResolvedValue(defaultThemeRounds as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads account records only after an explicit click', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:eva-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ProfilePage />);

    const button = await screen.findByRole('button', { name: messages['zh-CN'].profile.data_export_button });
    expect(consentApi.exportData).not.toHaveBeenCalled();
    expect(screen.getByText(messages['zh-CN'].profile.data_export_description)).toBeInTheDocument();
    fireEvent.click(button);

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(consentApi.exportData).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:eva-export'), { timeout: 2000 });
    click.mockRestore();
  });

  it('shows a download error when export fails', async () => {
    vi.mocked(consentApi.exportData).mockRejectedValueOnce(new Error('offline'));
    render(<ProfilePage />);
    fireEvent.click(await screen.findByRole('button', { name: messages['zh-CN'].profile.data_export_button }));
    expect(await screen.findByRole('alert')).toHaveTextContent(messages['zh-CN'].profile.data_export_error);
  });

  it('links an available round result back to its persisted feedback', async () => {
    render(<ProfilePage />);

    expect((await screen.findAllByRole('link', { name: '查看本轮结果和反馈' }))[0])
      .toHaveAttribute('href', '/theme-assessment?roundId=round-1');
    expect(screen.getByRole('link', { name: '继续未完成主题轮' }))
      .toHaveAttribute('href', '/theme-assessment?roundId=round-2');
  });

  it('renders the empty state when the history endpoint returns a non-array payload', async () => {
    vi.mocked(themeAssessmentApi.history).mockResolvedValue({ error: 'unexpected payload' } as never);
    render(<ProfilePage />);

    expect(await screen.findByText('多轮观察总览')).toBeInTheDocument();
    expect(themeAssessmentApi.history).toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: '查看本轮结果和反馈' })).not.toBeInTheDocument();
  });

  it('shows disputed feedback before the historical headline', async () => {
    render(<ProfilePage />);

    const headline = await screen.findByText('历史生成的结论：本轮观察');
    const notice = screen.getByText(messages['zh-CN'].theme_round.historical_dispute_notice);
    expect(notice.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('这份结果已被你标记为不符合')).toBeDefined();
    const historicalGroup = screen.getByRole('group', { name: messages['zh-CN'].theme_round.historical_result_label });
    expect(historicalGroup).toHaveTextContent('只限这轮');
    expect(screen.queryByText('本轮观察')).toBeNull();
  });

  it('keeps ordinary recorded feedback after its headline and shows no notice for unanswered rounds', async () => {
    render(<ProfilePage />);

    const headline = await screen.findByText('普通历史观察');
    const recorded = screen.getByText(messages['zh-CN'].theme_round.feedback_recorded);
    expect(headline.compareDocumentPosition(recorded) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId('round-feedback-state')).toHaveLength(2);
  });

  it.each(['en', 'ja', 'es'] as const)('uses translated historical feedback before the headline in %s', async (locale) => {
    activeLocale.current = locale;
    render(<ProfilePage />);

    const bundle = messages[locale] as unknown as Record<string, Record<string, string>>;
    const headline = await screen.findByText(`${bundle.theme_round.historical_conclusion_label}：本轮观察`);
    const expected = bundle.theme_round?.historical_dispute_notice;
    expect(expected).toBeTruthy();
    const notice = screen.getByText(expected);
    expect(notice.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('group', { name: bundle.theme_round.historical_result_label })).toContainElement(headline);
  });
});
