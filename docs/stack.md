# Stack

Everything AutoReplies needs to run, in one place: the application libraries, the
runtime processes, and the specific (free) services this instance is deployed on.
For the step-by-step setup, see [setup.md](setup.md).

## Application

| Layer | Tool |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Language | TypeScript 5 |
| ORM / DB | Prisma 7 with the `@prisma/adapter-pg` driver, PostgreSQL |
| Queue | Postgres-backed (`QueueJob` table, `FOR UPDATE SKIP LOCKED`), drained by a Netlify scheduled function |
| Auth | Auth.js / NextAuth 5 (email magic links) |
| Email | Resend (login links) |
| Validation | Zod 4 |
| Charts | Recharts 3 |
| Styling | Tailwind CSS 4 |
| Tests | Vitest 4 |
| Worker runtime | `tsx` (runs `worker/dm-worker.ts`) |
| Instagram | Official Meta Graph API (Instagram Login) |

## Runtime — one deployment, one datastore

- **Web app + API** (`npm run dev` / Netlify): Next.js. Serves the dashboard, the
  OAuth callback, the incoming webhook, and the `/api/cron/*` routes. The webhook
  handler sends the DM inline on first attempt.
- **Scheduled functions** (Netlify, from `netlify.toml`): `process-queue` every
  5 minutes (drains the retry queue, runs the polling reconciler and follow-gate
  re-checks), plus daily `refresh-tokens`, `attach-next-reel`, `snapshot-followers`.
- **PostgreSQL (Supabase)**: campaigns, DM logs, accounts, sessions, tracked links,
  click events — and the send queue (`QueueJob`) and per-account rate counters
  (`RateCounter`). No Redis, no resident worker.

## Deployment (this instance)

| Piece | Service | Cost |
| --- | --- | --- |
| Web app + scheduled functions | Netlify (existing Pro plan) | $0 extra |
| PostgreSQL (data + queue) | Supabase | Free tier |
| Login email | Resend | Free tier |
| Instagram API | Meta app with Instagram Login | Free |

## Environment variables

Names only — values live in `.env` (gitignored) or the host's env settings, never
in the repo. Full descriptions are in [setup.md](setup.md#environment-variables).

`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`,
`RESEND_API_KEY`, `EMAIL_FROM`, `META_GRAPH_API_VERSION`,
`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `FACEBOOK_APP_SECRET`,
`WEBHOOK_VERIFY_TOKEN`.
