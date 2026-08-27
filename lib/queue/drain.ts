/**
 * Queue drain — the serverless replacement for the always-on BullMQ worker.
 *
 * Claims due jobs from the Postgres queue and runs them through the exact same
 * processing logic the worker used (lib/queue/dm-worker.ts). Called from two
 * places:
 *  - the webhook route, right after enqueueing (so immediate jobs — the normal
 *    comment → DM path — send within the same invocation), and
 *  - the /api/cron/process-queue scheduled function (delayed jobs: read
 *    fallbacks, follow-ups, rate-limit requeues, plus retries).
 */

import { prisma } from "@/lib/db/client";
import {
  claimDueJobs,
  markJobFailed,
  markJobSucceeded,
  toJobLike,
} from "@/lib/queue/client";
import { processJob } from "@/lib/queue/dm-worker";
import { recordWorkerAlert, recordDrainHeartbeat } from "@/lib/ops/worker-health";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export interface DrainResult {
  claimed: number;
  succeeded: number;
  failed: number;
}

/**
 * Run up to `limit` due jobs sequentially. Sequential (not concurrent) is
 * deliberate: at self-hosted volume it keeps ordering predictable and stays
 * far from Meta's rate limits, and a Netlify invocation has plenty of time
 * for a handful of sends.
 */
export async function drainQueue(limit = 25): Promise<DrainResult> {
  const rows = await claimDueJobs(limit);
  const result: DrainResult = { claimed: rows.length, succeeded: 0, failed: 0 };

  for (const row of rows) {
    const job = toJobLike(row);
    try {
      await processJob(job);
      await markJobSucceeded(row.id);
      result.succeeded += 1;
    } catch (error) {
      const message = errorMessage(error);
      const { willRetry } = await markJobFailed(row, message);
      result.failed += 1;

      // Preserve the old worker's failure telemetry (OperationalEvent + alert).
      try {
        const data = job.data as { instagramAccountId?: string; commentId?: string };
        const account = data.instagramAccountId
          ? await prisma.instagramAccount.findUnique({
              where: { instagramId: data.instagramAccountId },
              select: { workspaceId: true },
            })
          : null;
        await prisma.operationalEvent.create({
          data: {
            workspaceId: account?.workspaceId ?? null,
            source: "WORKER",
            level: "ERROR",
            message: `DM job ${job.id} failed${willRetry ? " (will retry)" : ""}: ${message}`,
            payload: {
              jobId: job.id,
              attemptsMade: row.attempts + 1,
              instagramAccountId: data.instagramAccountId ?? null,
              commentId: data.commentId ?? null,
              willRetry,
            },
          },
        });
        await recordWorkerAlert({
          level: "error",
          message,
          jobId: job.id,
          instagramAccountId: data.instagramAccountId,
          commentId: data.commentId,
        });
      } catch (recordError) {
        console.error(
          "[Drain] Failed to record job failure:",
          errorMessage(recordError)
        );
      }
    }
  }

  // Heartbeat — /api/health uses this to report queue liveness.
  await recordDrainHeartbeat(result).catch(() => {});

  return result;
}
