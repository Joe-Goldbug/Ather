// packages/core/src/assessment/date-slice.test.ts
// Regression test for new bug surfaced by dogfood with real PG (2026-06-15):
//
//   assessment.service.ts:1017 (in loadRecentCaptureDiaryEntries):
//     date: row.local_date ?? row.captured_at.slice(0, 10),
//
//   `captured_at` from real PG is a Date object, not a string. Calling
//   .slice(0, 10) on a Date throws:
//     TypeError: row.captured_at.slice is not a function
//   This breaks /assessment/micro-sandbox/next for any user who has
//   recorded at least one capture.
//
// Contract: a helper that maps a capture row's captured_at to a
// YYYY-MM-DD date must accept BOTH string AND Date, and produce
// YYYY-MM-DD in either case.

import { describe, test, expect } from 'bun:test';

// Mirrors the fix in apps/api/src/modules/assessment/assessment.service.ts
function captureDate(row: { captured_at: Date | string; local_date: string | null }): string {
  if (row.local_date) return row.local_date;
  if (typeof row.captured_at === 'string') {
    return row.captured_at.slice(0, 10);
  }
  return row.captured_at.toISOString().slice(0, 10);
}

describe('capture row -> YYYY-MM-DD date mapping', () => {
  test('works when captured_at is a string (mock / pre-fix path)', () => {
    const date = captureDate({
      captured_at: '2026-06-15T09:00:00.000Z',
      local_date: null,
    });
    expect(date).toBe('2026-06-15');
  });

  test('works when captured_at is a Date (real PG)', () => {
    // Before fix: this would throw "row.captured_at.slice is not a function"
    const date = captureDate({
      captured_at: new Date('2026-06-15T09:00:00.000Z'),
      local_date: null,
    });
    expect(date).toBe('2026-06-15');
  });

  test('local_date takes precedence over captured_at when present', () => {
    const date = captureDate({
      captured_at: new Date('2026-06-15T09:00:00.000Z'),
      local_date: '2026-06-14',
    });
    expect(date).toBe('2026-06-14');
  });
});
