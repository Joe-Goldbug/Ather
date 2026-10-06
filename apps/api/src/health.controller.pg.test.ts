import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { expect, test } from 'vitest';
import { Pool } from 'pg';
import { Database } from './common/database.js';
import { HealthController } from './health.controller.js';

const url = process.env.EVA_TEST_DATABASE_URL;
const isolated = process.env.EVA_TEST_DATABASE_ISOLATED === '1';

test('readiness blocks a user resurrected from an older backup', async ({ skip }) => {
  if (!url || !isolated) skip();
  const pool = new Pool({ connectionString: url! });
  const userId = randomUUID();
  const controller = new HealthController(
    new Database(pool as never),
    { ping: async () => 'PONG' } as never,
  );
  try {
    await pool.query('INSERT INTO account_deletion_tombstones (user_id) VALUES ($1)', [userId]);
    await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)',
      [userId, `restored-${userId}@example.invalid`]);

    const error = await controller.ready().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getResponse()).toMatchObject({
      dependencies: { database: 'unsafe_restore', redis: 'ok' },
    });
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM account_deletion_tombstones WHERE user_id = $1', [userId]);
    await pool.end();
  }
});
