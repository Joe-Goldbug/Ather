// apps/api/src/queue/worker.ts
// BullMQ workers — Phase 7
// Run with: bun run apps/api/src/queue/worker.ts
// Requires: .env with DATABASE_URL, REDIS_URL and OPENAI_* (or legacy LLM_*) variables

import 'dotenv/config'; // Add dotenv config to automatically load .env
import http from 'http';
import { Queue, Worker } from 'bullmq';
import {
  QUEUE_NAMES,
  QUEUE_CONFIGS,
  type ReportJob,
  type WeeklyReviewJob,
  type MemoryAggregateJob,
  type SnapshotJob,
  type CredentialAnchorJob,
} from './queue.js';
import {
  ScriptGenerationProcessor,
  type ScriptGenerationJob,
} from './script-generation.processor.js';
import { BaseService } from '../modules/web3/base.service.js';
import { CredentialAnchorProcessor } from '../modules/web3/credential-anchor.processor.js';
import { getRedis } from './redis.js';
import { createQueryPool } from '../common/pool.js';
import { resolveLlmRuntimeConfig } from '../common/llm-config.js';
import { resolveLlmChatCompletionsUrl } from '../common/llm-endpoint.js';
import {
  HEAVY_WORKER_TIMING,
  LIGHT_WORKER_TIMING,
} from './worker-timing.js';
import {
  ReportSchema,
  maybeRollBaseline,
  detectYouShifted,
  detectShift,
  NO_CORRECTION_DAYS,
  type ShiftGateInput,
  type YouShifted,
  type Memory,
} from '@eva/core';
import { REPORT_CLAIMS_QUERY, type ReportClaimRow } from './report-claims.js';
import { completeReport, failReport, upsertReport } from './report-persistence.js';
import { recoverStaleReportsOnce } from './report-recovery.js';
import { runAuthorizedWeeklyReview } from './weekly-review-authorization.js';
import { pruneExpiredChatTurns } from './chat-retention.js';
import { assertProductionDataPlaneEnvironment } from '../deploy/data-plane-preflight.js';
import { registerOutboxHandler, startOutboxPolling } from './outbox-poller.js';
import { createCorrectionWithdrawalHandler } from './correction-withdrawal-handler.js';

if (process.env.NODE_ENV === 'production') {
  assertProductionDataPlaneEnvironment('worker', process.env);
}

// ── Shared DB pool ──────────────────────────────────────────────────────────
const pool = createQueryPool(process.env.DATABASE_URL ?? '');

async function hasConsent(userId: string, consentType: string): Promise<boolean> {
  const result = await pool.query<{ granted: boolean }>(
    `SELECT granted FROM consent_grants WHERE user_id = $1 AND consent_type = $2`,
    [userId, consentType],
  );
  return result.rows[0]?.granted === true;
}

// ── You Shifted feature flag ────────────────────────────────────────────────
// Gate shift detection behind an explicit env opt-in so enabling real RCI does
// not flood production with backfilled events on day one. The user-facing
// "check for changes" action bypasses this via SnapshotJob.immediate.
const SHIFT_DETECTION_ENABLED = process.env.EVA_SHIFT_DETECTION_ENABLED === 'true';
console.log(`[EVA Worker] You Shifted detection: ${SHIFT_DETECTION_ENABLED ? 'ENABLED' : 'disabled (set EVA_SHIFT_DETECTION_ENABLED=true)'}`);

// ── Shared LLM caller (OpenAI-compatible) ───────────────────────────────────
// 超时保护：此前是裸 fetch、无任何超时。LLM 无响应会永久占住 worker 的
// concurrency 槽位——BullMQ 的 lockDuration 只影响锁与 requeue，不会中断
// 进行中的请求，因此 worker 会静默挂死且不报错。
const LLM_TIMEOUT_MS = Number(process.env.EVA_LLM_TIMEOUT_MS ?? 60_000);

async function callLLM(params: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
}): Promise<string> {
  const { baseUrl, explicitPath, apiKey, model } = resolveLlmRuntimeConfig();

  if (!apiKey) throw new Error('LLM_API_KEY/OPENAI_API_KEY not set in environment');

  const url = resolveLlmChatCompletionsUrl(baseUrl, explicitPath);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: params.system }, ...params.messages],
      max_tokens: params.max_tokens ?? 1024,
      temperature: params.temperature ?? 0.4,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}

// ── Report Generation Worker ────────────────────────────────────────────────
const redis = getRedis();

const reportWorker = new Worker<ReportJob>(
  QUEUE_NAMES.REPORT,
  async (job) => {
    const { reportId, conversationId, userId } = job.data;
    const locale = (job.data.locale ?? 'zh-CN') as 'zh-CN' | 'en' | 'ja' | 'es';
    console.log(`[reportWorker] Starting report ${reportId} for conversation ${conversationId} (locale=${locale})`);

    const pendingReport = await upsertReport(pool, reportId, conversationId, userId);
    if (pendingReport.status === 'completed') {
      return { reportId: pendingReport.id, status: 'completed' };
    }
    const persistedReportId = pendingReport.id;
    if (!await hasConsent(userId, 'report_generation') || !await hasConsent(userId, 'report_storage')) {
      await failReport(pool, persistedReportId, userId, 'report_generation_not_authorized');
      return { reportId, status: 'skipped', reason: 'report_generation_not_authorized' };
    }

    // Only current claims with complete formal support enter this legacy report.
    const claimRows = await pool.query<ReportClaimRow>(
      REPORT_CLAIMS_QUERY,
      [userId],
    );
    const parsed = ReportSchema.parse({
      evidenceHighlights: claimRows.rows.map((claim) => ({
        claimId: claim.claim_id,
        revisionId: claim.revision_id,
        text: `已关联的记录中：${claim.claim_text}。这只描述该情境。`,
        evidenceIds: claim.evidence_ids,
        counterevidenceIds: claim.counterevidence_ids,
        limitations: claim.limitations ?? ['仅覆盖已关联的有限情境。'],
      })),
      limitations: claimRows.rows.length
        ? ['这些观察只覆盖已有记录，不代表固定人格。']
        : ['目前没有可用的已关联观察，无法形成新的总结。'],
      summary: claimRows.rows.length
        ? '以下内容只描述已关联记录中的有限情境，不代表固定结论。'
        : '目前没有可用的已关联观察，无法形成新的总结。',
    });

    // Consent is rechecked after preparation, before writing a derived report.
    if (!await hasConsent(userId, 'report_generation') || !await hasConsent(userId, 'report_storage')) {
      await failReport(pool, persistedReportId, userId, 'report_permission_revoked');
      return { reportId, status: 'skipped', reason: 'report_permission_revoked' };
    }
    const completion = await completeReport(pool, persistedReportId, userId, parsed, claimRows.rows);
    if (completion !== 'completed') {
      const reason = completion === 'sources_changed' ? 'report_sources_changed'
        : completion === 'permission_revoked' ? 'report_permission_revoked'
        : 'report_not_pending';
      await failReport(pool, persistedReportId, userId, reason);
      return { reportId, status: 'skipped', reason };
    }
    console.log(`[reportWorker] ✓ Report ${reportId} completed`);
    return { reportId: persistedReportId, status: 'completed' };
  },
  {
    connection: redis,
    concurrency: 3,
    ...HEAVY_WORKER_TIMING,
  },
);

reportWorker.on('completed', (job) => {
  console.log(`[reportWorker] ✓ ${job.id} completed`);
});
reportWorker.on('failed', async (job, err) => {
  console.error(`[reportWorker] ✗ ${job?.id} failed:`, err.message);
  if (job?.finishedOn) {
    await failReport(pool, job.data.reportId, job.data.userId, err.message);
  }
});

// ── Weekly Review Worker ────────────────────────────────────────────────────
const weeklyWorker = new Worker<WeeklyReviewJob>(
  QUEUE_NAMES.WEEKLY_REVIEW,
  async (job) => {
    const { userId, weekStart, weekEnd } = job.data;
    console.log(`[weeklyWorker] Generating weekly review for ${userId} (${weekStart} – ${weekEnd})`);

    if (!await hasConsent(userId, 'weekly_review_analysis')) {
      return { status: 'skipped', reason: 'weekly_review_not_authorized' };
    }

    // Only records explicitly selected for this purpose may enter the prompt.
    const captureRows = await pool.query(
      `SELECT id, COALESCE(local_date::text, captured_at::date::text) AS entry_date,
              entry_type,
              process_mode,
              raw_text,
              mood_label,
              mood_intensity
       FROM captures
       WHERE user_id = $1
         AND process_mode <> 'save_only'
         AND allow_weekly_review = true
         AND COALESCE(local_date, captured_at::date) BETWEEN $2::date AND $3::date
       ORDER BY COALESCE(local_date, captured_at::date), captured_at`,
      [userId, weekStart, weekEnd],
    );

    if (!captureRows.rows.length) {
      return { status: 'skipped', reason: 'no_authorized_entries' };
    }

    const weeklyRecordText = captureRows.rows
      .map(
        (row) =>
          `${row.entry_date} [capture:${row.entry_type}/${row.process_mode}] [${row.mood_label ?? ''} ${row.mood_intensity ?? 0}]｜${row.raw_text ?? ''}`,
      )
      .filter((line) => line.trim().length > 0)
      .join('\n');

    // 2. Build weekly review prompt
    const systemPrompt = `你是 Eva，帮助用户回看这一周真实记录的心智镜子。每周回顾请：
1. 先说用户在什么记录里做了什么、感受了什么，再说可回看的共同点
2. 只描述本周记录；没有上周可比输入，不判断变化趋势，也不把次数写成固定性格
3. 不补写用户没有记录的情绪、动机、他人反应或后果
4. 语言直接、具体，不鸡汤；锋芒只能针对记录中可看见的做法
5. 结尾只留一个可跳过的回看问题，不替用户下结论`;

    const userPrompt = `这是本周用户允许用于周回看的记录（格式是 日期｜来源｜情绪+强度｜内容）：

${weeklyRecordText}

请生成一份个性化周回顾，格式如下：
## 这一周的你
## 你反复遇到的情境
## 值得你自己回看的地方
## 一个可选问题`;

    const selectedIds = captureRows.rows.map((row) => row.id);
    const generated = await runAuthorizedWeeklyReview(pool, userId, selectedIds, () => callLLM({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 600,
      temperature: 0.4,
    }));
    if (generated.status === 'skipped') return generated;
    const narrative = generated.narrative;

    // 3. Detect dominant mood
    const moodCounts: Record<string, number> = {};
    for (const row of captureRows.rows) {
      if (!row.mood_label) continue;
      moodCounts[row.mood_label] = (moodCounts[row.mood_label] ?? 0) + 1;
    }
    const dominantEmotion = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // 4. Hold the consent and selected capture rows through the final write.
    const id = crypto.randomUUID();
    let persistedReviewId: string = id;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const grant = await client.query(
        `SELECT 1 FROM consent_grants
         WHERE user_id = $1 AND consent_type = 'weekly_review_analysis' AND granted = true
         FOR SHARE`,
        [userId],
      );
      const captures = await client.query(
        `SELECT id FROM captures
         WHERE user_id = $1 AND id = ANY($2::uuid[])
           AND process_mode <> 'save_only' AND allow_weekly_review = true
         ORDER BY id FOR SHARE`,
        [userId, selectedIds],
      );
      if (grant.rows.length !== 1 || captures.rows.length !== selectedIds.length) {
        await client.query('ROLLBACK');
        return { status: 'skipped', reason: 'weekly_review_permission_revoked' };
      }
      const saved = await client.query<{ id: string }>(
      `INSERT INTO weekly_reviews (id, user_id, week_start, week_end, summary, eva_message, dominant_emotion, mood_trend, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NOW())
       ON CONFLICT (user_id, week_start) DO UPDATE SET
         summary = EXCLUDED.summary,
         eva_message = EXCLUDED.eva_message,
         dominant_emotion = EXCLUDED.dominant_emotion,
         mood_trend = EXCLUDED.mood_trend,
         updated_at = NOW()
       RETURNING id`,
        [id, userId, weekStart, weekEnd, narrative, narrative, dominantEmotion],
      );
      persistedReviewId = saved.rows[0].id;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    console.log(`[weeklyWorker] ✓ Weekly review for ${userId} saved`);
    return { weeklyReviewId: persistedReviewId, status: 'completed' };
  },
  {
    connection: redis,
    concurrency: 2,
    ...HEAVY_WORKER_TIMING,
  },
);

// ── Script Generation Worker ──────────────────────────────────────────────
// Async pipeline: turns a dynamic-script session's extracted variables into
// a finalized, validated, persisted playable script. Without this worker,
// /complete enqueues jobs that never run and status stays 'pending' forever.
const scriptGenProcessor = ScriptGenerationProcessor.createForWorker({
  pool: pool as any, // pool exposes the same QueryPool surface the processor needs
});
const scriptGenerationWorker = new Worker<ScriptGenerationJob>(
  QUEUE_NAMES.SCRIPT_GENERATION,
  async (job) => {
    console.log(`[scriptGenerationWorker] processing generation=${job.data.generationId} session=${job.data.sessionId}`);
    await scriptGenProcessor.process(job.data);
  },
  {
    connection: redis,
    concurrency: 2,
    ...HEAVY_WORKER_TIMING,
  },
);
scriptGenerationWorker.on('completed', (job) => {
  console.log(`[scriptGenerationWorker] ✓ ${job.id} completed`);
});
scriptGenerationWorker.on('failed', (job, err) => {
  console.error(`[scriptGenerationWorker] ✗ ${job?.id} failed:`, err.message);
});

weeklyWorker.on('completed', (job) => {
  console.log(`[weeklyWorker] ✓ ${job.id} completed`);
});
weeklyWorker.on('failed', (job, err) => {
  console.error(`[weeklyWorker] ✗ ${job?.id} failed:`, err.message);
});

// ── Legacy memory aggregate worker ───────────────────────────────────────────
// UBV is no longer a formal portrait base. Keep the queue consumer alive for
// compatibility, but it must not write new snapshots from unapproved evidence.
const memoryWorker = new Worker<MemoryAggregateJob>(
  QUEUE_NAMES.MEMORY_AGGREGATE,
  async (job) => {
    const { userId } = job.data;
    console.log(`[memoryWorker] Skipping retired UBV aggregation for ${userId}`);
    return { status: 'disabled', reason: 'legacy_ubv_aggregation_retired' };
  },
  {
    connection: redis,
    concurrency: 5,
    ...LIGHT_WORKER_TIMING,
  },
);

memoryWorker.on('failed', (job, err) => {
  console.error(`[memoryWorker] ✗ ${job?.id} failed:`, err.message);
});

// ── You Shifted helpers (P0 fix) ─────────────────────────────────────────────

/** Dimensions the user corrected within the last `days` days (excluded from shift). */
async function getRecentCorrectedDimensions(userId: string, days: number): Promise<string[]> {
  const result = await pool.query<{ dimension: string }>(
    `SELECT DISTINCT dimension FROM user_corrections
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${days} days'`,
    [userId],
  );
  return result.rows.map((r) => r.dimension).filter((d): d is string => Boolean(d));
}

/** Recent user-turn messages for a conversation (feeds before/after quotes). */
async function getConversationUserMessages(
  conversationId: string | undefined,
  limit = 20,
): Promise<Array<{ content: string }>> {
  if (!conversationId) return [];
  const result = await pool.query<{ turns: Array<{ role: string; content: string }> }>(
    'SELECT turns FROM conversations WHERE id = $1 LIMIT 1',
    [conversationId],
  );
  const turns = (result.rows[0]?.turns ?? []).filter(
    (t) => t.role === 'user' && typeof t.content === 'string',
  );
  return turns.slice(-limit).map((t) => ({ content: t.content }));
}

/** Gate 1: a comparable parallel test item exists (>= 2 formal/calibration evidence). */
async function hasParallelTestItem(userId: string, dimension: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM evidence_events
     WHERE user_id = $1 AND dimension = $2
       AND evidence_kind IN ('formal', 'calibration') AND candidate = false`,
    [userId, dimension],
  );
  return Number(result.rows[0]?.count ?? 0) >= 2;
}

/** Gate 3: recent evidence events (last 30 days) for the dimension. */
async function getRecentEvidenceCount(userId: string, dimension: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM evidence_events
     WHERE user_id = $1 AND dimension = $2
       AND candidate = false AND created_at > NOW() - INTERVAL '30 days'`,
    [userId, dimension],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Gate 4: days since last correction (null = never corrected). */
async function getDaysSinceLastCorrection(userId: string, dimension: string): Promise<number | null> {
  const result = await pool.query<{ days: string }>(
    `SELECT EXTRACT(DAY FROM NOW() - MAX(created_at))::text AS days
     FROM user_corrections WHERE user_id = $1 AND dimension = $2`,
    [userId, dimension],
  );
  const days = result.rows[0]?.days;
  if (days === null || days === undefined) return null;
  const parsed = Number(days);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Run the five-gate safety wrapper on a detectYouShifted candidate and persist
 * to shift_events only if ALL five gates pass.
 */
async function runShiftGateAndPersist(
  userId: string,
  memory: Memory,
  youShifted: YouShifted,
  conversationId: string | undefined,
): Promise<void> {
  const dimension = youShifted.dimension;
  const rci = youShifted.RCI.RCI;
  const dimBelief = (memory.ubv as unknown as Record<string, { confidence?: number }> | null)?.[dimension];

  const [hasParallel, recentEvidenceCount, daysSinceLastCorrection] = await Promise.all([
    hasParallelTestItem(userId, dimension),
    getRecentEvidenceCount(userId, dimension),
    getDaysSinceLastCorrection(userId, dimension),
  ]);

  const gateInput: ShiftGateInput = {
    dimension,
    hasParallelItem: hasParallel,
    confidence: dimBelief?.confidence ?? 0,
    recentEvidenceCount,
    daysSinceLastCorrection,
    rci,
  };

  const result = detectShift(gateInput);
  if (!result.shifted) {
    console.log(`[snapshotWorker] shift candidate ${userId}/${dimension} gated out:`, result.gates);
    return;
  }

  const direction = rci > 0 ? 'positive' : 'negative';
  const eventId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO shift_events
       (id, user_id, dimension, rci_value, rci_current, rci_baseline,
        magnitude, comparison_type, direction, sources, narrative, before_quote, after_quote, acknowledged, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14)`,
    [
      eventId,
      userId,
      dimension,
      rci,
      youShifted.RCI.current,
      youShifted.RCI.baseline,
      youShifted.magnitude,
      youShifted.comparison_type,
      direction,
      JSON.stringify(youShifted.evidence_sources ?? []),
      youShifted.narrative_insight,
      youShifted.before_quote ?? null,
      youShifted.after_quote ?? null,
      JSON.stringify({ gates: result.gates }),
    ],
  );
  console.log(`[snapshotWorker] ✓ shift event ${eventId} (${dimension}, ${youShifted.magnitude}) conv=${conversationId ?? 'n/a'}`);
}

// ── Snapshot Worker ──────────────────────────────────────────────────────────
const snapshotWorker = new Worker<SnapshotJob>(
  QUEUE_NAMES.SNAPSHOT,
  async (job) => {
    const { userId, sourceType, sourceId, conversationId, locale = 'zh-CN', immediate = false } = job.data;
    console.log(`[snapshotWorker] Snapshot for ${userId} from ${sourceType}`);

    // Load current memory_state —— 读-改-写必须包在事务 + FOR UPDATE 内。
    // 此前是无锁的 SELECT → UPDATE：1-1 接通 enqueueSnapshot 后，snapshot 与
    // assessment 会并发写同一行，后写覆盖先写导致 memory_state 丢更新
    // （接通前 snapshot worker 从不执行，这段代码从未真正并发过，风险由 0 变为实际存在）。
    const client = await pool.connect();
    let memory!: Memory;
    try {
      await client.query('BEGIN');
      const rows = await client.query<{ memory_state: string }>(
        'SELECT memory_state FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!rows.rows[0]?.memory_state) {
        await client.query('ROLLBACK');
        console.warn(`[snapshotWorker] No memory_state for ${userId}`);
        return { status: 'skipped' };
      }

      const rawMem = rows.rows[0].memory_state;
      memory = (typeof rawMem === 'string' ? JSON.parse(rawMem) : rawMem) as Memory;

      // Task 3: roll the 30-day rolling baseline if due — feeds detectYouShifted "recent" branch.
      const rolled = maybeRollBaseline(memory);
      if (rolled !== memory) {
        await client.query(
          'UPDATE users SET memory_state = $1::jsonb, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(rolled), userId],
        );
        console.log(`[snapshotWorker] ✓ rolled baseline for ${userId}`);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const ubv = memory.ubv ?? {};
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO personality_snapshots (id, user_id, source_type, source_id, conversation_id, ubv_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, sourceType, sourceId ?? null, conversationId ?? null, JSON.stringify(ubv)],
    );
    console.log(`[snapshotWorker] ✓ Snapshot ${id}`);

    // Task 2: detect You Shifted (core) + five-gate (API), persist to shift_events.
    const runDetection = SHIFT_DETECTION_ENABLED || immediate;
    if (runDetection && memory.ubv && memory.baseline_ubv) {
      try {
        const recentCorrections = await getRecentCorrectedDimensions(userId, NO_CORRECTION_DAYS);
        const recentMessages = await getConversationUserMessages(conversationId);
        const youShifted = detectYouShifted(
          memory.ubv,
          memory.baseline_ubv,
          locale,
          recentCorrections,
          recentMessages,
          memory.rolling_baseline_ubv,
        );
        if (youShifted) {
          await runShiftGateAndPersist(userId, memory, youShifted, conversationId);
        }
      } catch (err) {
        console.error(`[snapshotWorker] shift detection failed for ${userId}:`, err);
      }
    }

    return { snapshotId: id };
  },
  {
    connection: redis,
    concurrency: 5,
    ...LIGHT_WORKER_TIMING,
  },
);

snapshotWorker.on('failed', (job, err) => {
  console.error(`[snapshotWorker] ✗ ${job?.id} failed:`, err.message);
});

// ── Credential anchor on Base Sepolia (Phase 6) ───────────────────────────
const baseServiceForWorker = new BaseService();
const anchorProcessor = new CredentialAnchorProcessor({ pool } as any, baseServiceForWorker);

const anchorWorker = new Worker<CredentialAnchorJob>(
  QUEUE_NAMES.CREDENTIAL_ANCHOR,
  async (job) => {
    console.log(`[anchorWorker] Processing anchor job for credential ${job.data.credentialId}`);
    return await anchorProcessor.processAnchorJob(job.data);
  },
  {
    connection: redis,
    concurrency: 5,
    ...LIGHT_WORKER_TIMING,
  },
);

anchorWorker.on('failed', (job, err) => {
  console.error(`[anchorWorker] ✗ ${job?.id} failed:`, err.message);
});

// ── Outbox poller（1-4）────────────────────────────────────────────────────
// Unhandled portrait events remain pending until a governed handler is registered.
// EVA_OUTBOX_POLL_INTERVAL_MS adjusts the interval (default 10s).
const OUTBOX_POLL_INTERVAL_MS = Number(process.env.EVA_OUTBOX_POLL_INTERVAL_MS ?? 10_000);
registerOutboxHandler('correction.withdraw_processed', createCorrectionWithdrawalHandler(pool));
startOutboxPolling(pool, OUTBOX_POLL_INTERVAL_MS);
console.log(`[EVA Worker] Outbox polling every ${OUTBOX_POLL_INTERVAL_MS}ms (unhandled events remain pending)`);

const reportRecoveryQueue = new Queue<ReportJob>(QUEUE_NAMES.REPORT, {
  connection: redis,
  defaultJobOptions: QUEUE_CONFIGS[QUEUE_NAMES.REPORT],
});
let reportRecoveryRunning = false;
const reportRecoveryTimer = setInterval(() => {
  if (reportRecoveryRunning) return;
  reportRecoveryRunning = true;
  recoverStaleReportsOnce(pool, reportRecoveryQueue).catch((error: unknown) => {
    console.error('[reportRecovery] poll failed:', error);
  }).finally(() => {
    reportRecoveryRunning = false;
  });
}, 30_000);

const CHAT_RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000;
let chatRetentionRunning = false;
const runChatRetention = () => {
  if (chatRetentionRunning) return;
  chatRetentionRunning = true;
  pruneExpiredChatTurns(pool).then((result) => {
    if (result.conversations || result.memories) {
      console.log('[chatRetention] pruned expired raw turns:', result);
    }
  }).catch((error: unknown) => {
    console.error('[chatRetention] prune failed:', error);
  }).finally(() => {
    chatRetentionRunning = false;
  });
};
runChatRetention();
const chatRetentionTimer = setInterval(runChatRetention, CHAT_RETENTION_INTERVAL_MS);

console.log('[EVA Worker] BullMQ workers started');
console.log('[EVA Worker] Queues:', Object.values(QUEUE_NAMES).join(', '));

// Health server — Railway / Fly / Render route external traffic via $PORT.
// A pure background worker without an HTTP listener fails healthcheck and
// gets reported as 502/Crashed. Open a minimal /health endpoint when PORT
// is provided; skip when running locally without one.
const healthPort = process.env.PORT ? Number(process.env.PORT) : null;
let healthServer: http.Server | null = null;
if (healthPort && Number.isFinite(healthPort)) {
  healthServer = http
    .createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            role: 'worker',
            queues: Object.values(QUEUE_NAMES),
            ts: Date.now(),
          }),
        );
        return;
      }
      res.writeHead(404).end();
    })
    .listen(healthPort, '0.0.0.0', () => {
      console.log(`[EVA Worker] Health server on http://0.0.0.0:${healthPort}/health`);
    });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[EVA Worker] Shutting down...');
  clearInterval(reportRecoveryTimer);
  clearInterval(chatRetentionTimer);
  await reportRecoveryQueue.close();
  await Promise.all([
    reportWorker.close(),
    weeklyWorker.close(),
    memoryWorker.close(),
    snapshotWorker.close(),
    scriptGenerationWorker.close(),
    anchorWorker.close(),
    redis.quit(),
    pool.end(),
    new Promise<void>((resolve) => {
      if (healthServer) healthServer.close(() => resolve());
      else resolve();
    }),
  ]);
  process.exit(0);
});
