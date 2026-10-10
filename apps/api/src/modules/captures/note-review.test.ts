import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateNoteReview, validateNoteContent } from './note-review.js';

const source = { id: 'note-1', text: '我说可以，其实今晚有约。答应之后有点烦。' };
const content = {
  reaction: { text: '你先答应了请求，自己的安排没有同时说出来。', evidence: [{ source_id: source.id, quote: '我说可以' }] },
  impact: { text: '对方可能以为你有时间帮忙，两个安排可能产生冲突。', evidence: [{ source_id: source.id, quote: '其实今晚有约' }] },
  uncertainty: { text: '目前还不知道你当时是忘记约定，还是来不及表达安排。', evidence: [{ source_id: source.id, quote: '答应之后有点烦' }] },
  question: '答应的那一刻，你最在意什么？',
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe('evidence-grounded note reviews', () => {
  it('retains validated sections and exact quotes', () => {
    expect(validateNoteContent(content, [source])).toEqual(content);
  });
  it('rejects fabricated quotes and source IDs, missing explanations and trait labels', () => {
    expect(() => validateNoteContent({ ...content, reaction: { ...content.reaction, evidence: [{ source_id: source.id, quote: '我怕他生气' }] } }, [source])).toThrow();
    expect(() => validateNoteContent({ ...content, reaction: { ...content.reaction, evidence: [{ source_id: 'another-person', quote: '我说可以' }] } }, [source])).toThrow();
    expect(() => validateNoteContent({ ...content, uncertainty: null }, [source])).toThrow();
    expect(() => validateNoteContent({ ...content, reaction: { ...content.reaction, text: '你就是一种非常典型的讨好型人格。' } }, [source])).toThrow();
  });
  it('calls the configured model only with supplied records and saves no fake fallback', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://model.example.test/v1');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) } as Response);
    const generated = await generateNoteReview([source], [], 'single', 'zh-CN');
    expect(generated.content).toEqual(content);
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(JSON.parse(body.messages[1].content)).toMatchObject({ kind: 'single', records: [source], user_supplements: [] });
    fetch.mockResolvedValueOnce({ ok: false } as Response);
    await expect(generateNoteReview([source], [], 'single', 'zh-CN')).rejects.toMatchObject({ response: { code: 'note_review_unavailable' } });
  });
  it('rejects comparisons that do not reference every selected original record', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) } as Response);
    await expect(generateNoteReview([source, { id: 'note-2', text: '我说今晚不方便。' }], [], 'comparison', 'zh-CN'))
      .rejects.toMatchObject({ response: { code: 'note_review_unavailable' } });
  });
  it('retries invalid model citations once and accepts only the corrected output', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-test-key');
    const invalid = { ...content, reaction: { ...content.reaction, evidence: [{ source_id: source.id, quote: '我当时说可以' }] } };
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(invalid) } }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) } as Response);
    expect((await generateNoteReview([source], [], 'single', 'zh-CN')).content).toEqual(content);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
