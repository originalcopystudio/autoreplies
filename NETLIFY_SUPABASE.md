# AutoReplies — Netlify + Supabase port (this fork)

This branch (`netlify-supabase`) re-architects AutoReplies to run **entirely on
Netlify + Supabase with no Redis and no always-on worker**, for low/medium
comment volume. Monthly infra cost: $0 beyond a Netlify account (Supabase free
tier).

## What changed vs upstream

| Upstream (Vercel + Railway) | This port (Netlify + Supabase) |
|---|---|
| BullMQ queue on Redis | `QueueJob` table in Postgres (`lib/queue/client.ts`, same `getDMQueue().add()` facade) |
| Always-on worker process | Webhook drains due jobs **inline** (`lib/queue/drain.ts`); a 5-min scheduled function drains delayed jobs & retries |
| Redis rate limiter (Lua) | `RateCounter` table, row-locked transaction (`lib/utils/rate-limiter.ts`) |
| Worker heartbeat in Redis | Drain heartbeat in `KvMeta` (`lib/ops/worker-health.ts`) |
| `vercel.json` crons | Netlify scheduled functions (`netlify/functions/*.mts`) calling the same `/api/cron/*` routes |
| Worker polling reconciler loop | Runs inside `/api/cron/process-queue` every 5 min |

Delivery semantics preserved: deterministic job-id dedup, 3-attempt retry with
5/15/45-min backoff, delayed jobs (opening-DM read fallback, follow-ups,
rate-limit requeues), the polling reconciler safety net, and the 750/hr
private-reply cap. `npm run worker` is now a **local-dev-only** drain loop.

Delayed-job granularity: delayed jobs fire on the next 5-minute cron tick
(e.g. a 5-min read fallback lands 5–10 min after the read). Immediate
comment→DM sends are unaffected — they go out in the webhook invocation.

## Deploy (summary)

1. **Supabase**: create a project → copy the **pooled** connection string
   (port 6543) for the app and the **direct** one (port 5432) for migrations.
2. **Migrate** from your machine:
   `DATABASE_URL="<direct-url>" npm run db:migrate`
3. **Netlify**: import this repo, build command `npm run build` (netlify.toml
   already configured). Set the env vars listed in `netlify.toml`. Deploy.
4. **Meta app**: follow upstream `docs/setup.md` from Step 4 onward — OAuth
   redirect `https://<site>/api/instagram/callback`, webhook
   `https://<site>/api/webhook` subscribing `comments` + `messages`, publish.
5. **Verify**: `/api/health` → `status: ok` (worker.healthy turns true after
   the first cron tick, up to 5 minutes after deploy).

## Operational notes

- The webhook function does the DM send inline; a failed invocation leaves the
  job PENDING and the cron retries it — no comment is lost.
- `FOR UPDATE SKIP LOCKED` claiming makes concurrent drains (webhook + cron)
  safe; abandoned RUNNING rows are reclaimed after 10 min.
- Old finished queue rows are pruned after 7 days by the cron.
- If volume ever grows to sustained bursts (thousands of comments/hour),
  revisit upstream's worker architecture — that's what it's for.
