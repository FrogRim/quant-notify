# 2026-03-23 Auth Cutover Progress

## Current Workspace

- Worktree: `C:\Users\user\Desktop\LinguaCall\.worktrees\saas-launch-refactor\Desktop\LinguaCall`
- Branch: `saas-launch-refactor`

## Completed

- Added app-managed auth foundation in `apps/api/src/modules/auth/`
  - `service.ts`
  - `session.ts`
  - `schema.ts`
  - `cookies.ts`
  - `repository.ts`
  - `routes.ts`
  - `naverSms.ts`
- Added DB migration: `packages/db/migrations/20260323_auth_sessions.sql`
- Added `store.getPool()` in `apps/api/src/storage/inMemoryStore.ts`
- Registered `/auth` router in `apps/api/src/index.ts`
- Reworked `apps/api/src/middleware/auth.ts`
  - app session cookie auth only
- Updated web shared API client to use `credentials: "include"`
- Removed Clerk provider dependency from `apps/web/src/main.tsx`
- Reworked web auth entry flow
  - `apps/web/src/pages/ScreenLogin.tsx`
  - `apps/web/src/pages/ScreenVerify.tsx`
  - `apps/web/src/context/UserContext.tsx`
  - `apps/web/src/App.tsx`
- Narrowed billing to Toss-only
  - removed provider selector from `apps/web/src/pages/ScreenBilling.tsx`
  - added billing helper in `apps/web/src/features/billing/checkout.ts`
  - added Toss-only billing seam in `apps/api/src/modules/billing/`
  - removed mock checkout routes and generic provider branching from `apps/api/src/routes/billing.ts`
  - constrained `apps/api/src/storage/inMemoryStore.ts#createCheckoutSession` to Toss only
- Split worker loop from API bootstrap
  - added reusable worker job modules in `apps/api/src/modules/jobs/`
  - added dedicated worker package in `apps/worker`
  - removed API-owned `setInterval` batch loop from `apps/api/src/index.ts`
  - rewired `apps/api/src/routes/workers.ts` to the shared worker runner
- Stopped generating reports inline on runtime completion
  - `completeWebVoiceCall` now leaves completed sessions at `report_status = 'pending'`
  - added `processPendingSessionReports()` in `apps/api/src/storage/inMemoryStore.ts`
  - worker report jobs now process pending reports before sending ready notifications
- Extracted repository seams for users, billing, sessions, and reports
  - added `apps/api/src/modules/users/repository.ts`
  - expanded `apps/api/src/modules/billing/repository.ts`
  - added `apps/api/src/modules/learning-sessions/repository.ts`
  - added `apps/api/src/modules/reports/repository.ts`
  - rewired `users.ts`, `billing.ts`, `sessions.ts`, `reports.ts`, and parts of `calls.ts` away from direct route-to-store coupling
- Added self-hosted deployment assets
  - added `infra/docker-compose.yml`
  - added `infra/Caddyfile`
  - added `docs/runbooks/vps-deploy.md`
  - added `apps/web/Dockerfile`
  - added `apps/worker/Dockerfile`
  - added preview/start/compose scripts for VPS deploy flow
- Removed Sentry from active bootstrap paths
  - `apps/web/src/main.tsx` now uses a local React error boundary
  - `apps/api/src/index.ts` no longer initializes Sentry middleware
- Removed Clerk runtime dependency from the active app path
  - `apps/api/src/index.ts` no longer installs `clerkMiddleware`
  - `apps/api/src/middleware/auth.ts` is now app-session only
  - protected routes now import `requireAuthenticatedUser`
  - `apps/api/package.json` and `apps/web/package.json` no longer declare Clerk dependencies
- Rewrote top-level launch docs to current self-hosted architecture
  - `README.md` now reflects phone OTP + Toss + VPS deployment
  - `DEPLOY.md` now points to `docs/runbooks/vps-deploy.md`
- Added launch verification runbook
  - `docs/runbooks/launch-e2e-checklist.md` now defines the production smoke sequence for auth, billing, realtime, worker, and report generation
- Added operator-facing provider manuals
  - `docs/runbooks/toss-sandbox-manual.md`
  - `docs/runbooks/naver-sms-manual.md`
- Added local launch utilities
  - `scripts/validate-launch-env.cjs`
  - `scripts/launch-smoke.cjs`

## Implemented API Endpoints

- `POST /auth/otp/start`
- `POST /auth/otp/verify`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /billing/checkout` now accepts Toss-only checkout requests
- `POST /billing/webhooks/:provider` now accepts only `toss`
- `/workers/run` now executes shared worker app logic instead of its own duplicate batch implementation

## Tests Added

- `apps/api/src/__tests__/authOtp.test.ts`
- `apps/api/src/__tests__/authSession.test.ts`
- `apps/api/src/__tests__/authRoutes.test.ts`
- `apps/api/src/__tests__/authMiddleware.test.ts`
- `apps/api/src/__tests__/naverSms.test.ts`
- `apps/api/src/__tests__/tossBilling.test.ts`
- `apps/api/src/__tests__/workerApp.test.ts`
- `apps/api/src/__tests__/completeWebVoiceCall.test.ts`
- `apps/api/src/__tests__/usersRepository.test.ts`
- `apps/api/src/__tests__/reportsRepository.test.ts`
- `apps/web/src/lib/api.test.ts`
- `apps/web/src/features/billing/checkout.test.ts`

## Verification Status

Passed:

- focused API auth suite
  - `naverSms.test.ts`
  - `authOtp.test.ts`
  - `authSession.test.ts`
  - `authRoutes.test.ts`
  - `authMiddleware.test.ts`
- focused API billing test
  - `tossBilling.test.ts`
- focused worker test
  - `workerApp.test.ts`
- focused runtime completion test
  - `completeWebVoiceCall.test.ts`
- focused users repository test
  - `usersRepository.test.ts`
- focused reports repository test
  - `reportsRepository.test.ts`
- combined API focused regression
  - auth suite + billing + worker + completion + repository seams
- web `api.test.ts`
- web billing helper test
  - `checkout.test.ts`
- web `typecheck`
- app search for active Clerk runtime references under `apps/`
  - no matches for `@clerk`, `getAuth`, `clerkMiddleware`, `requireClerkUser`

Still failing or not yet verified:

- full API `typecheck`
- worker package `typecheck`
  - current worktree path does not see a local `node_modules`, so standalone worker package scripts cannot resolve toolchain binaries cleanly yet
- `docker compose config`
  - Docker CLI is not installed in the current environment, so compose syntax could not be validated locally
- lockfile refresh
  - `pnpm-lock.yaml` still contains historical package entries until the next install/update run

Known pre-existing or out-of-scope failures still remain in:

- shared package `rootDir` setup
- `apps/api/src/index.ts`
- `apps/api/src/mediaStream.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/routes/calls.ts`
- `apps/api/src/routes/sessions.ts`
- `apps/api/src/routes/reports.ts`
- `apps/api/src/storage/inMemoryStore.ts`

## Important Current Constraints

- Clerk is removed from the active runtime path, but historical naming remains in some internal variables and DB columns such as `req.clerkUserId` and `users.clerk_user_id`.
- Web login/verify path now points at `/auth/otp/*`.
- Naver SMS adapter is implemented, but actual production env vars still need to be set:
  - `NAVER_SMS_SERVICE_ID`
  - `NAVER_SMS_ACCESS_KEY`
  - `NAVER_SMS_SECRET_KEY`
  - `NAVER_SMS_FROM`
- Billing is now logically Toss-only, but the actual Toss widget flow in web is still not integrated.
  - current web still redirects to `checkout.checkoutUrl`
  - `@tosspayments/tosspayments-sdk` is installed but not yet wired into `ScreenBilling.tsx`
- worker package exists, but its package-level scripts still need a clean toolchain path in this worktree environment before `pnpm --filter lingua-call-worker typecheck` is a reliable signal
- async report completion is now in place for web voice completion and worker processing, but report generation via other completion paths should still be reviewed during the next cleanup pass
- README now has a current-launch-direction preface, but older historical sections still contain legacy provider references
- `handoff.md` still contains long historical content and should be treated as archival unless explicitly superseded by the current progress docs
- Toss billing is structurally Toss-only, but the browser still uses redirect-style checkout rather than the final Toss widget flow
- Toss widget launch path is now wired in web
  - `/billing/checkout` returns widget-ready order data
  - `ScreenBilling.tsx` launches Toss SDK directly
  - redirect success now calls `/billing/toss/confirm` from the billing screen

## Next Step

Continue with remaining `Chunk 8: Launch Hardening and Cleanup`.

Priority order:

1. run an actual Toss sandbox payment end-to-end against deployed web/api
2. review remaining `req.clerkUserId` / `clerk_user_id` naming debt and decide whether to keep it as persistence compatibility or rename it
3. refresh lockfile and rerun install-backed verification in an environment with Docker available
4. run Docker-backed VPS smoke checks with real env values
