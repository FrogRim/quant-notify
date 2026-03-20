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

## External Services

| Service | Role | Free Tier |
|---|---|---|
| [Clerk](https://clerk.com) | JWT Auth · Google/Kakao OAuth | MAU 10,000 무료 |
| [Supabase](https://supabase.com) | PostgreSQL · RLS | 500 MB · 50K req/월 무료 |
| [Railway](https://railway.app) | API 서버 호스팅 | $5 크레딧/월 포함 |
| [Vercel](https://vercel.com) | 프론트엔드 호스팅 | Hobby 플랜 무료 |
| [OpenAI](https://platform.openai.com) | Realtime API · 평가 모델 | 종량제 (과금 발생) |
| [Toss Payments](https://developers.tosspayments.com) | 한국 결제 | 거래 수수료만 부과 |
| [Stripe](https://stripe.com) | 글로벌 결제 | 거래 수수료만 부과 |
| [Sentry](https://sentry.io) | 에러 모니터링 | 5,000 이벤트/월 무료 |

---

## Environment Variables

### Railway (API 서버)

| 변수명 | 설명 | 출처 |
|---|---|---|
| `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 | Supabase → Settings → Database → URI |
| `NODE_ENV` | `production` | 고정값 |
| `PUBLIC_BASE_URL` | 프론트 URL | Vercel 배포 URL |
| `APP_BASE_URL` | 프론트 URL | 위와 동일 |
| `API_BASE_URL` | API 서버 URL | Railway 서비스 URL |
| `CLERK_PUBLISHABLE_KEY` | Clerk 공개키 | Clerk 대시보드 → API Keys |
| `CLERK_SECRET_KEY` | Clerk 비밀키 | Clerk 대시보드 → API Keys |
| `OPENAI_API_KEY` | OpenAI API 키 | OpenAI 대시보드 |
| `OPENAI_REALTIME_MODEL` | `gpt-4o-realtime-preview` | 고정값 |
| `OPENAI_REALTIME_VOICE` | `alloy` | 고정값 |
| `OPENAI_REALTIME_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` | 고정값 |
| `OPENAI_REALTIME_SESSION_URL` | `https://api.openai.com/v1/realtime/sessions` | 고정값 |
| `OPENAI_EVAL_MODEL` | `gpt-4o-mini` | 고정값 |
| `OPENAI_EVAL_URL` | `https://api.openai.com/v1/chat/completions` | 고정값 |
| `ALLOWED_ORIGINS` | 허용할 프론트 도메인 (콤마 구분) | Vercel 배포 URL |
| `TOSS_CLIENT_KEY` | Toss 클라이언트 키 | Toss Payments 대시보드 |
| `TOSS_SECRET_KEY` | Toss 비밀 키 | Toss Payments 대시보드 |
| `STRIPE_SECRET_KEY` | Stripe 비밀 키 | Stripe 대시보드 |
| `BILLING_WEBHOOK_SECRET_STRIPE` | Stripe Webhook 시크릿 | Stripe 대시보드 |
| `SENTRY_DSN` | Sentry DSN (API) | Sentry 프로젝트 설정 |
| `ENABLE_WORKER_BATCH_LOOP` | `true` | 고정값 |
| `WORKER_BATCH_INTERVAL_MS` | `30000` | 고정값 |

### Vercel (프론트엔드)

| 변수명 | 설명 | 출처 |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk 공개키 | Clerk 대시보드 → API Keys |
| `VITE_SENTRY_DSN` | Sentry DSN (Web) | Sentry 프로젝트 설정 |
| `VITE_API_BASE_URL` | API 서버 URL | Railway 서비스 URL |

---

## External Setup Checklist

### Clerk
- [ ] 앱 생성 (Production 환경)
- [ ] Google OAuth 활성화 (Social Connections)
- [ ] Kakao OAuth 활성화 (Custom OAuth Provider)
  - Authorization URL: `https://kauth.kakao.com/oauth/authorize`
  - Token URL: `https://kauth.kakao.com/oauth/token`
  - Userinfo URL: `https://kapi.kakao.com/v2/user/me`
  - Discovery Endpoint: **OFF**
- [ ] 허용 도메인에 Vercel URL 추가
- [ ] `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` 복사

### Supabase
- [ ] `packages/db/migrations/20260321_phone_otp.sql` 실행 (phone_verifications 테이블)
- [ ] `DATABASE_URL` 복사 (Settings → Database → Connection string → URI)

### Sentry
- [ ] 프로젝트 2개 생성: `linguacall-api`, `linguacall-web`
- [ ] 각 DSN 복사 → `SENTRY_DSN`, `VITE_SENTRY_DSN`

### Toss Payments
- [ ] 사업자 등록 후 상점 ID 발급
- [ ] Webhook URL 등록: `https://your-api.up.railway.app/billing/webhooks/toss`
- [ ] 테스트 키 확인 후 `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY` 설정

### Stripe (글로벌 결제)
- [ ] Webhook 엔드포인트 등록: `https://your-api.up.railway.app/billing/webhooks/stripe`
- [ ] `STRIPE_SECRET_KEY`, `BILLING_WEBHOOK_SECRET_STRIPE` 설정

### OpenAI
- [ ] API 키 발급
- [ ] 월 한도 설정 권장: OpenAI 대시보드 → Settings → Limits → Hard limit

---

## Billing Overview

> OpenAI만 사용량에 따라 실시간 과금됨. 나머지는 트래픽이 적을 경우 무료 티어로 운영 가능.

| 서비스 | 과금 시점 | 예상 비용 |
|---|---|---|
| OpenAI Realtime | 세션 진행 중 (토큰 소모) | 입력 $5/1M · 출력 $20/1M 토큰 |
| OpenAI 평가 | 세션 종료 후 GPT 평가 실행 시 | $0.15/1M 토큰 (저렴) |
| Railway | 컨테이너 실행 시간 | $5 크레딧/월 포함, 초과 시 ~$5–10/월 |
| Toss / Stripe | 실제 결제 발생 시 | 거래 수수료 1.5–3% |
| Clerk | MAU 10,000 초과 시 | $0.02/MAU |
| Supabase | 500 MB or 50K req/월 초과 시 | Pro $25/월 |

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
