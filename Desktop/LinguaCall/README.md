# LinguaCall

> AI-powered real-time voice conversation partner for language certification exam preparation.

**Live Demo:** [linguacall.vercel.app](https://linguacall.vercel.app) &nbsp;|&nbsp; **Stack:** TypeScript · React 18 · Express · PostgreSQL · OpenAI Realtime API · WebRTC

---

## Overview

LinguaCall connects learners directly with an AI speaking partner via **browser-native WebRTC** — no phone, no plugin. The AI tutor adapts its language, correction style, and topic boundaries based on the target exam, then delivers a structured evaluation report at the end of each session.

Supported exam tracks: **OPIC (EN)** · **Goethe-Zertifikat B2 (DE)** · **HSK 5 (ZH)** · **DELE B1 (ES)**

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (React 18 + WebRTC)                        │
│  - Captures mic audio via RTCPeerConnection         │
│  - Streams directly to OpenAI Realtime API          │
│  - Receives AI speech back over the same connection │
└──────────────────┬──────────────────────────────────┘
                   │  HTTPS (REST)
┌──────────────────▼──────────────────────────────────┐
│  API Server (Express 4 / Railway / Docker)          │
│  - Issues ephemeral clientSecret from OpenAI        │
│  - Manages session lifecycle FSM                    │
│  - Runs background worker (30 s batch loop)         │
└──────────────────┬──────────────────────────────────┘
                   │  pg (connection pooler)
┌──────────────────▼──────────────────────────────────┐
│  PostgreSQL (Supabase)                              │
│  - 10 tables · RLS policies · credit ledger         │
└─────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

| Decision | Rationale |
|---|---|
| WebRTC direct to OpenAI | Eliminates server-side audio relay — cuts latency by ~200 ms vs. WebSocket proxy |
| Ephemeral token pattern | API key never exposed to the browser; token expires in 60 s |
| Session accuracy policy | Per-exam rule set injected into the AI prompt at runtime (topic lock, max sentences, correction mode) |
| pnpm monorepo | Shared TypeScript types between `api` and `web` enforced at compile time — zero type drift |
| Idempotency keys | UUID-keyed call initiation prevents double-charge on network retry |
| PostgreSQL RLS | Row-level security on `users`, `sessions`, `reports`, `credit_ledger` — no application-layer filtering needed |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18.3 · React Router 6 · Vite 6 · Tailwind CSS 3 · Radix UI |
| Backend | Express 4.21 · Node 20 · TypeScript 5.6 |
| Validation | Zod 3.23 (request schema) |
| Database | PostgreSQL 15 via `pg` 8.13 · Supabase (managed + RLS) |
| AI / Voice | OpenAI Realtime API (`gpt-4o-realtime-preview`) · WebRTC |
| Auth | Clerk (JWT) |
| Testing | Vitest 4.1 · Supertest 7.2 |
| CI/CD | GitHub Actions → Railway (API) + Vercel (Web) |
| Containerization | Docker (node:20-alpine) |

---

## Codebase at a Glance

| Metric | Value |
|---|---|
| Total TypeScript/TSX files | **49** |
| Total lines of code | **11,346** |
| API source modules | **22** |
| API endpoints | **26** |
| Database tables | **10** |
| Test cases | **53** |
| Language / exam tracks | **4** |

---

## Session Lifecycle (FSM)

```
draft → ready → connecting → in_progress → ending → completed
                                                  ↘ failed / cancelled
```

State transitions are enforced at both the application layer (Zod + route guards) and the database layer (`FOR UPDATE` row lock inside a transaction), making concurrent double-start impossible.

---

## AI Prompt Engineering

Each language/exam pair gets a dedicated system prompt built at session start:

```
EN / OPIC   → topic lock · max 3 sentences/turn · 1 question/turn
               forbidden-domain hints · allowed-subtopic cues
DE / Goethe B2 → full German · monologue + dialogue format · B2 evaluation rubric
ZH / HSK5   → Mandarin only · gentle inline correction · fluency encouragement
ES / DELE B1 → Spanish only · DELE B1 oral task structure
```

The **Session Accuracy Policy** is computed from the session topic at call-start and stored as JSONB in the DB. Post-session, `validateCompletedTranscript()` runs token-overlap analysis across all turns to flag topic drift, intent mismatch, and off-topic corrections.

---

## Database Design Highlights

```sql
-- Credit ledger: append-only audit trail
credit_ledger (user_id, kind, direction, amount, session_id, note, created_at)

-- Idempotent webhook processing
webhook_events (dedupe_key UNIQUE, provider, payload, processed_at)

-- Accuracy policy stored per session (JSONB)
sessions.accuracy_policy  JSONB   -- injected into prompt
sessions.accuracy_state   JSONB   -- post-call validation result
```

- **Composite indexes** on `(user_id, created_at)` for session list queries
- **Sparse partial index** `WHERE status = 'scheduled' AND reminder_sent = false` for worker queries
- **Unique partial index** preventing more than one active session per user

---

## API Surface

```
POST   /users/me                  upsert profile
POST   /users/phone/start         send OTP
POST   /users/phone/confirm       verify OTP

POST   /sessions                  create session (Zod-validated)
GET    /sessions                  list sessions
GET    /sessions/:id/messages     paginated transcript

POST   /calls/initiate            start WebRTC call (idempotency key)
POST   /calls/:id/runtime-event   stream events from client
POST   /calls/:id/runtime-complete finalize transcript + trigger evaluation

GET    /billing/plans             plan catalogue
POST   /billing/checkout          create checkout session
POST   /billing/webhooks/:provider idempotent payment webhook

POST   /workers/run               batch: dispatch + reminders + missed + notifications
```

---

## Deployment

| Service | Platform | Notes |
|---|---|---|
| Web | Vercel (free) | Vite SPA · hash-router rewrite |
| API | Railway | Docker · node:20-alpine · `$PORT` dynamic |
| Database | Supabase (free) | Connection pooler (IPv4) · RLS enabled |

```bash
# Local development
pnpm install
pnpm dev          # starts api (port 4000) + web (port 5173) concurrently
pnpm typecheck    # full monorepo type check
pnpm test         # vitest run (53 cases)
```

---

## Project Structure

```
LinguaCall/
├── apps/
│   ├── api/                  Express server
│   │   ├── src/
│   │   │   ├── routes/       calls · sessions · users · billing · workers · reports
│   │   │   ├── services/     openaiRealtime · webVoiceSession · sessionAccuracy
│   │   │   ├── storage/      inMemoryStore.ts  (pg-backed, 2,700+ lines)
│   │   │   └── middleware/   auth (Clerk JWT)
│   │   └── Dockerfile
│   └── web/                  React 18 SPA
│       ├── src/
│       │   ├── pages/        Login · Verify · Session · Billing · Report
│       │   ├── lib/          webVoiceClient.ts  (WebRTC)
│       │   └── components/   Radix UI wrappers
│       └── vercel.json
├── packages/
│   ├── shared/               TypeScript types shared by api + web
│   └── db/migrations/        3 SQL migration files
└── .github/workflows/ci.yml  typecheck + build on every push
```
