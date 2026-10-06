// apps/api/src/queue/script-generation.processor.ts
//
// ScriptGenerationProcessor — BullMQ worker that turns a dynamic-script
// session's extracted variables into a finalized, validated, persisted
// playable script.
//
// Lifecycle (mirrors dynamic_script_generations.status enum):
//   pending      → (job picked up by this worker)
//   generating   → scriptGenerator.generateScript(variables, locale)
//   validating   → validationOrchestrator.validate(script, variables)
//   revising     → if shouldRevise(): scriptGenerator.generateScript(.., issues)
//                  (one revision pass only; revision failure does NOT fail
//                  the whole job — we keep the original script)
//   saving      → atomically insert dynamic_scripts and mark generation ready
//   ready       → best-effort evidence flush after commit
//   failed       → ScriptBlockedException (fail-closed agent crashed) or any
//                  unrecoverable internal error
//
// Workers run outside HTTP requests. runWithToken(userId) retains the legacy
// worker context, but userId is not a login token and does not satisfy RLS
// for a non-owner DB role. Until a dedicated worker role is configured,
// every worker query must also scope by the job's user and session IDs.
//
// CRITICAL review-fix #2: revise() MUST include aggregated_issues_for_revision
// in the system prompt fed back to M3 so the model knows what to fix.
// Implementation: ScriptGeneratorService.generateScript accepts an optional
// `revisionIssues` array which is appended to the system prompt (not the
// user prompt) so M3 treats the issues as hard constraints.

import { Injectable, Logger } from '@nestjs/common';
import { Database } from '../common/database.js';
import { DynamicScriptFunnelConfig } from '../common/minimax/dynamic-script-funnel.config.js';
import {
  ScriptGeneratorService,
  type RevisionIssue,
} from '../modules/assessment/services/micro-sandbox/script-generator.service.js';
import {
  ValidationOrchestrator,
  ScriptBlockedException,
} from '../modules/assessment/services/micro-sandbox/validation/orchestrator.js';
import type { ValidationReport } from '../modules/assessment/services/micro-sandbox/validation/failure-policy.js';
import { EvidenceBridgeService } from '../modules/assessment/services/micro-sandbox/evidence-bridge.service.js';
import { EvidenceService } from '../modules/evidence/evidence.service.js';
import { ContentSafetyAgent } from '../modules/assessment/services/micro-sandbox/validation/content-safety.agent.js';
import { MeasurementAlignmentAgent } from '../modules/assessment/services/micro-sandbox/validation/measurement-alignment.agent.js';
import { LogicConsistencyAgent } from '../modules/assessment/services/micro-sandbox/validation/logic-consistency.agent.js';
import { PersonalizationAgent } from '../modules/assessment/services/micro-sandbox/validation/personalization.agent.js';
import type { GeneratedScript } from '../modules/assessment/dto/dynamic-script/shared/generated-script.dto.js';
import type { ExtractedVariables } from '../modules/assessment/dto/dynamic-script/shared/extracted-variables.dto.js';

/**
 * BullMQ job payload. The orchestrating DynamicScriptService queues this
 * in `complete()` and the worker picks it up here.
 *
 * Renamed-to-ScriptGenerationJob to differentiate from the BullMQ Job
 * wrapper BullMQ provides (which carries id, attemptsMade, etc.).
 */
export interface ScriptGenerationJob {
  generationId: string;
  sessionId: string;
  userId: string;
}

/**
 * Per-status user-facing copy. Stored on the generation row's
 * current_step column so the polling UI can render a localized label
 * without re-implementing the lifecycle on the client.
 */
const STATUS_COPY: Record<string, { progress: number; step: string }> = {
  generating: { progress: 10, step: '正在生成剧本...' },
  validating: { progress: 50, step: '正在验证剧本质量...' },
  revising:   { progress: 70, step: '正在根据反馈优化剧本...' },
  saving:     { progress: 85, step: '正在保存剧本...' },
};

const PREVIOUS_STATUS: Record<string, string[]> = {
  generating: ['pending'],
  validating: ['generating'],
  revising: ['validating'],
  saving: ['validating', 'revising'],
};

class GenerationNotVisibleError extends Error {}

@Injectable()
export class ScriptGenerationProcessor {
  private readonly logger = new Logger(ScriptGenerationProcessor.name);

  constructor(
    private readonly db: Database,
    private readonly scriptGenerator: ScriptGeneratorService,
    private readonly validationOrchestrator: ValidationOrchestrator,
    private readonly evidenceBridge: EvidenceBridgeService,
  ) {}

  /**
   * Worker-side factory. Wires up the processor's full dependency graph
   * with primitives (pool, env) — no NestJS DI needed. Callers in the
   * BullMQ `worker.ts` use this so the script-generation queue is
   * actually consumed.
   */
  static createForWorker(opts: {
    pool: { query: (...args: any[]) => Promise<any>; connect: () => Promise<any> };
    env?: NodeJS.ProcessEnv;
  }): ScriptGenerationProcessor {
    const env = opts.env ?? process.env;
    const db = new Database(opts.pool as any);
    const funnelConfig = new DynamicScriptFunnelConfig(env);
    const scriptGen = new ScriptGeneratorService(funnelConfig);
    const orchestrator = new ValidationOrchestrator(
      funnelConfig,
      new ContentSafetyAgent(funnelConfig),
      new MeasurementAlignmentAgent(funnelConfig),
      new LogicConsistencyAgent(funnelConfig),
      new PersonalizationAgent(funnelConfig),
    );

    const evidenceBridge = new EvidenceBridgeService(db, new EvidenceService(db), {
      flushThreshold: parseInt(env.DYNAMIC_SCRIPT_EVIDENCE_FLUSH_THRESHOLD ?? '3', 10),
    });

    return new ScriptGenerationProcessor(db, scriptGen, orchestrator, evidenceBridge);
  }

  /**
   * Top-level entrypoint called by the BullMQ Worker registered in
   * worker.ts. The legacy runWithToken(userId) context is retained for
   * existing worker database access, but a UUID is not a session token:
   * non-owner RLS roles cannot use it to read these rows. Deployment must
   * verify the worker role separately. Errors are converted into a failed
   * status when the row remains writable.
   */
  async process(job: ScriptGenerationJob): Promise<void> {
    await this.db.runWithToken(job.userId, () => this.processImpl(job));
  }

  private async processImpl(job: ScriptGenerationJob): Promise<void> {
    const { generationId, sessionId, userId } = job;

    try {
      const scope = await this.db.pool.query<{ session_id: string; status: string }>(
        `SELECT session_id, status FROM dynamic_script_generations
         WHERE id = $1 AND user_id = $2`,
        [generationId, userId],
      );
      if (!scope.rows[0]) {
        throw new GenerationNotVisibleError(`generation_not_visible: ${generationId}`);
      }
      if (scope.rows[0].status === 'ready' || scope.rows[0].status === 'failed') return;
      if (scope.rows[0].session_id !== sessionId) {
        await this.db.pool.query(
          `UPDATE dynamic_script_generations
           SET status = $1, progress_percentage = 100, current_step = $2,
               failed_at = NOW(), error = $3::jsonb
           WHERE id = $4 AND user_id = $5 AND session_id = $6
             AND status IN ('pending', 'generating', 'validating', 'revising', 'saving')`,
          ['failed', '任务归属不匹配', JSON.stringify({ error: 'job_scope_mismatch', user_options: ['restart'] }),
            generationId, userId, scope.rows[0].session_id],
        );
        this.logger.warn(`Generation ${generationId} rejected because queued session does not match its owner row`);
        return;
      }

      // 1. Load only the session owned by the queued user after checking the
      //    generation's stored session ID.
      const sessionRows = await this.db.pool.query<{
        extracted_variables: ExtractedVariables | null;
        locale: string | null;
      }>(
        `SELECT extracted_variables, locale
           FROM dynamic_script_sessions
         WHERE id = $1 AND user_id = $2`,
        [sessionId, userId],
      );
      const sessionRow = sessionRows.rows[0];
      if (!sessionRow || !sessionRow.extracted_variables) {
        throw new Error('Session variables missing — user has not completed inquiry');
      }
      const variables: ExtractedVariables = sessionRow.extracted_variables;
      const locale = sessionRow.locale ?? 'zh-CN';

      // 2. Generating — first draft
      if (!await this.updateStatus(job, 'generating')) return;
      let script: GeneratedScript = await this.scriptGenerator.generateScript(variables, locale);

      // 3. Validating — run 4 agents in parallel via the orchestrator.
      //    may throw ScriptBlockedException (caught below) for fail-closed
      //    agent errors; fail-open errors degrade to a synthetic pass.
      if (!await this.updateStatus(job, 'validating')) return;
      const report: ValidationReport = await this.validationOrchestrator.validate(script, variables);

      // 4. Revising — single pass; if M3 fails on the revision we log and
      //    keep the original script (better than failing the whole job).
      let revised = false;
      if (this.validationOrchestrator.shouldRevise(report)) {
        if (!await this.updateStatus(job, 'revising')) return;
        try {
          script = await this.revise(
            script,
            variables,
            report.aggregated_issues_for_revision as RevisionIssue[],
            locale,
          );
          revised = true;
        } catch (revErr) {
          this.logger.warn(
            `Revision failed for generation ${generationId}, keeping original script: ${String(revErr)}`,
          );
        }
      }

      // 5. Saving — insert the final dynamic_scripts row only while this
      //    generation still belongs to the job's session and user.
      if (!await this.updateStatus(job, 'saving')) return;
      const scriptId = await this.saveReady(job, script, variables, report, revised);
      if (!scriptId) return;

      // 6. Evidence — accumulate the played choices (empty path here; the
      //    client will POST the played_path later to actually persist
      //    evidence), and flush if the user has accumulated enough.
      try {
        await this.evidenceBridge.accumulate(userId, scriptId, script.scenes, []);
        await this.evidenceBridge.flushIfReady(userId);
      } catch (evidenceErr) {
        this.logger.warn(`Generation ${generationId} ready but evidence flush failed: ${String(evidenceErr)}`);
      }
      this.logger.log(`Generation ${generationId} ready (scriptId=${scriptId}, revised=${revised})`);
    } catch (err) {
      if (err instanceof GenerationNotVisibleError) {
        this.logger.error(err.message);
        throw err;
      }
      await this.handleError(job, err);
    }
  }

  private async saveReady(
    job: ScriptGenerationJob,
    script: GeneratedScript,
    variables: ExtractedVariables,
    report: ValidationReport,
    revised: boolean,
  ): Promise<string | null> {
    const { generationId, sessionId, userId } = job;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<{ status: string }>(
        `SELECT status FROM dynamic_script_generations
         WHERE id = $1 AND session_id = $2 AND user_id = $3 FOR UPDATE`,
        [generationId, sessionId, userId],
      );
      if (locked.rows[0]?.status !== 'saving') {
        await client.query('ROLLBACK');
        return null;
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO dynamic_scripts
            (session_id, generation_id, user_id, template_id, scenes, variables_used, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [sessionId, generationId, userId, script.template_id, JSON.stringify(script.scenes), JSON.stringify(variables)],
      );
      const scriptId = inserted.rows[0].id;
      await client.query(
        `UPDATE dynamic_script_generations
           SET status = $1, progress_percentage = 100, current_step = '完成',
               ready_at = NOW(), script_id = $2, result = $3, validation_report = $4,
               revised = $5
         WHERE id = $6 AND status = 'saving'`,
        ['ready', scriptId, JSON.stringify({ script_id: scriptId, script, revised }), JSON.stringify(report), revised, generationId],
      );
      await client.query('COMMIT');
      return scriptId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Re-prompt M3 with the aggregated issues appended to the SYSTEM prompt
   * (not the user prompt). This is the load-bearing review fix: without
   * passing issues into the system prompt, M3 has no way to know what to
   * revise and just regenerates a fresh (likely identical-broken) script.
   *
   * Implementation: ScriptGeneratorService.generateScript accepts an
   * optional `revisionIssues` array which triggers the system-prompt
   * augmentation. We pass the orchestrator's aggregated_issues_for_revision
   * directly — no trimming or rewriting — because the validators already
   * produced actionable descriptions with location + suggestion fields.
   *
   * Throws if the underlying generator fails (caught by the caller, who
   * keeps the original script).
   */
  private async revise(
    _previousScript: GeneratedScript,
    variables: ExtractedVariables,
    issues: RevisionIssue[],
    locale: string,
  ): Promise<GeneratedScript> {
    if (!issues || issues.length === 0) {
      // Defensive: caller should not invoke revise() without issues, but
      // fall back to a plain re-generation so we never throw silently.
      this.logger.warn('revise() invoked with empty issues; doing plain regeneration');
      return this.scriptGenerator.generateScript(variables, locale);
    }
    this.logger.log(
      `Revising script with ${issues.length} aggregated issue(s)`,
    );
    return this.scriptGenerator.generateScript(variables, locale, issues);
  }

  /**
   * Failure handler — distinguishes ScriptBlockedException (safe
   * to show the user as "剧本审核未通过") from internal errors so
   * the polling UI can render a meaningful error message.
   *
   * We swallow the original error here (no rethrow) because the
   * BullMQ retry policy is owned by QUEUE_CONFIGS — we just want
   * to mark the generation row with a structured error JSONB so
   * getScriptGenerationStatus() returns it to the client.
   */
  private async handleError(
    job: ScriptGenerationJob,
    err: unknown,
  ): Promise<void> {
    const { generationId, sessionId, userId } = job;
    const isBlocked = err instanceof ScriptBlockedException;
    const message = err instanceof Error ? err.message : String(err);

    try {
      const failed = await this.db.pool.query<{ id: string }>(
        `UPDATE dynamic_script_generations
           SET status = $1,
               progress_percentage = 100,
               current_step = $2,
               failed_at = NOW(),
               error = $3
           WHERE id = $4 AND user_id = $5 AND session_id = $6
             AND status IN ('pending', 'generating', 'validating', 'revising', 'saving')
           RETURNING id`,
        [
          'failed',
          isBlocked ? '安全验证未通过' : '生成失败',
          JSON.stringify({
            error: isBlocked ? 'script_validation_failed' : 'internal_error',
            message: message.slice(0, 500),
            user_options: isBlocked ? ['change_topic'] : ['retry', 'change_topic'],
          }),
          generationId,
          userId,
          sessionId,
        ],
      );
      if (failed.rows.length === 0) {
        this.logger.warn(`Generation ${generationId} failure state not written; terminal state, owner scope or RLS must be checked`);
        return;
      }
    } catch (writeErr) {
      // If even the failure write fails, log loudly so operators know
      // the generation row is stuck in a non-terminal state.
      this.logger.error(
        `Failed to mark generation ${generationId} as failed: ${String(writeErr)} (original error: ${message})`,
      );
      return;
    }

    if (isBlocked) {
      this.logger.warn(`Generation ${generationId} blocked by validator: ${message}`);
    } else {
      this.logger.error(`Generation ${generationId} failed: ${message}`);
    }
  }

  /**
   * Update the generation row's status + progress + user-facing step.
   * Centralises the SQL so all the lifecycle transitions stay consistent.
   * Uses the STATUS_COPY table for the user-facing copy and progression;
   * call sites that don't fit a known phase can pass raw values via
   * `updateStatus(generationId, status, progress, step)`.
   */
  private async updateStatus(
    job: ScriptGenerationJob,
    status: string,
    progressOverride?: number,
    stepOverride?: string,
  ): Promise<boolean> {
    const { generationId, sessionId, userId } = job;
    const copy = STATUS_COPY[status];
    const progress = progressOverride ?? copy?.progress ?? 0;
    const step = stepOverride ?? copy?.step ?? status;

    const updated = await this.db.pool.query<{ id: string }>(
      `UPDATE dynamic_script_generations
         SET status = $1,
             progress_percentage = $2,
             current_step = $3,
             started_at = COALESCE(started_at, NOW())
         WHERE id = $4 AND user_id = $5 AND session_id = $6
           AND status = ANY($7::varchar[])
         RETURNING id`,
      [status, progress, step, generationId, userId, sessionId, PREVIOUS_STATUS[status] ?? []],
    );
    return updated.rows.length > 0;
  }
}
