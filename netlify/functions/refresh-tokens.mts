// Daily Instagram token refresh (was vercel.json cron 0 5 * * *). Without it,
// connected accounts silently expire after ~60 days.
import { callCronRoute } from "./lib-cron.mts";

export default async function handler() {
  await callCronRoute("/api/cron/refresh-tokens");
}

export const config = { schedule: "0 5 * * *" };
