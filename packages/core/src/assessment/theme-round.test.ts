import { describe, expect, test } from 'bun:test';
import {
  THEME_LENSES,
  buildThemeRoundResult,
  decideThemeRoundFollowUp,
  getThemeQuestionBank,
  selectThemeRoundCore,
  validateThemeRoundAnswers,
} from './theme-round.js';

describe('theme round question bank', () => {
  test('contains exactly 24 candidate questions for every product theme', () => {
    for (const lens of THEME_LENSES) {
      const questions = getThemeQuestionBank(lens);
      expect(questions).toHaveLength(24);
      expect(new Set(questions.map((question) => question.question_id)).size).toBe(24);
      expect(new Set(questions.map((question) => question.focus_key)).size).toBe(6);
      expect(new Set(questions.map((question) => question.context)).size).toBe(4);
    }
  });

  test('selects six distinct core focuses without legacy score fields', () => {
    const questions = selectThemeRoundCore('relationship', 0);
    expect(questions).toHaveLength(6);
    expect(new Set(questions.map((question) => question.focus_key)).size).toBe(6);
    expect(JSON.stringify(questions)).not.toContain('vector_patch');
    expect(JSON.stringify(questions)).not.toContain('target_dimension');
  });

  test('starts a follow-up round with a different context for a disputed observation', () => {
    const disputed = selectThemeRoundCore('emotion', 0)[2]!;
    const questions = selectThemeRoundCore('emotion', 1, disputed.question_id);
    expect(questions).toHaveLength(6);
    expect(new Set(questions.map((question) => question.focus_key)).size).toBe(6);
    expect(questions[0]?.focus_key).toBe(disputed.focus_key);
    expect(questions[0]?.context).not.toBe(disputed.context);
    expect(selectThemeRoundCore('emotion', 1, 'old-bank-question')).toEqual(selectThemeRoundCore('emotion', 1));
  });
});

describe('theme round completion and result boundary', () => {
  const questions = selectThemeRoundCore('emotion', 0);
  const complete = questions.map((question, index) => ({
    question_id: question.question_id,
    choice_id: (['A', 'B', 'C', 'D', 'A', 'B'] as const)[index],
  }));

  test('requires all six core answers and never permits more than eight decisions', () => {
    expect(validateThemeRoundAnswers(questions, complete)).toEqual([]);
    expect(validateThemeRoundAnswers(questions, complete.slice(0, 5))).toContain(
      `missing_core_answer:${questions[5]!.question_id}`
    );
    expect(validateThemeRoundAnswers(questions, [...complete, ...complete.slice(0, 3)])).toContain(
      'round_exceeds_eight_decision_points'
    );
  });

  test('makes a vocabulary-specific current-round result with evidence links', () => {
    const result = buildThemeRoundResult('emotion', questions, complete);
    expect(result?.theme_title).toContain('情绪');
    expect(result?.observations).toHaveLength(4);
    expect(result?.evidence).toHaveLength(6);
    expect(result?.boundary).toContain('不是对你的永久人格定义');
    expect(JSON.stringify(result)).not.toContain('人格类型');
  });

  test('does not invent a dominant response when approaches are tied', () => {
    const result = buildThemeRoundResult('emotion', questions, complete);
    expect(result?.headline).not.toContain('更常');
    expect(result?.watchout).toContain('不能据此推断稳定倾向');
    expect(result?.observations[0]?.evidence_question_id).toBe(questions[0]?.question_id);
  });

  test('only requests a follow-up for an explicit split or repeated withdrawal', () => {
    const noFollowup = questions.map((question) => ({
      question_id: question.question_id,
      choice_id: 'C' as const,
    }));
    expect(decideThemeRoundFollowUp(questions, noFollowup)).toBeNull();
    const split = questions.map((question, index) => ({
      question_id: question.question_id,
      choice_id: (index % 2 === 0 ? 'A' : 'D') as const,
    }));
    expect(decideThemeRoundFollowUp(questions, split)?.role).toBe('counterexample');
  });

  test('uses explicit user context to request clarification and makes a second scene depend on the first', () => {
    const contextual = questions.map((question, index) => ({
      question_id: question.question_id,
      choice_id: 'C' as const,
      free_text: index === 5 ? '这只会发生在直属上级面前，和朋友相处时不会。' : undefined,
    }));
    const first = decideThemeRoundFollowUp(questions, contextual);
    expect(first?.role).toBe('clarifier');

    const firstAnswer = {
      question_id: first!.question_id,
      choice_id: 'A' as const,
    };
    const second = decideThemeRoundFollowUp([...questions, first!], [...contextual, firstAnswer]);
    expect(second?.question_id).not.toBe(first?.question_id);
    expect(second?.parent_question_id).toBe(first?.question_id);
    expect(second?.prompt).toContain('刚才的追问');
  });
});
