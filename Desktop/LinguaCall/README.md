# LinguaCall

Real-time AI conversation practice for language exam preparation.

## Current Launch Direction

- auth: phone OTP + app-managed session cookies
- billing: Toss only
- runtime: browser-direct OpenAI Realtime voice over WebRTC
- data: Supabase Postgres only
- deploy: self-hosted `web + api + worker` on a VPS

This repository is being hardened toward a Korean-market launch first. Historical references to Clerk, Stripe, Railway, Vercel, and Sentry should be treated as archival unless explicitly marked otherwise.

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
- Naver Cloud SMS
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router 6, Vite 6, Tailwind CSS |
| Backend | Express 4, Node 20, TypeScript 5 |
| Database | Supabase-managed PostgreSQL via `pg` |
| AI / Voice | OpenAI Realtime API, WebRTC |
| Auth | App-managed phone OTP + session cookies |
| Billing | Toss Payments |
| Jobs | Dedicated `worker` process |
| Testing | Vitest, Supertest |
| Deployment | Docker Compose on a VPS |

## Product Flows

### Authentication

1. `POST /auth/otp/start`
2. `POST /auth/otp/verify`
3. API sets `httpOnly` session cookies
4. protected routes validate the app session cookie

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
- [Supabase](https://supabase.com/) for managed PostgreSQL
- [Toss Payments](https://developers.tosspayments.com/)
- Naver Cloud SMS

## Key API Surface

```text
POST /auth/otp/start
POST /auth/otp/verify
GET  /auth/me
POST /auth/logout

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

DATABASE_URL=postgresql://...

OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy
OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EVAL_MODEL=gpt-4.1-mini

TOSS_CLIENT_KEY=...
TOSS_SECRET_KEY=...

NAVER_SMS_SERVICE_ID=...
NAVER_SMS_ACCESS_KEY=...
NAVER_SMS_SECRET_KEY=...
NAVER_SMS_FROM=...

SESSION_COOKIE_SECRET=replace-me
WORKER_SHARED_SECRET=replace-me
WORKER_BATCH_INTERVAL_MS=30000
WORKER_BATCH_LIMIT=20
```

## Source Of Truth

- deploy runbook: [`docs/runbooks/vps-deploy.md`](docs/runbooks/vps-deploy.md)
- launch E2E checklist: [`docs/runbooks/launch-e2e-checklist.md`](docs/runbooks/launch-e2e-checklist.md)
- Toss sandbox manual: [`docs/runbooks/toss-sandbox-manual.md`](docs/runbooks/toss-sandbox-manual.md)
- Naver SMS manual: [`docs/runbooks/naver-sms-manual.md`](docs/runbooks/naver-sms-manual.md)
- launch progress: [`docs/superpowers/reports/2026-03-23-auth-cutover-progress.md`](docs/superpowers/reports/2026-03-23-auth-cutover-progress.md)
- launch design: [`docs/superpowers/specs/2026-03-23-saas-launch-refactor-design.md`](docs/superpowers/specs/2026-03-23-saas-launch-refactor-design.md)
- launch plan: [`docs/superpowers/plans/2026-03-23-saas-launch-refactor-plan.md`](docs/superpowers/plans/2026-03-23-saas-launch-refactor-plan.md)
