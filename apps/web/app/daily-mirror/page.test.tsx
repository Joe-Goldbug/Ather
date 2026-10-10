
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DailyMirrorPage from './page';
const { list, recent, create, review, feedback, compare } = vi.hoisted(() => ({
  list: vi.fn(), recent: vi.fn(), create: vi.fn(), review: vi.fn(), feedback: vi.fn(), compare: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  capturesApi: { list, create, review, reviewFeedback: feedback, compare }, diaryApi: { recent },
}));
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: 'user-1' }, loading: false }) }));
vi.mock('../providers-impl', () => ({ useLocale: () => ({ locale: 'zh-CN' }) }));
const note = {
  id: '11111111-1111-4111-8111-111111111111', entry_type: 'quick_fragment', process_mode: 'save_only',
  raw_text: '我说可以，其实今晚有约。', local_date: '2026-10-10', captured_at: '2026-10-10T10:00:00Z',
  note_reviews: [],
};
const paragraph = { text: '你先回应了可以，还写下了自己原本已有安排。', evidence: [{ source_id: note.id, quote: '我说可以' }] };
const result = {
  id: 'review-1', schema: 'eva-note-review-v1', kind: 'single', source_ids: [note.id], revision: 1, parent_id: null,
  content: { reaction: paragraph, impact: { ...paragraph, text: '对方可能以为你有时间帮忙。' }, uncertainty: { ...paragraph, text: '当时为何没有说出安排，还需要你的补充。' }, question: '答应时你最在意什么？' },
  feedback: [], supplements: [], model: 'fixture', created_at: '2026-10-10',
};
beforeEach(() => { vi.resetAllMocks(); list.mockResolvedValue([]); recent.mockResolvedValue([]); });
describe('notes product journey', () => {
  it('shows three layers and opens the saved note; feedback remains after returning and reopening', async () => {
    create.mockResolvedValue(note); review.mockResolvedValue(result);
    feedback.mockResolvedValue({ ...result, feedback: [{ response: 'wrong', note: '我只是忘了约定', created_at: '2026-10-10' }] });
    render(<DailyMirrorPage />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: note.raw_text } });
    fireEvent.click(screen.getByRole('button', { name: '保存这条笔记' }));
    expect(await screen.findByText('你的原文')).toBeInTheDocument();
    expect(review).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '帮我看懂这次反应' }));
    expect(await screen.findByText(paragraph.text)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('查看原文依据')[0]);
    expect(screen.getAllByText('我说可以').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '理解错了' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '我只是忘了约定' } });
    fireEvent.click(screen.getByRole('button', { name: '保留我的补充' }));
    await screen.findByRole('status');
    expect(feedback).toHaveBeenCalledWith(note.id, result.id, 'wrong', '我只是忘了约定');
    fireEvent.click(screen.getByRole('button', { name: '返回记录' }));
    fireEvent.click(screen.getByRole('button', { name: /打开记录/ }));
    expect(screen.getByText(paragraph.text)).toBeInTheDocument();
    expect(screen.getByText(/我只是忘了约定/)).toBeInTheDocument();
    expect(screen.getByText(/有异议/)).toBeInTheDocument();
  });
  it('restores saved interpretation and feedback from the API after a page reload', async () => {
    list.mockResolvedValue([{ ...note, note_reviews: [{ ...result, feedback: [{ response: 'partly', note: '那天很赶时间', created_at: '2026-10-10' }] }] }]);
    render(<DailyMirrorPage />);
    fireEvent.click(screen.getByRole('tab', { name: '我的记录' }));
    fireEvent.click(await screen.findByRole('button', { name: /打开记录/ }));
    expect(screen.getByText(paragraph.text)).toBeInTheDocument();
    expect(screen.getByText(/那天很赶时间/)).toBeInTheDocument();
  });
  it('keeps loaded records visible on partial failure and can retry', async () => {
    list.mockResolvedValue([note]); recent.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    render(<DailyMirrorPage />);
    fireEvent.click(screen.getByRole('tab', { name: '我的记录' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByText(note.raw_text)[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载记录' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
  it('only sends explicitly selected records for comparison', async () => {
    const other = { ...note, id: '33333333-3333-4333-8333-333333333333', raw_text: '我告诉朋友今晚不方便。' };
    list.mockResolvedValue([note, other]);
    compare.mockResolvedValue({ ...result, kind: 'comparison', source_ids: [note.id, other.id] });
    render(<DailyMirrorPage />);
    fireEvent.click(screen.getByRole('tab', { name: '回看自己' }));
    const checkboxes = await screen.findAllByRole('checkbox');
    expect(compare).not.toHaveBeenCalled();
    fireEvent.click(checkboxes[0]); fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: '回看这些记录' }));
    await waitFor(() => expect(compare).toHaveBeenCalledWith([note.id, other.id], 'zh-CN', undefined));
  });
});
