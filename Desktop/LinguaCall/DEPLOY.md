# LinguaCall Deployment

Current launch work uses a self-hosted VPS topology:

- `caddy` for HTTPS and reverse proxy
- `web` for the Vite frontend
- `api` for the Express application
- `worker` for async jobs
- Supabase only as managed PostgreSQL

Use the runbook at [`docs/runbooks/vps-deploy.md`](docs/runbooks/vps-deploy.md) as the source of truth.

Older Railway/Vercel deployment steps are intentionally retired and should not be used for launch setup.
