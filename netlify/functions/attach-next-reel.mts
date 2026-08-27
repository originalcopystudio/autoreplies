// Daily "attach next reel" campaign maintenance (was vercel.json cron 0 6 * * *).
import { callCronRoute } from "./lib-cron.mts";

export default async function handler() {
  await callCronRoute("/api/cron/attach-next-reel");
}

export const config = { schedule: "0 6 * * *" };
