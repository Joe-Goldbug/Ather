// apps/api/src/modules/assessment/services/micro-sandbox/variable-extractor.service.spec.ts
//
// Hermetic tests for VariableExtractorService.
//
// We pass an in-memory QueryPool stub into Database (instead of a real
// Postgres pool). The stub models writes against the current row;
// PostgreSQL integration checks verify execution of the SQL separately.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { Database } from '../../../../common/database.js';
import { VariableExtractorService } from './variable-extractor.service.js';

// ----- In-memory QueryPool stub -------------------------------------------

interface Row {
  id: string;
  memory_state: Record<string, unknown> | null;
}

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: Row[] }>;

interface QueryPoolStub {
  rows: Row[];
  query: jest.Mock;
  beforeUpdate?: () => void;
}

function createPoolStub(): QueryPoolStub {
  const rows: Row[] = [];
  const queryFn: QueryFn = async (text, params = []) => {
      if (text.startsWith('SELECT memory_state FROM users WHERE id = $1')) {
        const id = params[0] as string;
        return { rows: structuredClone(rows.filter((r) => r.id === id)) };
      }
      if (text.trimStart().startsWith('UPDATE users SET memory_state = jsonb_set(')) {
        pool.beforeUpdate?.();
        const existing = rows.find((r) => r.id === params[0]);
        if (!existing) return { rows: [] };
        const memory = existing.memory_state ?? {};
        const history = (memory.dynamic_script_history ?? {
          recent_variables: [],
          accumulated_patterns: {
            emotion_patterns: [], coping_patterns: [], value_tendencies: [],
          },
          personalization_level: 0,
        }) as Record<string, unknown>;
        existing.memory_state = {
          ...memory,
          dynamic_script_history: {
            ...history,
            recent_variables: [
              ...((history.recent_variables ?? []) as unknown[]),
              JSON.parse(params[1] as string),
            ].slice(-(params[2] as number)),
            personalization_level: ((history.personalization_level ?? 0) as number) + 1,
          },
        };
        return { rows: [existing] };
      }
      throw new Error(`Unexpected query: ${text}`);
    };
  const pool: QueryPoolStub = {
    rows,
    query: jest.fn(queryFn),
  };
  return pool;
}

// ----- Tests ---------------------------------------------------------------

describe('VariableExtractorService', () => {
  let pool: QueryPoolStub;
  let db: Database;
  let service: VariableExtractorService;

  beforeEach(() => {
    pool = createPoolStub();
    // Database constructor accepts any object shaped like a QueryPool —
    // the real basePool exposes { query, connect, end? }.
    db = new Database(pool as unknown as ConstructorParameters<typeof Database>[0]);
    service = new VariableExtractorService(db);
  });

  /**
   * Seed a user row with an empty memory_state so the service's
   * "user must already exist" precondition is satisfied. Mirrors a real
   * Postgres row created elsewhere in the app.
   */
  function seedUser(userId: string): void {
    pool.rows.push({ id: userId, memory_state: null });
  }

  const variables = {
    scenario_type: 'work' as const,
    trigger_event: 'Event',
    primary_emotion: 'neutral',
    emotion_intensity: 0.5,
    emotional_response: 'normal',
    key_persons: [],
    coping_strategy: 'normal',
  };

  test('does not restore conversation history pruned before the write', async () => {
    pool.rows.push({ id: 'test-user-id', memory_state: {
      conversation_history: [{ content: 'expired' }],
      other_memory: { value: 'before' },
    } });
    pool.beforeUpdate = () => {
      pool.rows[0].memory_state = {
        ...pool.rows[0].memory_state,
        conversation_history: [],
        other_memory: { value: 'concurrent update' },
      };
    };

    await service.appendToMemoryState('test-user-id', variables);

    expect(pool.rows[0].memory_state).toMatchObject({
      conversation_history: [],
      other_memory: { value: 'concurrent update' },
      dynamic_script_history: { recent_variables: [variables], personalization_level: 1 },
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('jsonb_set(');
    expect(sql).toContain("'{dynamic_script_history}'");
    expect(sql).toContain('WITH ORDINALITY');
    expect(sql).toContain('ORDER BY ordinal DESC LIMIT $3');
    expect(sql).toContain('ORDER BY ordinal)');
    expect(sql).toContain('RETURNING id');
  });

  test('preserves accumulated patterns and unrelated history fields', async () => {
    const patterns = { emotion_patterns: ['anger'], coping_patterns: [], value_tendencies: [] };
    pool.rows.push({ id: 'test-user-id', memory_state: {
      dynamic_script_history: {
        recent_variables: [], accumulated_patterns: patterns,
        personalization_level: 7, custom_field: 'keep',
      },
    } });
    await service.appendToMemoryState('test-user-id', variables);
    expect(pool.rows[0].memory_state?.dynamic_script_history).toEqual({
      recent_variables: [variables], accumulated_patterns: patterns,
      personalization_level: 8, custom_field: 'keep',
    });
  });

  test('rejects a missing user without creating a row', async () => {
    await expect(service.appendToMemoryState('missing-user', variables))
      .rejects.toThrow('User missing-user not found');
    expect(pool.rows).toEqual([]);
  });

  test('rejects a user deleted before the update without recreating it', async () => {
    seedUser('test-user-id');
    pool.beforeUpdate = () => { pool.rows.splice(0); };

    await expect(service.appendToMemoryState('test-user-id', variables))
      .rejects.toThrow('User test-user-id not found');
    expect(pool.rows).toEqual([]);
  });

  test('appendToMemoryState adds variables to recent_variables array', async () => {
    seedUser('test-user-id');
    await service.appendToMemoryState('test-user-id', {
      scenario_type: 'work',
      trigger_event: 'Project conflict',
      primary_emotion: 'anger',
      emotion_intensity: 0.7,
      emotional_response: 'Felt disrespected',
      key_persons: [
        { name: '李明', relationship: 'colleague', relationship_quality: 0.3 },
      ],
      coping_strategy: 'silent withdrawal',
    });

    const result = await db.pool.query<Row>(
      'SELECT memory_state FROM users WHERE id = $1',
      ['test-user-id'],
    );
    expect(result.rows).toHaveLength(1);

    const memState = result.rows[0].memory_state as {
      dynamic_script_history: {
        recent_variables: { primary_emotion: string }[];
        personalization_level: number;
      };
    };
    expect(memState.dynamic_script_history.recent_variables).toHaveLength(1);
    expect(
      memState.dynamic_script_history.recent_variables[0].primary_emotion,
    ).toBe('anger');
    expect(memState.dynamic_script_history.personalization_level).toBe(1);
  });

  test('appendToMemoryState caps recent_variables at 10', async () => {
    seedUser('test-user-id');
    for (let i = 0; i < 12; i++) {
      await service.appendToMemoryState('test-user-id', {
        scenario_type: 'work',
        trigger_event: `Event ${i}`,
        primary_emotion: 'neutral',
        emotion_intensity: 0.5,
        emotional_response: 'normal',
        key_persons: [],
        coping_strategy: 'normal',
      });
    }

    const result = await db.pool.query<Row>(
      'SELECT memory_state FROM users WHERE id = $1',
      ['test-user-id'],
    );
    const memState = result.rows[0].memory_state as {
      dynamic_script_history: {
        recent_variables: { trigger_event: string }[];
        personalization_level: number;
      };
    };

    expect(memState.dynamic_script_history.recent_variables).toHaveLength(10);
    // Oldest 2 should be dropped; newest 2 should be at the tail.
    expect(memState.dynamic_script_history.recent_variables[0].trigger_event).toBe(
      'Event 2',
    );
    expect(memState.dynamic_script_history.recent_variables[9].trigger_event).toBe(
      'Event 11',
    );
    expect(memState.dynamic_script_history.personalization_level).toBe(12);
  });
});
