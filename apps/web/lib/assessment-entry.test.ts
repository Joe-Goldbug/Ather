import { describe, expect, it } from 'vitest';
import { resolveAssessmentEntryPath } from './assessment-entry';

describe('resolveAssessmentEntryPath', () => {
  it('sends every authenticated user state to the single theme-round authority', () => {
    expect(resolveAssessmentEntryPath(null)).toBe('/theme-assessment');
    expect(resolveAssessmentEntryPath({ id: 'u', email: 'a@b.c', baseline_completed: false })).toBe(
      '/theme-assessment'
    );
    expect(
      resolveAssessmentEntryPath({
        id: 'u',
        email: 'a@b.c',
        baseline_completed: true,
        sandbox_completed_today: true,
      })
    ).toBe('/theme-assessment');
  });
});
