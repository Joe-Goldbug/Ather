import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnderstandingEvidence } from '@eva/core';
import { generateUnderstanding } from './understanding.generator.js';

const evidence: UnderstandingEvidence[] = [
  { id: 'choice-1', kind: 'simulation_choice', text: '你先核查事实，再决定下一步。' },
  { id: 'note-1', kind: 'user_statement', text: '我当时担心自己会误判。' },
];

describe('generateUnderstanding', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_MODEL', 'test-model');
    vi.stubEnv('LLM_BASE_URL', 'https://example.test/v1');
  });

  it('accepts a directly addressed response with literal evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      kind: 'understanding',
      reaction: { text: '你先核查事实，再决定下一步；这次做法让处理有了依据。', evidence: [{ source_id: 'choice-1', quote: '你先核查事实，再决定下一步。' }] },
      possible_meaning: { text: '这可能和你当时担心误判有关，但还需要你自己确认。', evidence: [{ source_id: 'note-1', quote: '我当时担心自己会误判。' }] },
      uncertainty: '这只对应这次情境，不能说明你在所有关系或压力下都会这样。',
      change: null,
    }) } }] }), { status: 200 })));
    const result = await generateUnderstanding({
      action: 'message', text: '我想理解这件事。', locale: 'zh-CN', evidence,
    });
    expect(result.output.kind).toBe('understanding');
    expect(result.model).toBe('test-model');
  });

  it('rejects unsupported claims returned by the model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      kind: 'understanding',
      reaction: { text: '你是回避型人格。', evidence: [{ source_id: 'choice-1', quote: '你先核查事实，再决定下一步。' }] },
      possible_meaning: null,
      uncertainty: '信息有限。',
      change: null,
    }) } }] }), { status: 200 })));
    await expect(generateUnderstanding({ action: 'message', text: '我想理解这件事。', locale: 'zh-CN', evidence }))
      .rejects.toMatchObject({ response: { code: 'understanding_unavailable' } });
  });
});
