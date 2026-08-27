/**
 * Rate Limiter (Postgres port).
 *
 * Postgres-based rate limiter for Instagram private replies — a fixed-window
 * counter in the RateCounter table, replacing the Redis INCR+EXPIRE version so
 * the app runs without Redis.
 *
 * The cap matches Meta's documented limit for this exact call: 750 private
 * replies per hour per Instagram professional account, for comments on posts
 * and reels. Exceeding it risks 429s and app-level restrictions, so a blocked
 * send is requeued rather than pushed through.
 * https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
 *
 * Note this is a hard ceiling with no headroom. If Meta throttles before the
 * documented limit, or other calls on the same account share the bucket, lower
 * this value.
 */

import { prisma } from "@/lib/db/client";

const RATE_LIMIT_MAX = 750; // private replies per hour, per Meta's documented cap
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const REQUEUE_DELAY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_REQUEUE_ATTEMPTS = 3;

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  remainingDMs: number;
  shouldRequeue: boolean;
  requeueDelayMs: number;
  shouldSkip: boolean;
  reserved: boolean;
}

function rateKey(instagramAccountId: string): string {
  return `rate:dm:${instagramAccountId}`;
}

function windowExpired(windowStart: Date): boolean {
  return Date.now() - windowStart.getTime() >= RATE_LIMIT_WINDOW * 1000;
}

function blockedResult(count: number, requeueAttempt: number): RateLimitResult {
  if (requeueAttempt >= MAX_REQUEUE_ATTEMPTS) {
    return {
      allowed: false,
      currentCount: count,
      remainingDMs: 0,
      shouldRequeue: false,
      requeueDelayMs: 0,
      shouldSkip: true,
      reserved: false,
    };
  }

  return {
    allowed: false,
    currentCount: count,
    remainingDMs: 0,
    shouldRequeue: true,
    requeueDelayMs: REQUEUE_DELAY_MS,
    shouldSkip: false,
    reserved: false,
  };
}

/**
 * Check if an Instagram account is within its DM rate limit (read-only).
 */
export async function checkRateLimit(
  instagramAccountId: string,
  requeueAttempt: number = 0
): Promise<RateLimitResult> {
  const row = await prisma.rateCounter.findUnique({
    where: { key: rateKey(instagramAccountId) },
  });
  const count = row && !windowExpired(row.windowStart) ? row.count : 0;

  if (count >= RATE_LIMIT_MAX) {
    return blockedResult(count, requeueAttempt);
  }

  return {
    allowed: true,
    currentCount: count,
    remainingDMs: RATE_LIMIT_MAX - count,
    shouldRequeue: false,
    requeueDelayMs: 0,
    shouldSkip: false,
    reserved: false,
  };
}

/**
 * Atomically reserve a DM send slot for an Instagram account.
 *
 * Runs in a transaction with a row lock (SELECT ... FOR UPDATE) so concurrent
 * drains can't all pass the check before any of them increments — the same
 * guarantee the old Redis Lua script provided.
 */
export async function reserveDMSlot(
  instagramAccountId: string,
  requeueAttempt: number = 0
): Promise<RateLimitResult> {
  const key = rateKey(instagramAccountId);

  const outcome = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { key: string; count: number; windowStart: Date }[]
    >`SELECT "key", "count", "windowStart" FROM "RateCounter" WHERE "key" = ${key} FOR UPDATE`;
    const row = rows[0];

    if (!row || windowExpired(row.windowStart)) {
      // New window: first send of the hour.
      await tx.$executeRaw`
        INSERT INTO "RateCounter" ("key", "count", "windowStart")
        VALUES (${key}, 1, now())
        ON CONFLICT ("key") DO UPDATE SET "count" = 1, "windowStart" = now()
      `;
      return { allowed: true, count: 1 };
    }

    if (row.count >= RATE_LIMIT_MAX) {
      return { allowed: false, count: row.count };
    }

    await tx.$executeRaw`
      UPDATE "RateCounter" SET "count" = "count" + 1 WHERE "key" = ${key}
    `;
    return { allowed: true, count: row.count + 1 };
  });

  if (!outcome.allowed) {
    return blockedResult(outcome.count, requeueAttempt);
  }

  return {
    allowed: true,
    currentCount: outcome.count,
    remainingDMs: RATE_LIMIT_MAX - outcome.count,
    shouldRequeue: false,
    requeueDelayMs: 0,
    shouldSkip: false,
    reserved: true,
  };
}

/**
 * Backwards-compatible helper for tests and admin scripts.
 * Prefer reserveDMSlot in workers.
 */
export async function incrementDMCounter(
  instagramAccountId: string
): Promise<number> {
  const result = await reserveDMSlot(instagramAccountId, MAX_REQUEUE_ATTEMPTS);
  return result.currentCount;
}

/**
 * Get the current DM count for an Instagram account.
 */
export async function getCurrentDMCount(
  instagramAccountId: string
): Promise<number> {
  const row = await prisma.rateCounter.findUnique({
    where: { key: rateKey(instagramAccountId) },
  });
  if (!row || windowExpired(row.windowStart)) return 0;
  return row.count;
}

/**
 * Reset the rate limiter for an account (useful for testing).
 */
export async function resetRateLimit(
  instagramAccountId: string
): Promise<void> {
  await prisma.rateCounter
    .delete({ where: { key: rateKey(instagramAccountId) } })
    .catch(() => {});
}

// Export constants for use in tests
export { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW, REQUEUE_DELAY_MS, MAX_REQUEUE_ATTEMPTS };
