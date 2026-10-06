import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureForm } from './capture-form';
import { messages } from '@/messages';

const { createCapture, confirmInterpretation, refuteInterpretation } = vi.hoisted(() => ({
  createCapture: vi.fn(),
  confirmInterpretation: vi.fn(),
  refuteInterpretation: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  capturesApi: { create: createCapture, confirmInterpretation, refuteInterpretation },
}));
vi.mock('@/app/providers-impl', () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

describe('CaptureForm rule-based cues', () => {
  it('shows visible loading while a newly-created cue is being confirmed', async () => {
    let resolveConfirm!: (value: { success: boolean }) => void;
    createCapture.mockResolvedValueOnce({
      id: 'capture-loading', entry_type: 'quick_fragment', process_mode: 'analyze',
      modality: 'text', raw_text: 'Synthetic note', allow_weekly_review: false,
      local_date: '2026-09-26', captured_at: '2026-09-26T00:00:00.000Z',
      interpretations: [{ id: 'cue-loading', dimension: 'stressResponse',
        ai_explanation: 'Synthetic cue', status: 'pending', proposed_delta: 1, support_count: 0 }],
    });
    confirmInterpretation.mockReturnValueOnce(new Promise((resolve) => { resolveConfirm = resolve; }));

    render(<CaptureForm />);
    fireEvent.click(screen.getByText('diary.process_mode_analyze'));
    fireEvent.change(screen.getByLabelText('diary.text_label_quick_fragment'), {
      target: { value: 'Synthetic note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'diary.submit_capture_aria' }));
    expect(await screen.findByText('Synthetic cue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));

    const loading = screen.getByRole('button', { name: 'common.loading' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading.querySelector('.action-loading-spinner')).not.toBeNull();
    resolveConfirm({ success: true });
    expect(await screen.findByText('diary.interpretation_confirmed')).toBeInTheDocument();
  });

  it('shows a failed confirmation and lets the user retry without claiming a formal portrait', async () => {
    const onCaptureUpdated = vi.fn();
    createCapture.mockResolvedValueOnce({
      id: 'capture-1', entry_type: 'quick_fragment', process_mode: 'analyze',
      modality: 'text', raw_text: '我在工作中感到压力', allow_weekly_review: false,
      local_date: '2026-09-26', captured_at: '2026-09-26T00:00:00.000Z',
      summary: '我在工作中感到压力',
      interpretations: [{ id: 'interpretation-1', dimension: 'stressResponse',
        ai_explanation: '待核对线索', status: 'pending', proposed_delta: 3, support_count: 0 }],
    });
    confirmInterpretation.mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValueOnce({ success: true });
    refuteInterpretation.mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValueOnce({ success: true });

    render(<CaptureForm onCaptureUpdated={onCaptureUpdated} />);
    fireEvent.click(screen.getByText('diary.process_mode_analyze'));
    fireEvent.change(screen.getByLabelText('diary.text_label_quick_fragment'), {
      target: { value: '我在工作中感到压力' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'diary.submit_capture_aria' }));
    expect(await screen.findByText('diary.interpretation_scope')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('diary.interpretation_confirm_failed');
    expect(screen.getByText('diary.interpretation_pending')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(screen.getByText('diary.interpretation_confirmed')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onCaptureUpdated).toHaveBeenCalledWith(expect.objectContaining({
      interpretations: [expect.objectContaining({ id: 'interpretation-1', status: 'confirmed' })],
    }));
    fireEvent.click(screen.getByRole('button', { name: 'diary.interpretation_refute' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('diary.interpretation_refute_failed');
    expect(screen.getByText('diary.interpretation_confirmed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'diary.interpretation_refute' }));
    await waitFor(() => expect(screen.getByText('diary.interpretation_rejected')).toBeInTheDocument());
    expect(onCaptureUpdated).toHaveBeenCalledWith(expect.objectContaining({
      interpretations: [expect.objectContaining({ id: 'interpretation-1', status: 'refuted' })],
    }));
  });

  it('describes the local rule path honestly in all supported languages', () => {
    expect(messages['zh-CN'].diary.process_mode_organize_desc).toContain('不生成摘要');
    expect(messages.en.diary.process_mode_analyze_desc).toContain('no AI model');
    expect(messages.ja.diary.process_mode_analyze_desc).toContain('AI は呼び出しません');
    expect(messages.es.diary.process_mode_analyze_desc).toContain('no se usa IA');
    expect(messages['zh-CN'].diary.allow_weekly_review).toContain('AI 周回看');
  });
});
