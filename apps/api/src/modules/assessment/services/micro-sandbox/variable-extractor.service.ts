// apps/api/src/modules/assessment/services/micro-sandbox/variable-extractor.service.ts
//
// Variable Extractor — persists InquiryAgentService's ExtractedVariables
// into users.memory_state.dynamic_script_history so subsequent scenarios
// can personalize on a rolling window of recent runs.
//
// Responsibilities:
//   - Atomically update dynamic_script_history via Database.pool.query (RLS-safe)
//   - Append the new variables to recent_variables (oldest first)
//   - Cap the history at MAX_RECENT_VARIABLES (10) — older entries dropped
//   - Bump personalization_level so downstream policies can adapt
//   - Preserve all other memory fields on the current database row

import { Injectable } from '@nestjs/common';
import { Database } from '../../../../common/database.js';
import type { ExtractedVariables } from '../../dto/dynamic-script/shared/extracted-variables.dto.js';

/** Rolling-window cap on `dynamic_script_history.recent_variables`. */
export const MAX_RECENT_VARIABLES = 10;

@Injectable()
export class VariableExtractorService {
  constructor(private readonly db: Database) {}

  /**
   * Append a fresh set of ExtractedVariables to the user's rolling history.
   *
   * A single UPDATE uses the current row, so concurrent retention or memory
   * changes cannot be overwritten by a stale application-side snapshot.
   * Throws when no user row is updated (missing or not visible under RLS).
   */
  async appendToMemoryState(
    userId: string,
    variables: ExtractedVariables,
  ): Promise<void> {
    const result = await this.db.pool.query<{ id: string }>(
      `UPDATE users SET memory_state = jsonb_set(
         COALESCE(memory_state, '{}'::jsonb),
         '{dynamic_script_history}',
         COALESCE(NULLIF(memory_state->'dynamic_script_history', 'null'::jsonb),
           '{"recent_variables":[],"accumulated_patterns":{"emotion_patterns":[],"coping_patterns":[],"value_tendencies":[]},"personalization_level":0}'::jsonb
         ) || jsonb_build_object(
           'recent_variables', (
             SELECT jsonb_agg(value ORDER BY ordinal)
             FROM (
               SELECT value, ordinal
               FROM jsonb_array_elements(
                 COALESCE(memory_state->'dynamic_script_history'->'recent_variables', '[]'::jsonb)
                 || jsonb_build_array($2::jsonb)
               ) WITH ORDINALITY AS entries(value, ordinal)
               ORDER BY ordinal DESC LIMIT $3
             ) AS recent
           ),
           'personalization_level',
             COALESCE((memory_state->'dynamic_script_history'->>'personalization_level')::numeric, 0) + 1
         )
       ) WHERE id = $1 RETURNING id`,
      [userId, JSON.stringify(variables), MAX_RECENT_VARIABLES],
    );
    if (result.rows.length === 0) {
      throw new Error(`User ${userId} not found`);
    }
  }
}
