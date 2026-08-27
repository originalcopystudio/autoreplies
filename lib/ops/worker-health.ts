/**
 * Queue-drain health telemetry (Postgres port).
 *
 * The always-on worker is gone; "worker health" now means "the queue is being
 * drained on schedule". Every drain (webhook-inline or cron) records a
 * heartbeat row in KvMeta; /api/health reports healthy while the latest
 * heartbeat is younger than the cron cadence allows. Alerts keep the same
 * shape as before, stored as a capped JSON list in KvMeta.
 */

import { prisma } from "@/lib/db/client";

const HEARTBEAT_KEY = "health:drain:dm";
const ALERTS_KEY = "alerts:worker:dm";
const MAX_ALERTS = 25;
// The process-queue cron fires every 5 minutes; allow two missed beats before
// reporting unhealthy.
const HEARTBEAT_MAX_AGE_MS = 12 * 60 * 1000;

export interface WorkerHeartbeat {
  status: "running";
  worker: "dm";
  claimed?: number;
  succeeded?: number;
  failed?: number;
  checkedAt: string;
}

export interface WorkerHealth {
  healthy: boolean;
  heartbeat: WorkerHeartbeat | null;
  ageMs: number | null;
}

export interface WorkerAlert {
  level: "warning" | "error";
  message: string;
  jobId?: string;
  instagramAccountId?: string;
  commentId?: string;
  createdAt: string;
}

/** Called by lib/queue/drain.ts after each drain pass. */
export async function recordDrainHeartbeat(stats?: {
  claimed: number;
  succeeded: number;
  failed: number;
}) {
  const payload: WorkerHeartbeat = {
    status: "running",
    worker: "dm",
    ...stats,
    checkedAt: new Date().toISOString(),
  };

  await prisma.kvMeta.upsert({
    where: { key: HEARTBEAT_KEY },
    create: { key: HEARTBEAT_KEY, value: payload as object },
    update: { value: payload as object },
  });
}

export async function getWorkerHealth(): Promise<WorkerHealth> {
  const row = await prisma.kvMeta.findUnique({ where: { key: HEARTBEAT_KEY } });
  const heartbeat = (row?.value as WorkerHeartbeat | undefined) ?? null;

  if (!heartbeat?.checkedAt) {
    return { healthy: false, heartbeat: null, ageMs: null };
  }

  const ageMs = Date.now() - new Date(heartbeat.checkedAt).getTime();
  return {
    healthy: ageMs <= HEARTBEAT_MAX_AGE_MS,
    heartbeat,
    ageMs,
  };
}

export async function recordWorkerAlert(alert: Omit<WorkerAlert, "createdAt">) {
  const payload: WorkerAlert = {
    ...alert,
    createdAt: new Date().toISOString(),
  };

  const row = await prisma.kvMeta.findUnique({ where: { key: ALERTS_KEY } });
  const existing = Array.isArray(row?.value)
    ? (row.value as unknown as WorkerAlert[])
    : [];
  const next = [payload, ...existing].slice(0, MAX_ALERTS);

  await prisma.kvMeta.upsert({
    where: { key: ALERTS_KEY },
    create: { key: ALERTS_KEY, value: next as unknown as object },
    update: { value: next as unknown as object },
  });
}

export async function getWorkerAlerts(limit = 10): Promise<WorkerAlert[]> {
  const row = await prisma.kvMeta.findUnique({ where: { key: ALERTS_KEY } });
  const alerts = Array.isArray(row?.value)
    ? (row.value as unknown as WorkerAlert[])
    : [];
  return alerts.slice(0, Math.max(0, limit));
}
