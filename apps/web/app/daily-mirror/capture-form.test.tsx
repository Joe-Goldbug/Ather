import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureForm } from './capture-form';
import { messages } from '@/messages';

const { createCapture, analyzeCapture, setWeeklyReviewPermission, confirmInterpretation, refuteInterpretation } = vi.hoisted(() => ({
  createCapture: vi.fn(),
  analyzeCapture: vi.fn(),
  setWeeklyReviewPermission: vi.fn(),
  confirmInterpretation: vi.fn(),
  refuteInterpretation: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  capturesApi: {
    create: createCapture,
    analyze: analyzeCapture,
    setWeeklyReviewPermission,
    confirmInterpretation,
    refuteInterpretation,
  },
}));

vi.mock('../providers-impl', () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const savedCapture = {
  id: 'capture-1',
  entry_type: 'quick_fragment' as const,
  process_mode: 'save_only' as const,
  modality: 'text' as const,
  raw_text: '我在会议里突然不想说话',
  allow_weekly_review: false,
  local_date: '2026-10-10',
  captured_at: '2026-10-10T10:00:00.000Z',
  interpretations: [],
};

describe('CaptureForm note-first flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('saves the original note before offering a review', async () => {
    createCapture.mockResolvedValue(savedCapture);
    render(<CaptureForm />);

    expect(screen.queryByText('diary.process_mode_label')).toBeNull();
    expect(screen.queryByText('diary.entry_type_label')).toBeNull();
    fireEvent.change(screen.getByLabelText('diary.text_label_quick_fragment'), {
      target: { value: savedCapture.raw_text },
    });
    fireEvent.click(screen.getByRole('button', { name: 'diary.save_note' }));

    await screen.findByText('diary.note_saved_prompt');
    expect(createCapture).toHaveBeenCalledWith(expect.objectContaining({
      entry_type: 'quick_fragment',
      process_mode: 'save_only',
      modality: 'text',
      raw_text: savedCapture.raw_text,
    }));
    expect(createCapture.mock.calls[0][0]).not.toHaveProperty('allow_weekly_review');
    expect(analyzeCapture).not.toHaveBeenCalled();
  });

  it('only analyzes after an explicit request and then permits a separate weekly-review choice', async () => {
    createCapture.mockResolvedValue(savedCapture);
    analyzeCapture.mockResolvedValue({
      ...savedCapture,
      process_mode: 'analyze',
      interpretations: [{
        id: 'cue-1',
        dimension: 'stressResponse',
        ai_explanation: '这是一条待核对的线索。',
        status: 'pending',
        proposed_delta: 2,
        support_count: 0,
      }],
    });
    setWeeklyReviewPermission.mockResolvedValue({
      ...savedCapture,
      process_mode: 'analyze',
      allow_weekly_review: true,
    });

    render(<CaptureForm />);
    fireEvent.change(screen.getByLabelText('diary.text_label_quick_fragment'), {
      target: { value: savedCapture.raw_text },
    });
    fireEvent.click(screen.getByRole('button', { name: 'diary.save_note' }));
    await screen.findByText('diary.note_saved_prompt');

    fireEvent.click(screen.getByRole('button', { name: 'diary.analyze_this_note' }));
    expect(await screen.findByText('这是一条待核对的线索。')).toBeInTheDocument();
    expect(analyzeCapture).toHaveBeenCalledWith('capture-1');

    fireEvent.click(screen.getByLabelText('diary.allow_weekly_review'));
    await waitFor(() => expect(setWeeklyReviewPermission).toHaveBeenCalledWith('capture-1', true));
  });

  it('keeps the single-note boundary and privacy wording localized in all supported languages', () => {
    expect(messages['zh-CN'].diary.single_note_analysis_boundary).toContain('一次经历');
    expect(messages.en.diary.single_note_analysis_boundary).toContain('One experience');
    expect(messages.ja.diary.save_only_notice).toContain('保存');
    expect(messages.es.diary.weekly_permission_next_step).toContain('revisión semanal');
  });
});
