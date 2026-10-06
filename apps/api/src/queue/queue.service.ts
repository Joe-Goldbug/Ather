// apps/api/src/queue/queue.service.ts
// BullMQ QueueService — Phase 5
// Injectable service for enqueueing async jobs
//
// Set DISABLE_QUEUES=1 to skip BullMQ connections entirely (saves Redis quota
// when you don't need background jobs, e.g. local dev / testing auth only).

import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { getRedis } from './redis.js';
import { QUEUE_NAMES, QUEUE_CONFIGS, type ReportJob, type WeeklyReviewJob, type MemoryAggregateJob, type SnapshotJob } from './queue.js';
import { Database } from '../common/database.js';
import { withUserQueueAdmission } from './queue-admission.js';

const QUEUES_DISABLED = process.env.DISABLE_QUEUES === '1';

export class ReportQueueDisabledError extends ServiceUnavailableException {
  constructor() {
    super('Report queue is disabled');
  }
}

export class QueueDisabledError extends ServiceUnavailableException {
  constructor() {
    super('Background queue is disabled');
  }
}

export type UserQueueCleanupResult = {
  status: 'completed' | 'pending';
  removed: number;
  active: number;
};

@Injectable()
export class QueueService implements OnModuleDestroy {
  private queues = new Map<string, Queue>();

  constructor(private readonly db: Database) {}

  private getQueue(name: string): Queue | null {
    if (QUEUES_DISABLED) {
      console.warn(`[QueueService] Queues disabled (DISABLE_QUEUES=1), skipping job enqueue to ${name}`);
      return null;
    }
    if (!this.queues.has(name)) {
      const config = QUEUE_CONFIGS[name as keyof typeof QUEUE_CONFIGS] ?? { attempts: 1 };
      const queue = new Queue(name, {
        connection: getRedis(),
        defaultJobOptions: config as object,
      });
      this.queues.set(name, queue);
    }
    return this.queues.get(name)!;
  }

  // ── Report generation ──────────────────────────────────────────────
  async enqueueReport(job: ReportJob): Promise<string> {
    const queue = this.getQueue(QUEUE_NAMES.REPORT);
    if (!queue) throw new ReportQueueDisabledError();
    const added = await withUserQueueAdmission(this.db.pool, job.userId, () =>
      queue.add('generate', job, { jobId: job.reportId }));
    return added.id ?? job.reportId;
  }

  // ── Weekly review ─────────────────────────────────────────────────
  async enqueueWeeklyReview(job: WeeklyReviewJob): Promise<string> {
    const queue = this.getQueue(QUEUE_NAMES.WEEKLY_REVIEW);
    const key = `weekly-${job.userId}-${job.weekStart}`;
    if (!queue) return key;
    const added = await withUserQueueAdmission(this.db.pool, job.userId, () =>
      queue.add('generate', job, { jobId: key }));
    return added.id ?? key;
  }

  // ── Memory aggregate ──────────────────────────────────────────────
  async enqueueMemoryAggregate(job: MemoryAggregateJob): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.MEMORY_AGGREGATE);
    if (!queue) return;
    await withUserQueueAdmission(this.db.pool, job.userId, () => queue.add('aggregate', job));
  }

  // ── Personality snapshot ──────────────────────────────────────────
  async enqueueSnapshot(job: SnapshotJob): Promise<void> {
    const queue = this.getQueue(QUEUE_NAMES.SNAPSHOT);
    if (!queue) return;
    await withUserQueueAdmission(this.db.pool, job.userId, () => queue.add('snapshot', job));
  }

  /**
   * Generic add() — used by feature modules that own their own queue names
   * (e.g. dynamic-script registers its own `script-generation` queue in a
   * later task). Returns the job id BullMQ assigned (caller-supplied jobId
   * takes precedence when provided).
   *
   * When DISABLE_QUEUES=1, fail instead of returning a job ID for work
   * that was never enqueued.
   */
  async add(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    opts?: { jobId?: string },
  ): Promise<string> {
    const queue = this.getQueue(queueName);
    if (!queue) throw new QueueDisabledError();
    const userId = payload.userId;
    if (typeof userId !== 'string' || !userId) {
      throw new Error('User-owned queue jobs require userId');
    }
    const added = await withUserQueueAdmission(this.db.pool, userId, () =>
      queue.add(jobName, payload, opts ? { jobId: opts.jobId } : undefined));
    return added.id ?? opts?.jobId ?? `${queueName}:${jobName}`;
  }

  async removeUserJobs(userId: string): Promise<UserQueueCleanupResult> {
    if (QUEUES_DISABLED) throw new QueueDisabledError();

    let removed = 0;
    let active = 0;
    const states = ['wait', 'paused', 'delayed', 'prioritized', 'waiting-children', 'active', 'completed', 'failed'] as const;

    for (const name of Object.values(QUEUE_NAMES)) {
      const queue = this.getQueue(name)!;
      const jobs = await queue.getJobs([...states], 0, -1, true);
      for (const job of jobs) {
        if ((job.data as { userId?: unknown })?.userId !== userId) continue;
        if (await job.getState() === 'active') {
          active += 1;
          continue;
        }
        try {
          await job.remove();
          removed += 1;
        } catch (error) {
          if (await job.getState() === 'active') {
            active += 1;
            continue;
          }
          throw error;
        }
      }
    }

    return { status: active > 0 ? 'pending' : 'completed', removed, active };
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
