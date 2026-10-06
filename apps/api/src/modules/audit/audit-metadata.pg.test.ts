import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { expect, test } from 'vitest';
import { ConsentService } from '../consent/consent.service.js';

const migration = readFileSync(new URL('../../../../../packages/database/src/migrations/2026-09-26-z-audit-metadata-only.sql', import.meta.url), 'utf8');

test('audit migration keeps ownership metadata without storing row bodies', () => {
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.audit_trigger()');
  expect(migration).toContain("jsonb_build_object('user_id', source_row -> 'user_id')");
  expect(migration).not.toMatch(/(?:old_data|new_data)\s*=\s*to_jsonb\((?:OLD|NEW)\)/i);
});

test('new audits omit private capture and account content in isolated PostgreSQL', async ({ skip }) => {
  if (!process.env.EVA_TEST_DATABASE_URL || process.env.EVA_TEST_DATABASE_ISOLATED !== '1') skip();
  const pool = new Pool({ connectionString: process.env.EVA_TEST_DATABASE_URL });
  const userId = randomUUID();
  const captureId = randomUUID();
  try {
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)',
      [userId, `audit-${userId}@example.invalid`]);
    await pool.query('UPDATE users SET memory_state = $2::jsonb WHERE id = $1',
      [userId, JSON.stringify({ diary_entries: ['private legacy diary'] })]);
    await pool.query(`INSERT INTO captures (id, user_id, entry_type, process_mode, raw_text)
      VALUES ($1, $2, 'quick_fragment', 'save_only', 'private capture text')`, [captureId, userId]);

    const rows = await pool.query<{ table_name: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }>(
      `SELECT table_name, old_data, new_data FROM audit_logs
       WHERE (table_name = 'users' AND record_id = $1)
          OR (table_name = 'captures' AND record_id = $2)`, [userId, captureId]);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.find((row) => row.table_name === 'users')).toMatchObject({
      old_data: { id: userId }, new_data: { id: userId },
    });
    expect(rows.rows.find((row) => row.table_name === 'captures')).toMatchObject({
      old_data: null, new_data: { id: captureId, user_id: userId },
    });
    expect(JSON.stringify(rows.rows)).not.toMatch(/private legacy diary|private capture text/);
    expect((await pool.query('SELECT raw_text FROM captures WHERE id = $1', [captureId])).rows[0].raw_text)
      .toBe('private capture text');

    const consent = new ConsentService(
      { pool } as never,
      { del: async () => 0 } as never,
      { removeUserJobs: async () => ({ status: 'completed', removed: 0, active: 0 }) } as never,
    );
    const exported = await consent.exportUserData(userId);
    expect(exported.audit_logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: 'captures', new_data: { id: captureId, user_id: userId } }),
    ]));
    await consent.deleteUserData(userId);
    expect((await pool.query('SELECT id FROM audit_logs WHERE record_id IN ($1, $2)', [userId, captureId])).rows)
      .toHaveLength(0);
  } finally {
    await pool.query('DELETE FROM audit_logs WHERE record_id IN ($1, $2)', [userId, captureId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  }
});
