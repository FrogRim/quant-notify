# LinguaCall Handoff

Last updated: 2026-04-08

## Current state

Production stack is running on a VPS with Docker Compose.

- auth: Supabase Auth phone OTP
- billing: Toss Payments
- voice: browser WebRTC → OpenAI Realtime (PTT mode)
- database: Supabase Postgres
- deploy: `web + api + worker + caddy` on VPS

## What is deployed

Commit: `8cb7969` (style: align UI visual tone to DESIGN.md)

All Phase 1–6 UX features are in production:

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | PTT (Push-to-Talk) | ✅ |
| 2 | Stage/situation setup | ⏳ pending |
| 3 | Early exit keyword detection | ✅ |
| 4 | Session delete (terminal sessions) | ✅ |
| 5 | Report transcript highlighting | ✅ |
| 6 | Word dictionary popover | ✅ |
| — | UI aligned to DESIGN.md | ✅ |

## Architecture

```
Browser
  → Caddy (HTTPS)
    → web  (nginx serving Vite build)
    → api  (Express)
    → worker (async report + billing jobs)

api / worker → Supabase Postgres
web → Supabase Auth (phone OTP)
web → Toss Payments (checkout widget)
web → OpenAI Realtime (WebRTC, PTT mode)
```

## Key files

```
infra/docker-compose.yml        — service definitions
infra/Caddyfile                 — reverse proxy config
infra/.env.production           — secrets (VPS only, gitignored)

apps/web/src/
  lib/webVoiceClient.ts         — Realtime client with PTT
  lib/pttHelpers.ts             — PTT pure helpers
  lib/highlightHelpers.ts       — grammar correction highlighting
  pages/ScreenSession.tsx       — session hub + live session
  pages/ScreenReport.tsx        — report with highlighting + dictionary
  components/layout/            — AppShell, AuthLayout, SectionCard

apps/api/src/
  routes/sessions.ts            — CRUD + DELETE
  routes/dictionary.ts          — GET /dictionary (gpt-4o-mini)
  modules/learning-sessions/    — repository pattern
  modules/auth/                 — Supabase token verification
```

## Deploy workflow

```bash
# 로컬
git add ... && git commit -m "..." && git push origin main

# VPS
git pull
docker compose --env-file infra/.env.production -f infra/docker-compose.yml build web api
docker compose --env-file infra/.env.production -f infra/docker-compose.yml up -d
```

## Next work

- Phase 2: stage/situation 선택 UI (준비/모의/실전 + 언어별 프리셋)

## Archival

`handoff.md`의 이전 내용(Twilio/Clerk 시절 개발 로그)은 git 히스토리에서 확인 가능.
