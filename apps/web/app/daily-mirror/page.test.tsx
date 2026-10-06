import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DailyMirrorPage from './page';

const { listCaptures, recentDiary, confirmInterpretation, refuteInterpretation, setWeeklyReviewPermission } = vi.hoisted(() => ({
  listCaptures: vi.fn(),
  recentDiary: vi.fn(),
  confirmInterpretation: vi.fn(),
  refuteInterpretation: vi.fn(),
  setWeeklyReviewPermission: vi.fn(),
}));
const sessionUser = { id: 'user-1' };

vi.mock('@/lib/api', () => ({
  capturesApi: { list: listCaptures, confirmInterpretation, refuteInterpretation, setWeeklyReviewPermission },
  diaryApi: { recent: recentDiary },
}));
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ user: sessionUser, loading: false }),
}));
vi.mock('@/app/providers-impl', () => ({
  useLocale: () => ({ locale: 'en', t: (key: string) => key }),
}));
vi.mock('./capture-form', () => ({ CaptureForm: () => null }));

describe('DailyMirrorPage timeline loading', () => {
  beforeEach(() => {
    listCaptures.mockReset();
    recentDiary.mockReset();
    confirmInterpretation.mockReset();
    refuteInterpretation.mockReset();
    setWeeklyReviewPermission.mockReset();
  });

  it('does not call a failed load an empty timeline and retries without hiding loaded records', async () => {
    listCaptures.mockResolvedValue([{ id: 'capture-1', entry_type: 'quick_fragment',
      process_mode: 'save_only', raw_text: 'My saved note', local_date: '2026-09-26',
      captured_at: '2026-09-26T00:00:00.000Z' }]);
    recentDiary.mockRejectedValueOnce(new Error('network lost')).mockResolvedValueOnce([]);

    render(<DailyMirrorPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('diary.timeline_load_failed');
    expect(screen.getByText('My saved note')).toBeInTheDocument();
    expect(screen.queryByText('diary.timeline_empty')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'diary.timeline_retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('My saved note')).toBeInTheDocument();
    expect(recentDiary).toHaveBeenCalledTimes(2);
  });

  it('shows a load error instead of an empty state when capture loading fails', async () => {
    listCaptures.mockRejectedValue(new Error('network lost'));
    recentDiary.mockResolvedValue([]);

    render(<DailyMirrorPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('diary.timeline_load_failed');
    expect(screen.queryByText('diary.timeline_empty')).toBeNull();
  });

  it('restores a saved pending cue and allows confirmation after a failed attempt', async () => {
    listCaptures.mockResolvedValue([{ id: 'capture-2', entry_type: 'quick_fragment',
      process_mode: 'analyze', raw_text: 'A saved note', local_date: '2026-09-26',
      captured_at: '2026-09-26T00:00:00.000Z', interpretations: [{
        id: 'cue-1', dimension: 'stressResponse', ai_explanation: 'Keyword cue',
        status: 'pending', proposed_delta: 3, support_count: 0,
      }] }]);
    recentDiary.mockResolvedValue([]);
    confirmInterpretation.mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValueOnce({ success: true });
    setWeeklyReviewPermission.mockResolvedValue({ id: 'capture-2', entry_type: 'quick_fragment',
      process_mode: 'analyze', raw_text: 'A saved note', local_date: '2026-09-26',
      captured_at: '2026-09-26T00:00:00.000Z', allow_weekly_review: true });

    render(<DailyMirrorPage />);
    expect(await screen.findByText('Keyword cue')).toBeInTheDocument();
    expect(screen.getByText('diary.interpretation_scope')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AI weekly review: off/ }));
    await waitFor(() => expect(setWeeklyReviewPermission).toHaveBeenCalledWith('capture-2', true));
    expect(await screen.findByRole('button', { name: /AI weekly review: allowed/ })).toBeInTheDocument();
    expect(screen.getByText('Keyword cue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('diary.interpretation_confirm_failed');
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(screen.getByText('diary.interpretation_confirmed')).toBeInTheDocument());
    expect(confirmInterpretation).toHaveBeenCalledWith('capture-2', 'cue-1');
  });

  it('shows pending feedback while timeline confirmation, refutation, and permission requests are in flight', async () => {
    let resolveConfirm!: (value: { success: boolean }) => void;
    let resolveRefute!: (value: { success: boolean }) => void;
    let resolvePermission!: (value: {
      id: string; entry_type: string; process_mode: string; modality: string;
      raw_text: string; local_date: string; captured_at: string; allow_weekly_review: boolean;
    }) => void;
    confirmInterpretation.mockReturnValueOnce(new Promise((resolve) => { resolveConfirm = resolve; }));
    refuteInterpretation.mockReturnValueOnce(new Promise((resolve) => { resolveRefute = resolve; }));
    setWeeklyReviewPermission.mockReturnValueOnce(new Promise((resolve) => { resolvePermission = resolve; }));
    listCaptures.mockResolvedValue([{ id: 'capture-pending', entry_type: 'quick_fragment',
      process_mode: 'analyze', raw_text: 'A synthetic note', local_date: '2026-09-26',
      captured_at: '2026-09-26T00:00:00.000Z', allow_weekly_review: false, interpretations: [{
        id: 'cue-pending', dimension: 'stressResponse', ai_explanation: 'Synthetic cue',
        status: 'pending', proposed_delta: 3, support_count: 0,
      }] }]);
    recentDiary.mockResolvedValue([]);

    render(<DailyMirrorPage />);
    expect(await screen.findByText('Synthetic cue')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    const confirmLoading = screen.getByRole('button', { name: 'common.loading' });
    expect(confirmLoading).toHaveAttribute('aria-busy', 'true');
    expect(confirmLoading.querySelector('.action-loading-spinner')).not.toBeNull();
    resolveConfirm({ success: true });
    expect(await screen.findByText('diary.interpretation_confirmed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'diary.interpretation_refute' }));
    const refuteLoading = screen.getByRole('button', { name: 'common.loading' });
    expect(refuteLoading).toHaveAttribute('aria-busy', 'true');
    expect(refuteLoading.querySelector('.action-loading-spinner')).not.toBeNull();
    resolveRefute({ success: true });
    expect(await screen.findByText('diary.interpretation_rejected')).toBeInTheDocument();

    const permissionButton = screen.getByRole('button', { name: /AI weekly review: off/ });
    fireEvent.click(permissionButton);
    const permissionLoading = screen.getByRole('button', { name: 'common.loading' });
    expect(permissionLoading).toHaveAttribute('aria-busy', 'true');
    expect(permissionLoading.querySelector('.action-loading-spinner')).not.toBeNull();
    resolvePermission({ id: 'capture-pending', entry_type: 'quick_fragment', process_mode: 'analyze',
      modality: 'text', raw_text: 'A synthetic note', local_date: '2026-09-26',
      captured_at: '2026-09-26T00:00:00.000Z', allow_weekly_review: true });
    expect(await screen.findByRole('button', { name: /AI weekly review: allowed/ })).toBeInTheDocument();
  });

  it('loads older captures and archive entries without losing a successful page on partial failure', async () => {
    const captures = Array.from({ length: 51 }, (_, index) => ({
      id: `capture-${index}`, entry_type: 'quick_fragment', process_mode: 'save_only',
      raw_text: `Note ${index}`, local_date: '2026-09-26',
      captured_at: '2026-09-26T00:00:00.000Z',
    }));
    const archive = Array.from({ length: 51 }, (_, index) => ({
      id: `diary-${index}`, entry_date: '2026-09-25', created_at: '2026-09-25T00:00:00.000Z',
      content: { detail: `Archive ${index}` },
    }));
    listCaptures.mockResolvedValueOnce(captures).mockResolvedValueOnce([captures[50]]);
    recentDiary.mockResolvedValueOnce(archive)
      .mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValueOnce([archive[50]]);

    render(<DailyMirrorPage />);
    expect(await screen.findByText('Note 49')).toBeInTheDocument();
    expect(screen.queryByText('Note 50')).toBeNull();
    expect(screen.queryByText('Archive 50')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'diary.timeline_load_more' }));
    expect(await screen.findByText('Note 50')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('diary.timeline_more_failed');
    expect(screen.getByText('Note 0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'diary.timeline_load_more' }));
    expect(await screen.findByText('Archive 50')).toBeInTheDocument();
    expect(listCaptures).toHaveBeenCalledTimes(2);
    expect(recentDiary).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button', { name: 'diary.timeline_load_more' })).toBeNull();
  });

  it('lets the user refute a restored pending cue and retries a failed response', async () => {
    listCaptures.mockResolvedValue([{ id: 'capture-3', entry_type: 'quick_fragment',
      process_mode: 'analyze', raw_text: 'A saved note', local_date: '2026-09-26',
      captured_at: '2026-09-26T00:00:00.000Z', interpretations: [{
        id: 'cue-2', dimension: 'stressResponse', ai_explanation: 'Questionable cue',
        status: 'pending', proposed_delta: 3, support_count: 0,
      }] }]);
    recentDiary.mockResolvedValue([]);
    refuteInterpretation.mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValueOnce({ success: true });

    render(<DailyMirrorPage />);
    expect(await screen.findByText('Questionable cue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'diary.interpretation_refute' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('diary.interpretation_refute_failed');
    expect(screen.getByText('diary.interpretation_pending')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'diary.interpretation_refute' }));
    await waitFor(() => expect(screen.getByText('diary.interpretation_rejected')).toBeInTheDocument());
    expect(refuteInterpretation).toHaveBeenCalledWith('capture-3', 'cue-2');
  });
});
