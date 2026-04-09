# AGENTS.md

## 작업 위치 — 반드시 확인

**모든 Claude Code 및 Codex 세션은 `C:\Users\user\Desktop\LinguaCall` (main 브랜치) 에서 진행한다.**

세션 시작 시 반드시 확인:
1. `git branch` → `main` 인지 확인
2. `git worktree list` → 활성 워크트리 목록 확인
3. 작업 경로가 `C:\Users\user\Desktop\LinguaCall` 인지 확인

**워크트리 혼동 방지:**
- `.worktrees/` 하위 디렉토리는 임시 실험용이다. 기본 작업 위치가 아니다.
- 별도 워크트리에서 작업하라는 명시적 지시가 없는 한, 반드시 main 워크트리에서 작업한다.
- 작업 위치가 불분명하면 사용자에게 먼저 확인한다.

## Repository Truth

Use this order of truth:
1. current repository code
2. `/README.md`
3. `/DEPLOY.md`
4. `/DESIGN.md`
5. product PRD docs
6. engineering task breakdown docs

If these conflict:
- keep the current working architecture intact
- report the mismatch explicitly
- make the smallest change that fits the repository
- do not silently redesign the system

## Required Reading Order

Before doing work, read:
1. `/README.md`
2. `/DEPLOY.md`
3. `/DESIGN.md`
4. `/docs/product/LinguaCall_PRD_v3.1_scope_locked.md` if present
5. `/docs/engineering/LinguaCall_engineering_task_breakdown_v1.md` if present
6. `/docs/design/design-tokens.md` if present
7. `/docs/design/page-ui-spec.md` if present
8. `/apps/web/README.frontend-context.md` if present

## Current Repo Assumptions

The current repository is a pnpm monorepo with:
- `apps/web`
- `apps/api`
- `packages/db`
- `packages/shared`

The current implementation/documentation includes:
- login/auth
- phone verification
- realtime web voice flow
- billing surfaces
- report surfaces
- worker processing

Do not delete these by default.
If scope requires reduced visibility, use feature gates or UI hiding.

## Scope Rules

- Do not add features outside the requested task.
- Do not remove multilingual or billing capabilities unless explicitly asked.
- Do not convert the app into a telephony-first product unless explicitly asked.
- Treat product docs as target-state guidance, not permission to ignore the current repo.

## Editing Rules

- Prefer minimal diffs.
- Do not rename files unless required.
- Do not refactor unrelated code.
- Preserve route/module boundaries unless explicitly asked to restructure.
- Check real file usage before changing schema or environment assumptions.

## Frontend Rules

- Follow `/DESIGN.md`.
- Default UI must feel structured, calm, and trustworthy.
- Realtime voice surfaces may be softer but must stay minimal.
- Report pages must optimize for readability.
- Billing pages must optimize for trust.

## Backend Rules

- Preserve explicit state transitions.
- Preserve idempotent behavior.
- Do not assume undocumented provider webhook fields.
- If a doc mentions provider behavior, validate against current code before rewriting handlers.

## Data Rules

- Prefer additive migrations.
- Do not rewrite migrations already applied in production-like workflows.
- If adding schema, ensure code paths and deployment docs remain coherent.

## Done Means

A task is not done unless you provide:
- changed files
- concise explanation of why each file changed
- checks run
- assumptions
- remaining risks

If blocked, stop and report the blocker instead of guessing.

## Documentation Update Rules

After completing code changes, check and update these two documents if relevant:

### PORTFOLIO.md (local only, not tracked by git)
Update when:
- A new feature is implemented or an existing feature's design changes
- A bug fix reveals a root cause worth documenting for future reference
- An architectural decision or tradeoff is made

Update locations:
- The relevant feature section (4.x)
- Section 7 "주요 기술적 도전과 해결" table
- Section 8 file structure (if new files were added)

### handoff.md
Update when:
- Deployment procedures change
- New environment variables are added
- Known issues or carry-over tasks exist for the next session

Skipping an update is acceptable if no relevant change occurred. State the reason briefly.
