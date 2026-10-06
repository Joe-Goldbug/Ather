/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WeeklyReviewPage from './page';

const api = vi.hoisted(() => ({
  current: vi.fn(),
  trigger: vi.fn(),
  createExperiment: vi.fn(),
  checkIn: vi.fn(),
  captures: vi.fn(),
  diary: vi.fn(),
  consentStatus: vi.fn(),
  consentGrant: vi.fn(),
  consentRevoke: vi.fn(),
}));
const session = vi.hoisted(() => ({ user: { id: 'user-1' }, loading: false }));

vi.mock('@/lib/api', () => ({
  weeklyReviewApi: {
    current: api.current,
    trigger: api.trigger,
    createExperiment: api.createExperiment,
  },
  weeklyExperimentsApi: { checkIn: api.checkIn },
  capturesApi: { list: api.captures },
  diaryApi: { recent: api.diary },
  consentApi: {
    status: api.consentStatus,
    grant: api.consentGrant,
    revoke: api.consentRevoke,
  },
}));
vi.mock('@/hooks/useSession', () => ({
  useSession: () => session,
}));
vi.mock('../providers-impl', () => ({
  useLocale: () => ({ locale: 'zh-CN', t: (key: string) => key }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const experiment = {
  id: 'experiment-1',
  user_id: 'user-1',
  weekly_review_id: 'review-1',
  action_text: '在一次紧张对话前先停十秒。',
  trigger_context: '当你发现自己想立刻回应时。',
  review_on: '2026-09-25',
  state: 'active' as const,
  created_at: '2026-09-18T00:00:00.000Z',
  updated_at: '2026-09-18T00:00:00.000Z',
};

describe('weekly experiment controls', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    api.current.mockResolvedValue({
      id: 'review-1',
      summary: '本周回看。',
      content: {
        suggested_experiment: {
          action_text: experiment.action_text,
          trigger_context: experiment.trigger_context,
        },
      },
    });
    api.captures.mockResolvedValue([{
      id: 'capture-1',
      local_date: new Date().toISOString().slice(0, 10),
      captured_at: new Date().toISOString(),
      summary: '一条本周记录',
      raw_text: '一条本周记录',
      entry_type: 'quick_fragment',
      process_mode: 'organize',
      allow_weekly_review: true,
    }]);
    api.diary.mockResolvedValue([]);
    api.consentStatus.mockResolvedValue({ weekly_review_analysis: false });
    api.createExperiment.mockResolvedValue({ experiment, created: true });
    api.checkIn.mockResolvedValue({
      experiment: { ...experiment, state: 'active' },
      checkin: { id: 'checkin-1', outcome: 'no_opportunity', note: null },
    });
  });

  it('does not create an experiment merely by showing a suggested action', async () => {
    render(<WeeklyReviewPage />);

    expect(await screen.findByRole('button', { name: '我愿意试试' })).toBeInTheDocument();
    expect(api.createExperiment).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '这周没有遇到机会' })).not.toBeInTheDocument();
  });

  it('does not show a voluntary action control when the review has no persisted suggestion', async () => {
    api.current.mockResolvedValueOnce({ id: 'review-1', summary: '本周回看。', content: {} });
    render(<WeeklyReviewPage />);

    await screen.findByText('本周回看。');
    expect(screen.queryByRole('button', { name: '我愿意试试' })).not.toBeInTheDocument();
    expect(api.createExperiment).not.toHaveBeenCalled();
  });

  it('shows the persisted suggested action after generating a review', async () => {
    const generatedReview = {
      id: 'review-2',
      summary: '生成后的周回看。',
      content: {
        suggested_experiment: {
          action_text: '先停十秒再回应。',
          trigger_context: '当你想立刻反驳时。',
        },
      },
    };
    api.current
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(generatedReview);
    api.trigger.mockResolvedValue({ job_id: 'job-1' });

    render(<WeeklyReviewPage />);
    const permission = await screen.findByRole('checkbox');
    fireEvent.click(permission);
    fireEvent.click(await screen.findByRole('button', { name: 'weekly.btn_generate' }));

    expect(await screen.findByRole('button', { name: '我愿意试试' })).toBeInTheDocument();
    expect(screen.getByText('先停十秒再回应。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '我愿意试试' }));
    await waitFor(() => expect(api.createExperiment).toHaveBeenCalledWith('review-2'));
  });

  it('creates only after the user chooses to try, then submits an explicit check-in', async () => {
    render(<WeeklyReviewPage />);

    const createButton = await screen.findByRole('button', { name: '我愿意试试' });
    fireEvent.click(createButton);
    await waitFor(() => expect(api.createExperiment).toHaveBeenCalledWith('review-1'));
    const noOpportunityButton = await screen.findByRole('button', { name: '这周没有遇到机会' });

    fireEvent.click(noOpportunityButton);
    await waitFor(() =>
      expect(api.checkIn).toHaveBeenCalledWith('experiment-1', {
        outcome: 'no_opportunity',
        note: null,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('已记下：这周没有遇到合适机会。');
  });
});
