import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./2026-09-26-evidence-input-archive-owner-fk.sql', import.meta.url), 'utf8');

describe('evidence archive account ownership', () => {
  it('prevents new orphan archives and cascades explicit account deletion', () => {
    expect(sql).toMatch(/FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE CASCADE NOT VALID/i);
    expect(sql).not.toMatch(/DELETE FROM evidence_input_archives/i);
  });
});
