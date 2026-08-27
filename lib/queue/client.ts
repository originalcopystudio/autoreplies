/**
 * Postgres-backed job queue (serverless port).
 *
 * Replaces the BullMQ/Redis queue with a `QueueJob` table so the whole app can
 * run on Netlify Functions + Supabase with no always-on worker. The public
 * surface intentionally mirrors the old BullMQ facade — `getDMQueue().add()`
 * with `{ jobId, delay }` — so the webhook route, the polling reconciler and
 * the diagnostics endpoints keep working with minimal changes.
 *
 * Execution model:
 *  - Immediate jobs are enqueued by the webhook and then drained inline in the
 *    same invocation (see lib/queue/drain.ts), so a comment still gets its DM
 *    within ~a second.
 *  - Delayed jobs (read fallback, follow-ups, rate-limit requeues) sit in the
 *    table with a future `runAt` and are drained by the scheduled
 *    /api/cron/process-queue function every few minutes.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED` so a webhook drain and a cron drain
 * running concurrently can never double-send the same job.
 */

import { prisma } from "@/lib/db/client";
import type { QueueJob } from "@/app/generated/prisma/client";

// ─── Job payload types (unchanged from the BullMQ version) ─────────────────────

export type CommentSource = "WEBHOOK" | "POLLING";

export interface ProcessCommentJob {
  instagramAccountId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  mediaId: string;
  // Set when the comment came from an ad: the organic post the ad was made
  // from. Campaigns are bound to that post, so both ids have to be matched.
  originalMediaId?: string;
  requeueAttempt?: number;
  // Which path enqueued this comment. Recorded in the shared ProcessedComment
  // dedup store so the reconciler can tell webhook- from polling-caught comments.
  source?: CommentSource;
}

// Delivered when a user taps an opening DM's button — carries the reveal target.
export interface ProcessPostbackJob {
  instagramAccountId: string;
  userId: string;
  payload: string;
  mid?: string;
  fallback?: boolean;
}

// Scheduled after the link is delivered, to send the appreciation follow-up.
// Enqueued with a delay (followUpDelayMinutes) so it can fire later, not just
// immediately.
export interface ProcessFollowUpJob {
  instagramAccountId: string;
  userId: string;
  automationId: string;
  commenterName?: string | null;
}

// An inbound DM from a user. Campaigns with `dmTriggerEnabled` whose keywords
// match the text reply to the sender.
export interface ProcessMessageJob {
  instagramAccountId: string;
  messageId: string;
  messageText: string;
  senderId: string;
}

export type DmQueueJob =
  | ProcessCommentJob
  | ProcessPostbackJob
  | ProcessFollowUpJob
  | ProcessMessageJob;

export const POSTBACK_JOB_NAME = "process-postback";
export const FOLLOWUP_JOB_NAME = "process-followup";
export const MESSAGE_JOB_NAME = "process-message";
export const COMMENT_JOB_NAME = "process-comment";

// Retry backoff for failed jobs (was BullMQ's custom backoffStrategy).
export const MAX_JOB_ATTEMPTS = 3;
export const BACKOFF_DELAYS = [5 * 60 * 1000, 15 * 60 * 1000, 45 * 60 * 1000];

// A FAILED row older than this may be re-enqueued under the same jobId (parity
// with BullMQ's removeOnFail age of 300s, which let the reconciler retry a
// comment once a transient failure had passed).
const FAILED_REENQUEUE_AGE_MS = 5 * 60 * 1000;

// A RUNNING row older than this is considered abandoned (its serverless
// invocation died mid-job) and may be reclaimed.
const STUCK_RUNNING_AGE_MS = 10 * 60 * 1000;

// ─── The worker-facing job shape (replaces bullmq's Job) ───────────────────────

export interface JobLike<T = DmQueueJob> {
  id: string;
  name: string;
  data: T;
  attemptsMade: number;
}

export function toJobLike(row: QueueJob): JobLike {
  return {
    id: row.jobId,
    name: row.name,
    data: row.payload as unknown as DmQueueJob,
    attemptsMade: row.attempts,
  };
}

// ─── Enqueue ───────────────────────────────────────────────────────────────────

export interface AddJobOptions {
  jobId?: string;
  delay?: number; // ms
}

async function addJob(
  name: string,
  data: DmQueueJob,
  opts: AddJobOptions = {}
): Promise<void> {
  const jobId =
    opts.jobId ?? `${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const runAt = new Date(Date.now() + Math.max(0, opts.delay ?? 0));

  const existing = await prisma.queueJob.findUnique({ where: { jobId } });
  if (existing) {
    // Parity with BullMQ jobId dedup: PENDING/RUNNING/SUCCEEDED block re-adds;
    // a FAILED job may be retried once it has aged past the retention window.
    const failedLongAgo =
      existing.status === "FAILED" &&
      Date.now() - existing.updatedAt.getTime() > FAILED_REENQUEUE_AGE_MS;
    if (!failedLongAgo) return;

    await prisma.queueJob.update({
      where: { jobId },
      data: {
        status: "PENDING",
        runAt,
        attempts: 0,
        lastError: null,
        payload: data as object,
      },
    });
    return;
  }

  await prisma.queueJob
    .create({
      data: { jobId, name, payload: data as object, runAt },
    })
    .catch((error: unknown) => {
      // Unique-violation race with a concurrent enqueue of the same jobId —
      // the other writer won; dedup semantics say we simply drop ours.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return;
      }
      throw error;
    });
}

// ─── Claim & finish (used by lib/queue/drain.ts) ───────────────────────────────

/**
 * Atomically claim up to `limit` due jobs (PENDING with runAt <= now, plus
 * RUNNING rows abandoned by a dead invocation). SKIP LOCKED keeps concurrent
 * drains from claiming the same row.
 */
export async function claimDueJobs(limit: number): Promise<QueueJob[]> {
  const stuckBefore = new Date(Date.now() - STUCK_RUNNING_AGE_MS);
  return prisma.$queryRaw<QueueJob[]>`
    UPDATE "QueueJob" SET "status" = 'RUNNING', "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "QueueJob"
      WHERE ("status" = 'PENDING' AND "runAt" <= now())
         OR ("status" = 'RUNNING' AND "updatedAt" < ${stuckBefore})
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
}

export async function markJobSucceeded(id: string): Promise<void> {
  await prisma.queueJob.update({
    where: { id },
    data: { status: "SUCCEEDED", lastError: null },
  });
}

/**
 * Record a failure: reschedule with backoff while attempts remain (BullMQ's
 * 3-attempt custom backoff), otherwise park the row as FAILED.
 */
export async function markJobFailed(
  row: QueueJob,
  error: string
): Promise<{ willRetry: boolean }> {
  const attempts = row.attempts + 1;
  if (attempts < MAX_JOB_ATTEMPTS) {
    const delay = BACKOFF_DELAYS[Math.min(attempts - 1, BACKOFF_DELAYS.length - 1)];
    await prisma.queueJob.update({
      where: { id: row.id },
      data: {
        status: "PENDING",
        attempts,
        lastError: error,
        runAt: new Date(Date.now() + delay),
      },
    });
    return { willRetry: true };
  }
  await prisma.queueJob.update({
    where: { id: row.id },
    data: { status: "FAILED", attempts, lastError: error },
  });
  return { willRetry: false };
}

/** Delete old finished rows so the table stays small. */
export async function pruneFinishedJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.queueJob.deleteMany({
    where: {
      status: { in: ["SUCCEEDED", "FAILED"] },
      updatedAt: { lt: cutoff },
    },
  });
  return result.count;
}

// ─── BullMQ-compatible facade ──────────────────────────────────────────────────

export type JobCountName = "waiting" | "active" | "delayed" | "failed";

export interface DMQueueFacade {
  add(name: string, data: DmQueueJob, opts?: AddJobOptions): Promise<void>;
  getJobCounts(
    ...names: JobCountName[]
  ): Promise<Record<string, number>>;
}

const facade: DMQueueFacade = {
  add: addJob,
  async getJobCounts(...names: JobCountName[]) {
    const now = new Date();
    const counts: Record<string, number> = {};
    for (const name of names.length ? names : (["waiting", "active", "delayed", "failed"] as const)) {
      if (name === "waiting") {
        counts.waiting = await prisma.queueJob.count({
          where: { status: "PENDING", runAt: { lte: now } },
        });
      } else if (name === "delayed") {
        counts.delayed = await prisma.queueJob.count({
          where: { status: "PENDING", runAt: { gt: now } },
        });
      } else if (name === "active") {
        counts.active = await prisma.queueJob.count({
          where: { status: "RUNNING" },
        });
      } else if (name === "failed") {
        counts.failed = await prisma.queueJob.count({
          where: { status: "FAILED" },
        });
      }
    }
    return counts;
  },
};

export function getDMQueue(): DMQueueFacade {
  return facade;
}
