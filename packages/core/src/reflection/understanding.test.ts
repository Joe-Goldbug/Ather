import { describe, expect, test } from 'bun:test';
import {
  validateUnderstandingOutput,
  type UnderstandingEvidence,
} from './understanding.js';

const evidence: UnderstandingEvidence[] = [
  { id: 'theme:r1:q1:choice', kind: 'simulation_choice', text: '先确认现场的信息，再决定是否回应。' },
  { id: 'turn:t1:user', kind: 'user_statement', text: '我不是怕冲突，只是觉得继续争论没有意义。' },
];

describe('validateUnderstandingOutput', () => {
  test('accepts a grounded provisional understanding with uncertainty', () => {
    const output = validateUnderstandingOutput({
      kind: 'understanding',
      reaction: {
        text: '这次你先确认信息，再决定是否回应。',
        evidence: [{ source_id: 'theme:r1:q1:choice', quote: '先确认现场的信息' }],
      },
      possible_meaning: {
        text: '你补充说继续争论没有意义，因此这里不能直接解释成害怕冲突。',
        evidence: [{ source_id: 'turn:t1:user', quote: '继续争论没有意义' }],
      },
      uncertainty: '还不能判断换成愿意听的人时，你会不会更直接表达分歧。',
      change: null,
    }, evidence, 'summarize');

    expect(output.kind).toBe('understanding');
  });

  test('rejects an invented or mismatched citation', () => {
    expect(() => validateUnderstandingOutput({
      kind: 'understanding',
      reaction: {
        text: '你会退让。',
        evidence: [{ source_id: 'theme:r1:q1:choice', quote: '你天生会退让' }],
      },
      possible_meaning: null,
      uncertainty: '仍需要更多具体情境。',
      change: null,
    }, evidence, 'summarize')).toThrow('invalid_understanding_output');
  });

  test('rejects fixed personality labels and unsupported absolute claims', () => {
    expect(() => validateUnderstandingOutput({
      kind: 'understanding',
      reaction: {
        text: '你是回避型人格，所以你总是逃避冲突。',
        evidence: [{ source_id: 'turn:t1:user', quote: '不是怕冲突' }],
      },
      possible_meaning: null,
      uncertainty: '还需要更多信息。',
      change: null,
    }, evidence, 'summarize')).toThrow('invalid_understanding_output');
  });

  test('requires corrections to identify the exact earlier understanding they revise', () => {
    expect(() => validateUnderstandingOutput({
      kind: 'understanding',
      reaction: {
        text: '这次你先确认信息，再决定是否回应。',
        evidence: [{ source_id: 'theme:r1:q1:choice', quote: '先确认现场的信息' }],
      },
      possible_meaning: null,
      uncertainty: '还需要更多信息。',
      change: { prior_turn_id: '', text: '我调整了理解。', evidence: [] },
    }, evidence, 'correction', 'turn:earlier')).toThrow('invalid_understanding_output');

    expect(() => validateUnderstandingOutput({
      kind: 'understanding',
      reaction: {
        text: '这次你先确认信息，再决定是否回应。',
        evidence: [{ source_id: 'theme:r1:q1:choice', quote: '先确认现场的信息' }],
      },
      possible_meaning: null,
      uncertainty: '还需要更多信息。',
      change: null,
    }, evidence, 'correction', 'turn:earlier')).toThrow('invalid_understanding_output');

    expect(() => validateUnderstandingOutput({
      kind: 'understanding',
      reaction: {
        text: '这次你先确认信息，再决定是否回应。',
        evidence: [{ source_id: 'theme:r1:q1:choice', quote: '先确认现场的信息' }],
      },
      possible_meaning: null,
      uncertainty: '还需要更多信息。',
      change: {
        prior_turn_id: 'turn:someone-else', text: '我调整了理解。',
        evidence: [{ source_id: 'turn:t1:user', quote: '继续争论没有意义' }],
      },
    }, evidence, 'correction', 'turn:earlier')).toThrow('invalid_understanding_output');
  });
});
