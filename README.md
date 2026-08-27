<div align="center">

# AutoReplies

**Original Copy Studio's self-hosted Instagram comment-to-DM automation.**

Live at [reply.originalcopy.studio](https://reply.originalcopy.studio)

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)

</div>

Someone comments `LINK` on an @originalcopy.co reel, and they get a DM with the link a second later. AutoReplies watches comments on our Instagram posts, and when a comment matches a keyword we set, it sends that person a private reply through the official Meta API — with tracked links, optional public replies, follow-gates and button flows.

This is our production fork of **[OpenReply](https://github.com/diwenne/openreply)**, re-architected to run **fully serverless** — no Redis, no always-on worker: a Postgres-backed queue on Supabase plus Netlify Functions and scheduled crons. Infra cost: $0/month on top of plans we already had. See [NETLIFY_SUPABASE.md](NETLIFY_SUPABASE.md) for the architecture and deploy guide.

> 🔒 Internal tool. The dashboard at reply.originalcopy.studio is login-gated (magic links to studio email). Nothing here stores secrets — config lives in Netlify env vars.

## Why this exists

Comment-to-DM is one feature, but every tool that offers it wants a recurring subscription for it. The actual work is a webhook, a keyword match, and one API call to Meta. That does not need to cost anything to run for a single account.

AutoReplies is built around Meta's official Instagram private replies. It does not scrape, it does not automate a browser, and it never asks for an Instagram password. That keeps your account inside Meta's rules, which matters if you care about not getting flagged.

## Features

- Keyword to DM. Match one or many keywords per post, whole-word or partial.
- Optional public reply. Post a visible comment reply on top of the DM.
- DM and Story reply triggers. The same keywords can also fire on an inbound DM, which covers text replies to your Stories, since Instagram delivers those as DMs. That makes `Reply LINK to this Story` work with no post involved. Turn it on per campaign, and subscribe to the `messages` webhook field when you set up your Meta app.
- Tracked links. Swap a link for a tracked redirect and see clicks and CTR per campaign.
- Two link buttons. Send up to two tappable link buttons in one DM, each a separate tracked link with its own click stats.
- Follow gate. Optionally require a follow before you hand over the link. The DM asks the commenter to follow and tap a button; on tap, AutoReplies checks Meta's `is_user_follow_business` flag and only sends the link once they follow, re-prompting until then. It fails open (sends the link anyway) when Instagram does not return follow status, so a real follower is never trapped.
- Personalization. Use `{username}` in your message to greet the commenter by name.
- Per-account rate limiting. Stays under Meta's documented cap of 750 private replies per hour, and queues the overflow instead of dropping it.
- Multiple Instagram accounts. Connect several professional accounts under one workspace, each with its own limits.
- Workspaces and roles. Owner, admin, and member roles with invite links, useful if you run this for clients.
- Campaign templates. Start from a preset instead of a blank form.
- Inbox. Read your Instagram DM conversations and reply from the dashboard, inside Meta's 24-hour messaging window. Cached so it loads instantly on repeat visits.
- DM logs. Every send, skip, and failure is logged with a reason.
- Self-comment filtering. Your own comments never trigger a reply, since Meta rejects DMing yourself anyway.

## How it works

1. Someone comments on your Instagram post or reel, or DMs you, or replies to your Story.
2. Meta sends a webhook to your AutoReplies instance.
3. AutoReplies checks the text against your active campaigns.
4. On a keyword match, the webhook handler sends the private reply immediately (and the public reply if you enabled one).
5. A scheduled function drains a Postgres-backed queue every five minutes: it retries anything that failed, and a polling reconciler sweeps for comments Instagram never pushed.

One Next.js app on Netlify does all of it — dashboard, OAuth callback, webhook, and the cron routes the scheduled functions call. The only datastore is Postgres (Supabase): data, queue, and rate counters. There is no Redis and no resident worker.

## Quick start

You need a few accounts before anything works: a Meta developer app, a Resend account for login emails, a Netlify account (hosts the app and the scheduled functions), and a Supabase project (Postgres, free tier). The Instagram account you connect has to be a Business or Creator account, not a personal one.

The honest version: the code deploys in minutes, but the Meta app setup is the part that takes real time. Read [docs/setup.md](docs/setup.md) before you start. It is the single setup guide, covering hosting, your domain, the environment, and every Meta wrong turn so you do not have to find them yourself.

### Deploy

There is no shared instance to join — you deploy your own copy, on your own domain, which is the only thing your Meta app is allowed to talk to. Ours runs on **Netlify + Supabase**; [NETLIFY_SUPABASE.md](NETLIFY_SUPABASE.md) is the architecture note and [docs/setup.md](docs/setup.md) is the step-by-step (create the Supabase project, migrate, set Netlify env vars, `npx netlify deploy --build --prod`).

### Run it locally

```bash
git clone https://github.com/originalcopystudio/autoreplies.git
cd autoreplies
npm install
cp .env.example .env      # then fill in the values, see docs/setup.md
docker-compose up -d      # starts Postgres
npm run db:migrate
npm run dev               # the whole app on http://localhost:3000
```

One process. The webhook handler sends DMs inline; to exercise the retry/reconciler path locally, hit the drain route yourself: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-queue`.

Full environment variables and the production layout are in [docs/setup.md](docs/setup.md).

## Set it up with your AI assistant

If you use Claude Code, Cursor, or a similar tool, the Meta setup is a lot faster with an assistant driving it. There is a ready-made prompt in the [Set it up with an AI assistant](docs/setup.md#set-it-up-with-an-ai-assistant) section of the setup guide. Paste it into your assistant inside a clone of this repo, hand over your keys as it asks, and it will walk you through connecting Instagram and going live.

## Tech stack

- Next.js 16 and React 19 for the web app and API routes
- Prisma 7 with PostgreSQL
- Postgres-backed queue (Supabase) drained by Netlify scheduled functions — no Redis, no worker
- Auth.js (NextAuth) with email magic links through Resend
- Tailwind CSS for the interface
- The official Instagram API with Instagram Login

For the complete stack — application libraries, the two runtime processes, and the services this runs on (Netlify, Supabase, Resend, Meta) — see [docs/stack.md](docs/stack.md).

## Contributing

Issues and pull requests are welcome. If you hit a Meta quirk that is not in the setup guide, a PR that documents it is worth as much as a code fix, because that is where everyone loses time.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Credits

Maintained by [Original Copy Studio](https://originalcopy.studio) (Kurt & Dom) for @originalcopy.co.

Forked from [OpenReply](https://github.com/diwenne/openreply) by Diwen Huang ([@diwenne](https://github.com/diwenne)) — which is itself a fork of [instagram-comment-to-dm](https://github.com/im-anishraj/instagram-comment-to-dm) by [Anish Raj](https://github.com/im-anishraj). Both MIT licensed. Our changes: the serverless re-architecture (BullMQ/Redis/worker → Postgres queue + Netlify Functions), Instagram API fixes (unversioned token endpoints, already-long-lived login tokens), and the Original Copy rebrand.

## License

MIT. See [LICENSE](LICENSE).
