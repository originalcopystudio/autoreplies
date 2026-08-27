/**
 * Shared helper for Netlify scheduled functions: call one of the app's own
 * /api/cron/* routes with the CRON_SECRET bearer token.
 *
 * The app URL comes from NEXTAUTH_URL (canonical, set by the operator) with
 * Netlify's own URL env var as fallback.
 */
export async function callCronRoute(path: string): Promise<Response> {
  const base = process.env.NEXTAUTH_URL ?? process.env.URL;
  if (!base) throw new Error("NEXTAUTH_URL (or URL) is not set");
  const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("CRON_SECRET (or NEXTAUTH_SECRET) is not set");

  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`[cron] ${path} -> ${res.status} ${body.slice(0, 300)}`);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res;
}
