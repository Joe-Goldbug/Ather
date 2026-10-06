import { describe, expect, it } from 'vitest';
import { sourceTables, orphanPredicate } from '../../../../scripts/cleanup-orphan-evidence-sources.mjs';

describe('orphan evidence source ownership', () => {
  it('accepts both ordinary assessments and dynamic scripts as test sources', () => {
    expect(sourceTables('test')).toEqual(['assessment_runs', 'dynamic_scripts']);
    const sql = orphanPredicate('test');
    expect(sql).toContain('FROM assessment_runs src');
    expect(sql).toContain('FROM dynamic_scripts src');
    expect(sql.match(/src.user_id = e.user_id/g)).toHaveLength(2);
    expect(sql.match(/NOT EXISTS/g)).toHaveLength(2);
  });

  it('preserves existing sources and skips unknown types', () => {
    expect(sourceTables('micro_sandbox_practice')).toEqual(['assessment_runs']);
    expect(orphanPredicate('chat')).toContain('FROM conversations src');
    expect(orphanPredicate('anything; DROP TABLE users')).toBeNull();
  });

  it('does not cast unvalidated identifiers or repeatedly withdraw isolated evidence', () => {
    const sql = orphanPredicate('test');
    expect(sql).not.toContain('source_id::uuid');
    expect(sql).toContain('LOWER(e.source_id)');
    expect(sql).toContain("e.portrait_status IS DISTINCT FROM 'withdrawn'");
    expect(sql).toContain('e.source_id ~*');
  });
});
