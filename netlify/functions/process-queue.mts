// Drain delayed queue jobs + run the comment reconciler. This is the
// serverless replacement for the always-on worker's loops.
import { callCronRoute } from "./lib-cron.mts";

export default async function handler() {
  await callCronRoute("/api/cron/process-queue");
}

export const config = { schedule: "*/5 * * * *" };
