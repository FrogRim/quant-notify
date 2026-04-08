# VPS Deploy Runbook

This runbook is the source of truth for deploying the current LinguaCall launch stack.

## Current launch stack

- `web`: React/Vite static frontend served by nginx
- `api`: Express API
- `worker`: async batch worker
- `caddy`: HTTPS termination and reverse proxy
- `database`: Supabase Postgres
- `auth`: Supabase Auth phone OTP
- `billing`: Toss Payments
- `voice`: browser WebRTC to OpenAI Realtime

Twilio is not configured in this repository as an app env var. For phone OTP, Twilio is configured inside the Supabase dashboard under `Authentication > Providers > Phone`.

## Prerequisites

- Ubuntu VPS with a public IP
- Docker Engine and Docker Compose plugin installed
- DNS A records pointing to the VPS IP:
  - `APP_DOMAIN`
  - `API_DOMAIN`
- Ports `80` and `443` open
- Supabase project created
- Toss sandbox or live keys ready
- OpenAI API key ready
- Twilio configured in Supabase Phone Auth, or Supabase test phone numbers configured for testing

## Repository layout

Run all commands from the repository root:

```bash
cd ~/linguacall/Desktop/LinguaCall
```

Key files:

- `infra/docker-compose.yml`
- `infra/Caddyfile`
- `infra/.env.production.example`

## 1. Pull the code

> **중요:** VPS는 반드시 `main` 브랜치에서 작업해야 합니다.
> 다른 브랜치(예: `saas-launch-refactor`)에 있으면 새 코드가 반영되지 않습니다.

```bash
cd ~/linguacall/Desktop/LinguaCall
git checkout main
git pull
```

## 2. Create the production env file

```bash
cp infra/.env.production.example infra/.env.production
nano infra/.env.production
```

## 3. Fill required env values

### Public app and API URLs

```env
APP_DOMAIN=app.example.com
API_DOMAIN=api.example.com
APP_BASE_URL=https://app.example.com
API_BASE_URL=https://api.example.com
ALLOWED_ORIGINS=https://app.example.com
VITE_API_BASE_URL=https://api.example.com
```

### Supabase

Use `Project Settings > API` in Supabase.

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Notes:

- `SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY` should both use the public `anon` or `publishable` key.
- Do not use `service_role` or `secret` keys in the web app.

### OpenAI

```env
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime-mini
OPENAI_REALTIME_VOICE=marin
OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EVAL_MODEL=gpt-4.1-mini
```

### Toss

```env
TOSS_CLIENT_KEY=test_ck_...
TOSS_SECRET_KEY=test_sk_...
VITE_TOSS_CLIENT_KEY=test_ck_...
```

### Worker

Generate a secret:

```bash
openssl rand -hex 32
```

Then set:

```env
WORKER_SHARED_SECRET=replace-with-random-secret
WORKER_BATCH_INTERVAL_MS=30000
WORKER_BATCH_LIMIT=20
```

## 4. Configure Supabase Auth

In the Supabase dashboard:

1. Go to `Authentication > Providers > Phone`
2. Enable Phone Auth
3. Configure one of:
   - `Test Phone Numbers and OTPs` for non-SMS testing
   - Twilio provider for real SMS delivery
4. Go to `Authentication > URL Configuration`
5. Set:
   - `Site URL = https://APP_DOMAIN`
   - `Redirect URLs = https://APP_DOMAIN/**`

## 5. Validate the env file

```bash
node scripts/validate-launch-env.cjs infra/.env.production
```

Expected result:

```text
[launch-env] ok
```

## 6. Build and start the stack

```bash
docker compose --env-file infra/.env.production -f infra/docker-compose.yml build --no-cache web api
docker compose --env-file infra/.env.production -f infra/docker-compose.yml build worker
docker compose --env-file infra/.env.production -f infra/docker-compose.yml up -d
```

## 7. Verify service health

```bash
docker compose --env-file infra/.env.production -f infra/docker-compose.yml ps
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs --tail=100 api
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs --tail=100 web
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs --tail=100 worker
docker compose --env-file infra/.env.production -f infra/docker-compose.yml logs --tail=100 caddy
```

Expected:

- `web` healthy
- `api` healthy
- `worker` running
- `caddy` running

## 8. Public health checks

```bash
curl -i "https://${API_DOMAIN}/healthz"
curl -i -X POST "https://${API_DOMAIN}/workers/run" -H "x-worker-token: ${WORKER_SHARED_SECRET}"
curl -I "https://${APP_DOMAIN}"
```

Expected:

- `/healthz` returns `200`
- `/workers/run` returns `200`
- app domain returns `200`

## 9. Post-deploy browser checks

Run the browser flow from:

- [`docs/runbooks/launch-e2e-checklist.md`](./launch-e2e-checklist.md)
- [`docs/runbooks/supabase-phone-auth-manual.md`](./supabase-phone-auth-manual.md)
- [`docs/runbooks/toss-sandbox-manual.md`](./toss-sandbox-manual.md)

## 10. Common failure points

### Caddy does not issue certificates

Check:

- DNS points to the VPS IP
- ports `80` and `443` are open
- `APP_DOMAIN` and `API_DOMAIN` are correct

### Web still uses old env values

`VITE_*` values are baked at build time. Rebuild `web` after changing them.

```bash
docker compose --env-file infra/.env.production -f infra/docker-compose.yml build --no-cache web
docker compose --env-file infra/.env.production -f infra/docker-compose.yml up -d --force-recreate web
```

### Supabase login fails

Check:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Phone Auth enabled in Supabase
- `Site URL` and `Redirect URLs`
- Twilio or test phone settings in Supabase

### API returns 401 on protected routes

Check:

- browser has a valid Supabase session
- web is sending bearer tokens
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct in `api`

## 11. Rolling update

> **주의:** `git checkout main` 확인 후 pull 할 것.

```bash
git checkout main
git pull
docker compose --env-file infra/.env.production -f infra/docker-compose.yml build web api worker
docker compose --env-file infra/.env.production -f infra/docker-compose.yml up -d
```

## 12. Rollback

```bash
git checkout <last-known-good-commit>
docker compose --env-file infra/.env.production -f infra/docker-compose.yml build web api worker
docker compose --env-file infra/.env.production -f infra/docker-compose.yml up -d
```
