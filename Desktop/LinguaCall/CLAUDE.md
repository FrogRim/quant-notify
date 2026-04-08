# CLAUDE.md

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

## Repository Truth Order

When there is ambiguity, use this order of truth:
1. current code in the repository
2. `/README.md`
3. `/DEPLOY.md`
4. product PRD files
5. engineering breakdown docs
6. design docs

If these conflict:
- preserve the current working architecture
- report the conflict clearly
- implement the smallest repo-compatible change
- do not silently rewrite architecture

## Read Before Making Changes

Always read these first, in order:
1. `/README.md`
2. `/DEPLOY.md`
3. `/DESIGN.md`
4. `/docs/product/LinguaCall_PRD_v3.1_scope_locked.md` if present
5. `/docs/engineering/LinguaCall_engineering_task_breakdown_v1.md` if present
6. `/docs/design/design-tokens.md` if present
7. `/docs/design/page-ui-spec.md` if present
8. `/apps/web/README.frontend-context.md` if present

## Current Product Assumptions

This repo currently appears to be a browser-based realtime voice product.
Do not convert it into a telephony-first architecture unless explicitly asked.

The repo already has or documents:
- web app in `apps/web`
- API server in `apps/api`
- DB migrations in `packages/db`
- login/auth
- phone verification
- realtime session flow
- billing page
- report page
- worker processing

Treat those surfaces as existing product truth.

## Scope Discipline

- Treat the PRD as scope guidance, not a license to delete existing capabilities.
- Prefer feature-gating or hiding to deleting.
- Do not add features outside the requested phase.
- Do not remove multilingual or billing code unless explicitly asked.
- If asked to align UI to Phase 1 scope, preserve backend capabilities unless removal is explicitly requested.

## Frontend Rules

- Follow `/DESIGN.md` first.
- Keep the UI calm, structured, readable, and trustworthy.
- Avoid generic chatbot styling.
- Avoid loud gradients and dashboard clutter.
- Realtime voice UI may feel slightly softer, but still minimal.
- Report UI must optimize for reading.

## Backend Rules

- Respect idempotency.
- Keep status transitions explicit.
- Preserve status vs failure_reason separation if present.
- Do not invent provider fields.
- Do not assume Twilio-based architecture if the current repo uses browser realtime voice flows.
- Check actual route/service code before changing architecture.

## Worker / Data Rules

- Respect migration history.
- Prefer additive migrations over destructive rewrites.
- If DB schema and docs differ, verify code usage before changing schema.
- Treat ledger-like tables as data-sensitive; do not casually rewrite their semantics without confirming all readers/writers.

## Git 커밋 금지 파일

- `PORTFOLIO.md` — 포트폴리오 참고용 로컬 문서. git에 추가하거나 push하지 않는다.

## Working Style

- Read existing files before editing.
- Touch the fewest files needed.
- Keep diffs small and local.
- Do not perform broad refactors unless explicitly requested.
- If you discover a blocker, stop and explain it clearly.

## Before Finishing

Always provide:
- changed files
- what was implemented
- what assumptions were made
- what remains unfinished
- what risks remain

Run the smallest relevant checks available:
- typecheck
- lint
- targeted tests

If checks cannot be run, say so explicitly.
