/**
 * Local-dev drain loop.
 *
 * Production has no resident worker any more (Netlify + Supabase port): the
 * webhook route drains inline and /api/cron/process-queue handles delayed jobs.
 * This process exists purely for local development, where there is no
 * scheduler — it drains the Postgres queue and runs the reconciler on an
 * interval so `npm run dev` + `npm run worker` behaves like production.
 */

import { drainQueue } from "@/lib/queue/drain";
import { reconcileComments } from "@/lib/polling/comment-reconciler";

const DRAIN_INTERVAL_MS = 10_000;
const POLL_INTERVAL_MS = Number(
  process.env.COMMENT_POLL_INTERVAL_MS ?? 5 * 60_000
);

console.log("[Local Drain] Started (dev-only; production uses the cron)");

async function drain() {
  try {
    const result = await drainQueue(50);
    if (result.claimed > 0) {
      console.log(
        `[Local Drain] claimed=${result.claimed} sent=${result.succeeded} failed=${result.failed}`
      );
    }
  } catch (error) {
    console.error(
      "[Local Drain] Drain failed:",
      error instanceof Error ? error.message : error
    );
  }
}

async function poll() {
  try {
    await reconcileComments();
  } catch (error) {
    console.error(
      "[Local Drain] Comment reconciliation failed:",
      error instanceof Error ? error.message : error
    );
  }
}

void drain();
const drainTimer = setInterval(() => void drain(), DRAIN_INTERVAL_MS);
const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

function shutdown() {
  clearInterval(drainTimer);
  clearInterval(pollTimer);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
