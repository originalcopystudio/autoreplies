import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/queue/drain";
import { pruneFinishedJobs } from "@/lib/queue/client";
import { reconcileComments } from "@/lib/polling/comment-reconciler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reconciler sweeps + a queue drain can take a while with several campaigns.
export const maxDuration = 60;

/**
 * Serverless heartbeat — replaces the always-on worker's two loops.
 *
 * Scheduled every 5 minutes (see netlify.toml). Each run:
 *  1. drains due queue jobs (delayed reads/follow-ups, rate-limit requeues and
 *     retries; also catches anything an interrupted webhook drain left behind),
 *  2. runs the polling reconciler that catches comments Instagram never
 *     delivered by webhook,
 *  3. drains again so jobs the reconciler just enqueued send in the same run,
 *  4. prunes old finished rows.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const firstPass = await drainQueue(50);

  let reconcileError: string | null = null;
  try {
    await reconcileComments();
  } catch (error) {
    reconcileError = error instanceof Error ? error.message : "Unknown error";
    console.error("[Cron] Comment reconciliation failed:", reconcileError);
  }

  const secondPass = await drainQueue(50);
  const pruned = await pruneFinishedJobs().catch(() => 0);

  return NextResponse.json({
    success: true,
    drain: {
      claimed: firstPass.claimed + secondPass.claimed,
      succeeded: firstPass.succeeded + secondPass.succeeded,
      failed: firstPass.failed + secondPass.failed,
    },
    reconcileError,
    pruned,
  });
}
