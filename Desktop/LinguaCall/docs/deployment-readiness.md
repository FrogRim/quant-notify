# Deployment Readiness

Use this after configuring VPS, Supabase, Toss, and OpenAI.

## API health check

```bash
curl https://your-api-domain/healthz
```

Expected: `200 OK`

```bash
curl https://your-api-domain/healthz/readiness
```

Expected shape:

```json
{
  "ok": true,
  "service": "lingua-call-api",
  "ready": true,
  "mode": "production",
  "blockingIssues": [],
  "warnings": []
}
```

`blockingIssues` must be empty before treating the deployment as production-ready.

## Blocking checks

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ALLOWED_ORIGINS` set to the production app domain
- `WORKER_SHARED_SECRET` set to a random secret

## Optional but recommended

- `TOSS_CLIENT_KEY` and `TOSS_SECRET_KEY` (required for billing)
- `OPENAI_REALTIME_MODEL`, `OPENAI_EVAL_MODEL` set to correct model names
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` baked into web build

## Environment validation script

```bash
node scripts/validate-launch-env.cjs infra/.env.production
```

Expected output: `[launch-env] ok`

## Supabase setup checklist

- [ ] Project created
- [ ] Phone Auth enabled (`Authentication > Providers > Phone`)
- [ ] Twilio or test phone numbers configured in Supabase Phone Auth
- [ ] `Site URL` set to `https://APP_DOMAIN`
- [ ] `Redirect URLs` includes `https://APP_DOMAIN/**`
- [ ] `DATABASE_URL` copied from `Project Settings > Database`
- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY` copied from `Project Settings > API`
- [ ] DB migrations applied (`packages/db/migrations/`)

## VPS + Docker Compose checklist

- [ ] Ubuntu VPS with public IP
- [ ] Docker Engine and Docker Compose plugin installed
- [ ] Ports 80 and 443 open
- [ ] DNS A records pointing to VPS IP for both `APP_DOMAIN` and `API_DOMAIN`
- [ ] `infra/.env.production` created and filled
- [ ] `docker compose build` passes without errors
- [ ] `docker compose up -d` starts all four services
- [ ] `docker compose ps` shows all services healthy

## Toss Payments setup

- [ ] Test or live keys ready
- [ ] `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `VITE_TOSS_CLIENT_KEY` set
- [ ] Webhook URL registered in Toss dashboard: `https://API_DOMAIN/billing/webhooks/toss`

## Post-deploy smoke tests

```bash
# API health
curl -i https://API_DOMAIN/healthz

# Worker trigger
curl -i -X POST https://API_DOMAIN/workers/run \
  -H "x-worker-token: WORKER_SHARED_SECRET"

# Frontend
curl -I https://APP_DOMAIN
```

See full E2E checklist: [`docs/runbooks/launch-e2e-checklist.md`](runbooks/launch-e2e-checklist.md)

## Archival note

Previous versions of this document referenced Clerk, Stripe, Railway, Vercel, and Sentry.
Those are no longer part of the active launch stack. See `README.md` for the current architecture.
