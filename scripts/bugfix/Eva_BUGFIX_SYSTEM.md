# EVA Bugfix System V2.2

## 1) Goal

Use Bugfix System for stable, repeatable bug巡查 + 修复闭环 across:
- `apps/web`
- `apps/api`
- `packages/core`

Core principle:
- small, verifiable, rollback-safe fixes.

## 2) Current Reality (Checked)

1. `bugfix:scan` exists.
2. `bugfix` loop exists.
3. `.memory/error-cache.json` exists.
4. `smoke-test` implementation file exists (`scripts/smoke-test.ts`).

Current gaps to close:
1. missing root script entry for `smoke-test`.
2. scan output is mostly console logs, not structured artifacts.
3. error fingerprint and `consecutive_failures` persistence are not strong enough.
4. proactive `/loop` mode (schedule/webhook/queue) is not integrated.
5. repo-level pre/post regression comparison is not explicit in CI gate.

## 3) Standard Run Order

1. `bun run bugfix:scan`
2. `bun run smoke-test`
3. `bun run bugfix`

If smoke is red, do not enter full fix loop.

## 3.1 Auto-Fix Policy (Current Phase)

Default strategy:
- whitelist + hard gates + auto rollback.

Allowed for full auto-fix:
1. TypeScript compile errors (`tsc`)
2. ESLint autofix-safe issues
3. low-risk test failures with clear deterministic assertions
4. build script/path/config small fixes

Not allowed for full auto-fix:
1. cross-module behavior redesign
2. prompt/business logic changes without deterministic checks
3. schema/migration/env secret edits
4. auth/session/security-sensitive behavior changes

## 4) Smoke Test Standard (EVA)

Minimum required coverage:
1. typecheck: core/api/web
2. build: core/api/web
3. API health endpoint
4. key runtime flow:
   - login
   - assessment
   - chat
   - report

Implementation notes:
- Keep local mock mode for LLM-dependent endpoints.
- Fail fast on the first blocking path.

## 5) Scan Output Standard

`bugfix:scan` should produce:
1. `reports/eva-bugfix-scan.json`
2. `reports/eva-bugfix-scan.md`

Each issue item should include:
- source (`tsc` / `eslint` / `test` / runtime)
- severity
- fingerprint
- suggested fix
- owner/status

## 6) Error Cache Standard

Cache file:
- `.memory/error-cache.json`

Fingerprint recommendation:
- `source + error_code + file + line + normalized_message`

Required tracking fields:
- `attempts_total`
- `consecutive_failures`
- `last_failure_reason`
- `last_fix_summary`
- `first_seen`
- `last_seen`

Rule:
- `consecutive_failures >= 3` -> `needs_human`

## 7) Loop Modes

Manual mode (default):
- Engineer-triggered scan/smoke/fix.

Proactive mode (phase-2):
1. scheduled scan trigger
2. CI failure webhook ingestion
3. queue processing: detect -> enqueue -> fix -> verify -> report

Do not enable phase-2 until manual mode is stable for at least 2 weeks.

## 8) Regression Closure

Before fix:
- store baseline: typecheck/build/smoke status.

After fix:
- rerun same checks and compare.

Decision gate:
- worse -> rollback and stop
- equal/better -> continue and allow commit

## 8.1 Hard Gates (Must Pass)

Every auto-fix attempt must pass all:
1. `typecheck` (core/api/web)
2. `build` (core/api/web)
3. `smoke-test` (minimum runtime flow)
4. diff scope check (changed files/lines within threshold)

If any gate fails:
- mark attempt failed
- write failure to error-cache
- trigger rollback
- stop current auto-fix item

## 8.2 Auto Rollback Protocol

Rollback trigger:
1. gate failure
2. smoke regression vs baseline
3. diff exceeds safety threshold
4. `consecutive_failures >= 3`

Rollback action:
1. reset working state to pre-fix snapshot
2. persist failure fingerprint and reason
3. mark bug as `needs_human` when retry budget exhausted

Post-rollback output:
1. failure summary (what failed)
2. last attempted fix summary
3. next recommended manual action

## 9) CI Gate for EVA

Required:
1. typecheck (3 workspaces)
2. build (core/api/web)
3. smoke-test
4. upload bugfix scan artifact

Optional:
1. Playwright smoke for critical web navigation

## 9.1 Unattended Automation Guardrails

To support no-user/no-data unattended runs:
1. run auto-fix only on dedicated branch/worktree
2. never auto-merge to protected branch
3. produce machine-readable report for each run
4. open PR or handoff record for `needs_human` items

## 10) Commit Grouping

1. `fix(web): routing/rewrite/env alignment`
2. `fix(api): runtime/health/auth stability`
3. `chore(bugfix): scan/smoke/cache/ci/docs`

Each commit must include:
- symptom
- root cause
- fix scope
- verification result
