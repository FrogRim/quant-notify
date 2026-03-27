# LinguaCall

Real-time AI conversation practice for language exam preparation.

## What This Repo Is Now

LinguaCall is now a Korean-market MVP that has already been cut over to a self-hosted launch stack.

- auth: Supabase Auth phone OTP
- session auth: Supabase access/refresh session with bearer auth to API
- billing: Toss only
- runtime: browser-direct OpenAI Realtime voice over WebRTC
- database: Supabase Postgres only
- deploy: VPS self-hosted `web + api + worker + caddy`

This means the active product path no longer depends on Clerk, Stripe, Railway, Vercel, Naver SMS, SOLAPI, or Sentry.

Important security note: the active login path now uses Supabase Auth bearer sessions, but authorization is still enforced primarily in the API layer. Database RLS is still a secondary guard rather than the primary user-isolation boundary.

## Current Launch Direction

- auth: Supabase Auth phone OTP + refresh session recovery
- billing: Toss only
- runtime: browser-direct OpenAI Realtime voice over WebRTC
- data: Supabase Postgres only
- deploy: self-hosted `web + api + worker` on a VPS

This repository is being hardened toward a Korean-market launch first. Historical references to Clerk, Stripe, Railway, Vercel, and Sentry should be treated as archival unless explicitly marked otherwise.

For the current launch path, authorization is enforced in the API layer. Existing RLS SQL should be treated as a secondary guard, not the primary user-isolation boundary.

## Launch Status

The current MVP launch path is complete enough to run real user tests.

- deployed on a VPS with Docker Compose
- HTTPS terminated by Caddy
- phone OTP login working via Supabase Auth
- returning users can stay signed in on the same device via refresh-session recovery
- Toss sandbox billing working
- session creation working
- realtime voice session bootstrapping working
- worker-based async report processing wired in

Remaining work should be treated as launch hardening and product iteration, not core-stack migration.

## What Was Changed

The project was materially simplified from its earlier SaaS-heavy setup.

- removed Clerk from the active runtime path
- replaced app-managed SMS login with Supabase Auth phone OTP
- narrowed billing from multi-provider to Toss only
- moved background loops out of the API process into a dedicated worker
- moved deployment from Railway/Vercel assumptions to VPS self-hosting
- removed Sentry from the active bootstrap path
- rewired the web app to Supabase Auth phone OTP and bearer-token API auth

## What Is Archival

You may still see historical references in old docs or older code paths. For the active launch path, treat these as archival:

- Clerk
- Stripe
- Railway
- Vercel
- Naver SMS
- SOLAPI
- Sentry

If a document conflicts with the sections above, prefer this README plus the runbooks listed in `Source Of Truth`.

## Architecture

```text
Browser
  -> Caddy
    -> web
    -> api
    -> worker
         |
         +-> Supabase Postgres

External providers:
- OpenAI
- Toss Payments
- Twilio via Supabase Phone Auth
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router 6, Vite 6, Tailwind CSS |
| Backend | Express 4, Node 20, TypeScript 5 |
| Database | Supabase-managed PostgreSQL via `pg` |
| AI / Voice | OpenAI Realtime API, WebRTC |
| Auth | Supabase Auth phone OTP + bearer session |
| Billing | Toss Payments |
| Jobs | Dedicated `worker` process |
| Testing | Vitest, Supertest |
| Deployment | Docker Compose on a VPS |

## Product Flows

### Authentication

1. web requests phone OTP from Supabase Auth
2. web verifies the SMS code with Supabase Auth
3. web stores Supabase access/refresh session locally
4. protected API routes validate the bearer token and map it to the internal user record

### Learning session

1. user creates a session
2. API returns realtime bootstrap data
3. browser connects directly to OpenAI with WebRTC
4. runtime events and completion payloads go back to the API
5. worker picks up pending reports asynchronously

### Billing

1. web requests Toss checkout
2. Toss confirm/webhook reaches the API
3. subscription and credit ledger state update in Postgres

## Runtime Services

- `web`: Vite frontend
- `api`: Express application
- `worker`: scheduler and async report processor
- `caddy`: HTTPS termination and reverse proxy

## External Dependencies

Only these external services are part of the current launch architecture:

- [OpenAI](https://platform.openai.com/)
- [Supabase](https://supabase.com/) for Auth and managed PostgreSQL
- [Toss Payments](https://developers.tosspayments.com/)
- Twilio via Supabase Phone Auth

## Key API Surface

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY

GET  /users/me
POST /users/me
PATCH /users/me/ui-language

POST /sessions
GET  /sessions
GET  /sessions/:id
GET  /sessions/:id/messages
POST /sessions/:id/report
GET  /sessions/:id/report

POST /calls/initiate
POST /calls/:id/join
POST /calls/:id/runtime-event
POST /calls/:id/runtime-complete
POST /calls/:id/end

GET  /billing/plans
GET  /billing/subscription
POST /billing/checkout
POST /billing/webhooks/toss

POST /workers/run
```

## Local Development

```bash
pnpm install
pnpm dev
pnpm --filter lingua-call-api test
pnpm --filter lingua-call-web typecheck
```

## Required Environment

```env
APP_BASE_URL=https://app.example.com
API_BASE_URL=https://api.example.com
ALLOWED_ORIGINS=https://app.example.com
VITE_API_BASE_URL=https://api.example.com
VITE_TOSS_CLIENT_KEY=test_ck_...
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key

OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime-mini
OPENAI_REALTIME_VOICE=marin
OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EVAL_MODEL=gpt-4.1-mini

TOSS_CLIENT_KEY=...
TOSS_SECRET_KEY=...

WORKER_SHARED_SECRET=replace-me
WORKER_BATCH_INTERVAL_MS=30000
WORKER_BATCH_LIMIT=20
```

## Source Of Truth

- architecture overview: [`docs/architecture-overview.md`](docs/architecture-overview.md)
- deploy runbook: [`docs/runbooks/vps-deploy.md`](docs/runbooks/vps-deploy.md)
- launch E2E checklist: [`docs/runbooks/launch-e2e-checklist.md`](docs/runbooks/launch-e2e-checklist.md)
- production readiness checklist: [`docs/runbooks/production-readiness-checklist.md`](docs/runbooks/production-readiness-checklist.md)
- phone auth runbook: [`docs/runbooks/supabase-phone-auth-manual.md`](docs/runbooks/supabase-phone-auth-manual.md)
- Toss sandbox manual: [`docs/runbooks/toss-sandbox-manual.md`](docs/runbooks/toss-sandbox-manual.md)
- launch progress: [`docs/superpowers/reports/2026-03-23-auth-cutover-progress.md`](docs/superpowers/reports/2026-03-23-auth-cutover-progress.md)
- launch design: [`docs/superpowers/specs/2026-03-23-saas-launch-refactor-design.md`](docs/superpowers/specs/2026-03-23-saas-launch-refactor-design.md)
- launch plan: [`docs/superpowers/plans/2026-03-23-saas-launch-refactor-plan.md`](docs/superpowers/plans/2026-03-23-saas-launch-refactor-plan.md)
