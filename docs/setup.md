# Setup

Everything you need to get AutoReplies running end to end, in one place: hosting, the domain, environment variables, and the Meta app. Read it in order. The code deploys in minutes. The Meta side is the part that takes real time, so budget an afternoon the first time.

If you would rather have an AI assistant drive most of this, skip to [Set it up with an AI assistant](#set-it-up-with-an-ai-assistant) at the end and come back here when it asks for specifics.

## How it is built

AutoReplies is one deployment and one datastore.

- Web app and API: Next.js on Netlify. Serves the dashboard, the OAuth callback, the incoming webhook, and the `/api/cron/*` routes. The webhook handler sends the DM inline on first attempt, so the common case never waits on a queue.
- Scheduled functions: four Netlify crons (defined in `netlify.toml`) call the cron routes — `process-queue` every 5 minutes (drains retries, runs the polling reconciler that catches comments Instagram never pushed), and daily `refresh-tokens`, `attach-next-reel`, `snapshot-followers`.
- PostgreSQL (Supabase): campaigns, logs, accounts, sessions — and also the send queue (`QueueJob`) and per-account rate counters (`RateCounter`). There is no Redis and no resident worker.

## What you need first

- A Facebook account. Meta developer registration is built on it. There is no Instagram-only path.
- An Instagram Business or Creator account. A personal account cannot be connected. Switch it in the Instagram app under Settings, Account type, if needed.
- A [Resend](https://resend.com) account for login emails, with a verified sender domain. Login is email magic links only, so without this nobody can sign in. If you already run your own mail server, you can point `EMAIL_SERVER` at it instead and skip Resend entirely — see the [environment variables](#environment-variables) table.
- A [Netlify](https://netlify.com) account (hosts the app and the scheduled functions) and a [Supabase](https://supabase.com) project (Postgres, free tier).

## Hosting and your domain

Deploying to Netlify gives you a free public URL like `your-app.netlify.app`, and that URL is what everything else points at: `NEXTAUTH_URL`, the Meta OAuth redirect, and the Meta webhook callback all use it. A custom domain (ours is `reply.originalcopy.studio`) is optional — but pick whichever you'll keep *before* configuring the Meta app, because changing it later means updating every Meta URL.

Do Supabase first, because Netlify needs the database URL from it.

### Step 1: Supabase (Postgres, including the queue)

1. Create a Supabase project. Note the database password you set.
2. Open the project's **Connect** panel. You need both connection strings:

| Connection | Port | Use it for |
| --- | --- | --- |
| Transaction pooler (`...pooler.supabase.com`) | `6543` | `DATABASE_URL` on Netlify (the app) |
| Direct (`db.<ref>.supabase.co`) | `5432` | running migrations from your machine |

The pooler hostname is region-specific — copy it from the dashboard, do not guess it.

### Step 2: Migrate the production database

Run once from your machine, using the **direct** connection string:

```bash
DATABASE_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" npm run db:migrate
```

### Step 3: Netlify (web app, functions, and your domain)

1. Create a Netlify site from your fork (dashboard import, or `npx netlify sites:create` + `npx netlify link` from the repo).
2. Add every variable from the [table below](#environment-variables) under Site settings → Environment variables. `NEXTAUTH_URL` is your Netlify domain (or custom domain). `DATABASE_URL` is the **pooled** Supabase string.
3. Deploy: `npx netlify deploy --build --prod`. The build runs `prisma generate` before `next build`, and the four scheduled functions register automatically from `netlify.toml`.
4. Optional custom domain: add it under Domain management (with Netlify DNS it is one click). Then update `NEXTAUTH_URL` and use that domain in the Meta steps below.

## Environment variables

Copy `.env.example` to `.env` for local work, or set these in Netlify's site environment variables for hosting.

| Variable | What it is |
| --- | --- |
| `NEXTAUTH_URL` | Your public URL. Your Netlify (or custom) domain in production, your tunnel URL locally. |
| `NEXTAUTH_SECRET` | Random secret. `openssl rand -base64 32` |
| `CRON_SECRET` | Random secret protecting the token-refresh cron. |
| `ENCRYPTION_KEY` | 32-byte hex. `openssl rand -hex 32`. Encrypts Instagram tokens at rest. |
| `DATABASE_URL` | PostgreSQL connection string. On Netlify use the Supabase **pooled** string (port 6543); for migrations from your machine use the **direct** string (port 5432). |
| `RESEND_API_KEY` | Resend key. Login is email magic links only, so without this nobody can sign in. |
| `EMAIL_FROM` | A sender on a domain you verified in Resend. The placeholder will not deliver. |
| `EMAIL_SERVER` | Optional. An SMTP URL, for example `smtps://login%40example.com:password@mail.example.com:465`. Set it to send magic links through your own mail server instead of Resend; then `RESEND_API_KEY` is not needed. URL-encode special characters in the user and password (`@` becomes `%40`). Port 465 with `smtps://` is implicit TLS, port 587 with `smtp://` is STARTTLS. |
| `META_GRAPH_API_VERSION` | Graph API version, for example `v25.0`. |
| `INSTAGRAM_APP_ID` | From the Meta app, see Step 6. |
| `INSTAGRAM_APP_SECRET` | From the Meta app. |
| `FACEBOOK_APP_SECRET` | From the Meta app. |
| `WEBHOOK_VERIFY_TOKEN` | Any random string. You paste the same value into Meta's webhook config. |

`ENCRYPTION_KEY` must be exactly 64 hex characters or the app throws on boot.

Optional, for tuning the polling reconciler (defaults are fine to start):

| Variable | Default | What it does |
| --- | --- | --- |
| `COMMENT_POLL_INTERVAL_MS` | `300000` | Minimum gap between reconciler sweeps for missed comments (5 min; sweeps run inside the process-queue cron). |
| `COMMENT_POLL_MAX_PER_SWEEP` | `30` | Max new comments each campaign acts on per sweep. Keep it conservative; higher gets closer to Instagram's rate limits. |
| `COMMENT_POLL_LOOKBACK_HOURS` | `72` | How far back a sweep considers comments. |

## The Meta app

This is the slow part. The code works out of the box; getting Meta to send you comment events is where people lose an afternoon. Every step here exists because skipping it breaks something later. Have your Netlify domain from Step 3 ready, you will paste it in a few times.

### Step 4: Create the Meta app

Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) and create an app.

- App type: Business.
- Contact email: one you actually check.

When it asks you to add a use case, filter to All, then choose Manage messaging and content on Instagram. Do not pick "Create and manage ads with Marketing API", and do not pick "Authenticate with Facebook Login". AutoReplies uses Instagram Login. Picking the Facebook Login variant makes the OAuth flow fail later with a mismatched client error.

If you accidentally added the Marketing API use case, remove it. It has its own heavy review requirements and can block publishing.

### Step 5: Collect the three secrets

There are two app secrets and two app IDs, which is confusing. Here is what maps to what.

| Environment variable | Where it lives |
| --- | --- |
| `INSTAGRAM_APP_ID` | Instagram, API setup with Instagram login. A number like `2036...` |
| `INSTAGRAM_APP_SECRET` | Same page, click Show |
| `FACEBOOK_APP_SECRET` | App settings, Basic, App secret, click Show |

The Instagram app ID is not the same number as the Facebook App ID shown on the Basic settings page. Use the one under the Instagram product.

AutoReplies verifies webhook signatures against both `FACEBOOK_APP_SECRET` and `INSTAGRAM_APP_SECRET`, so you do not have to guess which one Meta signs with. Set both.

### Step 6: Add your Instagram account as a tester, and accept the invite

This is the step people miss, and it produces the error "Insufficient Developer Role" on the Instagram login screen. In development, only accounts that have a role on your app can connect. Even your own account has to be added and accept.

There are two halves. Both are required.

Half one, on the Meta side. In the app dashboard, open App roles, then Roles (in the newer console this is also reachable from the Instagram product under "Generate access tokens"). Find the section for Instagram testers, click add, and enter the exact Instagram username of the account you want to connect. Send the invite.

Half two, on the Instagram side. This is the part that gets skipped. Open Instagram as that account (the phone app is easiest):

1. Go to your profile, then the menu, then Settings and activity.
2. Open Apps and websites (older versions: Website permissions, then Apps and websites).
3. Open Tester invites.
4. Accept the invite from your app.

Until you accept here, the account is not really a tester and the login will keep failing. If you do not see the invite, double-check you sent it to the exact username and that the account is a Business or Creator account.

### Step 7: Register the OAuth redirect

In the Instagram product, open Set up Instagram business login, then Business login settings. In the OAuth redirect URIs field, add exactly, using your Netlify domain:

```
https://your-app.vercel.app/api/instagram/callback
```

No trailing slash. If this is missing or wrong, connecting an account fails with a redirect_uri mismatch. You can register more than one, which is useful if you change domains later; keep the old and new both listed.

You do not need the "Embed URL" that Meta shows here. AutoReplies builds its own login URL. Users connect by opening your app, going to Settings, and clicking Connect Instagram.

### Step 8: Configure the webhook

Still in the Instagram product, find the Configure webhooks step.

- Callback URL: `https://your-app.vercel.app/api/webhook`
- Verify token: the value of `WEBHOOK_VERIFY_TOKEN` from your environment
- Click Verify and save. It should succeed immediately, because the app answers Meta's verification challenge. If the button is greyed out, click into the verify-token field and paste the token again; editing the callback URL often clears it.
- Subscribe to the `comments` field, and to `messages` as well.

Both fields matter. `comments` carries comment-to-DM, which is what most people come here for. `messages` carries inbound DMs and Story replies, which is what a campaign's "also reply when someone DMs these words" toggle runs on. Subscribe to `comments` alone and that toggle looks enabled but never fires, because the events it needs are never delivered.

To test delivery without a real comment, click Test next to `comments`, then click Send to My Server. This is a two-step control. Clicking Test only previews the sample payload; the second button is what actually POSTs it to your endpoint. After sending, a row should appear in your `WebhookEvent` table.

If your primary domain ever changes, update this callback URL to the new domain. A non-primary domain will 307-redirect the POST, and Meta does not reliably follow redirects, so webhooks silently stop.

### Step 9: Publish the app

Real comment webhooks are only delivered when the app is in Live state. In Development mode, only the console Test button delivers events. This is the single most common reason for "I set everything up and nothing happens."

Go to the Publish item in the left sidebar. Set the privacy policy, terms of service, and data deletion URLs first, or it will not let you publish. AutoReplies ships these pages, on your Netlify domain:

```
https://your-app.vercel.app/privacy
https://your-app.vercel.app/data-deletion
https://your-app.vercel.app/terms
```

Then publish. Depending on your access level, Meta may let you go live for your own tester accounts immediately, or it may require App Review first (see the last section).

### Publishing is not Advanced Access: every account still needs a role on the app

This one costs an afternoon because the symptom points nowhere near the cause.

A published app still holds **Standard Access** to `instagram_business_basic`, `instagram_business_manage_comments`, and `instagram_business_manage_messages`. Standard Access only covers Instagram accounts that have a role on your app — admins, developers, and Instagram testers. Publishing makes the app live; it does not widen who the permissions apply to. Advanced Access, which covers everyone else, comes only from App Review.

So connecting a second account fails even though the first one works, on the same app, with the same code.

The symptom: Instagram's consent screen appears and the login succeeds, the code exchange at `api.instagram.com/oauth/access_token` returns a normal `IGAA…` token with all the requested permissions — and then every single call against `graph.instagram.com` is refused:

```
Unsupported request - method type: get  [code=100, type=IGApiException]
```

`/access_token`, `/refresh_access_token`, `/me` — all of them, identically. Nothing about the message suggests a missing role, and the token itself looks fine.

The fix for your own accounts is the same two-part dance as Step 6, once per account: invite the Instagram username under App roles, Roles, Instagram testers, then accept the invite inside Instagram under Edit profile, Apps and websites, Tester invites. For accounts you do not control, you need App Review — see [META_APP_REVIEW.md](../META_APP_REVIEW.md).

### The account ID trap (informational)

You do not have to do anything here; AutoReplies handles it. It is worth understanding because it is invisible when it goes wrong.

Meta's `/me` returns two IDs. The `id` field is app-scoped. The `user_id` field is the Instagram professional account ID. Webhooks put `user_id` in `entry.id`, and the messaging API keys off `user_id` too. AutoReplies stores `user_id`, so a fresh connection matches correctly. If you upgraded from a very old build and an account was stored with the wrong ID, disconnect and reconnect it once.

## Test it end to end

1. Make sure the account is a tester and has accepted the invite (Step 6), and the app is published (Step 9).
2. Connect it in the app: Settings, Connect Instagram. You should reach Instagram's consent screen, not the "Insufficient Developer Role" error.
3. Create a campaign on one of your posts with a keyword like `TEST`.
4. From a different Instagram account, comment `TEST` on that post. It must be a different account, because AutoReplies ignores your own comments on purpose.
5. Watch for the DM. If nothing arrives, check the DM Logs page and `/api/health`.

Hit `/api/health` any time. It reports the database, the queue, and the drain heartbeat. If `worker.healthy` is false, the `process-queue` scheduled function has not run recently — check Netlify's function logs.

If you want to inspect where a comment stopped, the Postgres tables tell you: `WebhookEvent` for delivery, `DmLog` for send status and errors, `OperationalEvent` for pipeline errors and the polling reconciler's sweep logs.

## Local development

You need Postgres. The included `docker-compose.yml` starts it:

```bash
docker-compose up -d
npm run db:generate
npm run db:migrate
```

Or install them natively (macOS):

```bash
brew install postgresql@16
brew services start postgresql@16
createdb autoreplies
```

Then set `DATABASE_URL` to match your local user, for example `postgresql://YOUR_USER@localhost:5432/autoreplies`.

Run the app:

```bash
npm run dev
```

DMs send inline from the webhook handler. To exercise the retry/reconciler path, call the drain route yourself: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-queue`.

For Meta to reach your local webhook, run a tunnel and point `NEXTAUTH_URL` and the Meta webhook and redirect URLs at the tunnel:

```bash
ngrok http 3000
```

## Set it up with an AI assistant

If you run an AI coding assistant like Claude Code or Cursor, it can drive most of this for you. Open a clone of this repo inside your assistant and paste the prompt below. Give it your keys as it asks for them.

A word of caution: the assistant will need real secrets to finish (Meta app secrets, a Resend key, database URLs). Only paste those into a tool and environment you trust, and rotate them afterward if you are unsure.

```
You are helping me self-host AutoReplies, an open source Instagram comment-to-DM
automation tool, in this repository. Read README.md and docs/setup.md first, then
help me get it running end to end.

My goal: <describe it. For example: run it for my own Instagram account only,
or host it for other people to sign up.>

Work through this in order and stop to ask me whenever you need a value or an
action only I can do:

1. Local or hosted. Ask me which I want. If hosted, we use Netlify for the web
   app and scheduled functions (its domain becomes my public URL) and Supabase
   for Postgres. If local, we use docker-compose and a tunnel.

2. Datastore. Help me create the Supabase project (or local Postgres), then run
   the Prisma migration against the direct connection string.

3. Environment. Generate NEXTAUTH_SECRET, CRON_SECRET, ENCRYPTION_KEY, and
   WEBHOOK_VERIFY_TOKEN for me. Ask me for my Resend API key and a verified
   sender address, and for the three Meta secrets once I create the app.

4. Deploy to Netlify and confirm /api/health returns ok with worker.healthy
   true (trigger the process-queue cron once if needed).

5. Meta app. Walk me through the Meta app section of docs/setup.md one step at a
   time. This is the slow part. Tell me exactly what to click and what to paste,
   using my Netlify (or custom) domain for the OAuth redirect and webhook. Remember the
   account ID trap (store user_id, not id) and that the app must be published
   for real webhooks to arrive.

6. Test. Have me create a campaign and comment a keyword from a second account,
   then confirm the DM sent by checking the DmLog table and the DM Logs page.

Rules for you:
- Never invent Meta dashboard steps. If a screen does not match the guide, ask
  me to screenshot it.
- Diagnose failures by querying the Postgres tables directly: WebhookEvent for
  delivery, DmLog for send status, OperationalEvent for pipeline errors. This
  is faster than logs.
- Remind me to rotate any secret I paste to you before real use.

Start by reading the docs, then ask me question 1.
```

By the end, `/api/health` returns `status: ok` with `worker.healthy: true`, and a comment with your keyword from a second account produces a `SENT` row in the DM logs. If you get there, you are done.

## Letting other people use your instance

Everything above is enough to run AutoReplies for your own accounts, or a handful of accounts you add as testers. No App Review needed.

For a stranger to connect their own Instagram to your hosted instance, Meta requires App Review granting Advanced Access on the messaging and comments permissions. That means:

- A screencast of the full flow working, recorded on real accounts in one take.
- A written justification for each permission. Drafts are in [../META_APP_REVIEW.md](../META_APP_REVIEW.md).
- Business verification, which asks for a document proving a legal business entity: a business registration or license, articles of incorporation, a business tax document, or a business bank statement.

Meta scrutinizes automated-DM apps and often rejects the first submission, so budget for a resubmit. If you do not have a registered business, most self-hosters skip this entirely by running their own instance for their own account, which never needs review.

## Security notes

- `.env` is gitignored. Keep it that way.
- Rotate any secret that has been pasted anywhere it could be logged, including a chat with an AI assistant.
- Instagram tokens are encrypted at rest with `ENCRYPTION_KEY`. Losing or changing it means every connected account has to reconnect.
