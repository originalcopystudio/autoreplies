// Daily follower-count snapshot for reports (was vercel.json cron 0 7 * * *).
import { callCronRoute } from "./lib-cron.mts";

export default async function handler() {
  await callCronRoute("/api/cron/snapshot-followers");
}

export const config = { schedule: "0 7 * * *" };
