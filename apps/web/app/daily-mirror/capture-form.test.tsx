
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureForm } from './capture-form';
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/api', () => ({ capturesApi: { create } }));
vi.mock('../providers-impl', () => ({ useLocale: () => ({ locale: 'zh-CN' }) }));
describe('note writing', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('saves without analysis permission and hands the record to the detail view', async () => {
    const note = { id: 'note-1', raw_text: '今天和朋友在一起很自在', process_mode: 'save_only' };
    create.mockResolvedValue(note);
    const onCaptured = vi.fn();
    render(<CaptureForm onCaptured={onCaptured} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: note.raw_text } });
    fireEvent.click(screen.getByRole('button', { name: '保存这条笔记' }));
    await waitFor(() => expect(onCaptured).toHaveBeenCalledWith(note));
    expect(create.mock.calls[0][0]).toMatchObject({ process_mode: 'save_only', raw_text: note.raw_text });
    expect(create.mock.calls[0][0]).not.toHaveProperty('allow_weekly_review');
  });
  it('retains the draft when saving fails and disables empty submissions', async () => {
    create.mockRejectedValue(new Error('offline'));
    render(<CaptureForm />);
    expect(screen.getByRole('button', { name: '保存这条笔记' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '不能丢失的原文' } });
    fireEvent.click(screen.getByRole('button', { name: '保存这条笔记' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue('不能丢失的原文');
  });
});
