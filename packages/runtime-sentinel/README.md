# Runtime Sentinel

A drop-in **runtime smoke + drift detector** for any HTTP service. Engine is
project-agnostic; each project supplies its own probes in `.sentinel/probes.ts`.

## What it gives you

- **One command, one button**: `sentinel` or `sentinel:quick` runs your probes, writes a JSON report.
- **Environment diagnostics**: preflight checks Redis, API, disk, and env vars before running.
- **Smart error classification**: transient vs permanent vs config errors — with auto-fix suggestions.
- **Drift detection**: compares against the previous run, flags status / latency / detail regressions.
- **Auto-debug bridge**: `--auto-debug` forwards failures to your project's bugfix loop.
- **Portable**: copy this folder into a new project and write `.sentinel/probes.ts`. Done.
- **No SaaS lock-in**: stays inside your repo. Reports live in `reports/`.

## Quick Start (recommended)

```bash
# One command — diagnoses environment, loads probes, runs, shows fix suggestions
bun run sentinel:quick

# With Redis (enables OTP auto-read for auth probes)
bun run sentinel:quick --redis redis://localhost:6379

# Against a remote API
bun run sentinel:quick --base https://api.staging.example.com
```

### What `sentinel:quick` does

```
🛰  Runtime Sentinel — Quick Start
   base  = http://localhost:3001

Step 1/3  Environment Diagnostics

  ✅ Node.js              v20.x
  ✅ API                  http://localhost:3001 (latency: 6ms)
  ⚠️  Redis               Redis URL not configured
     💡 Set REDIS_URL env var or pass --redis <url>
  ✅ Disk (reports)       ./reports

🚀 Ready to run probes (est. 2400ms)

Step 2/3  Loading Probes
  ✅ 20 probes loaded
     from: .sentinel/probes.ts

Step 3/3  Running Probes

  PASS     5ms  GET /health
  FAIL   229ms  POST /auth/send-code + OTP
         ↳ redisUrl is not configured
  SKIP     0ms  POST /auth/verify-code

🔧 Fix suggestions:

  auth.send-code (missing_redis):
    💡 mock email / Resend / Redis 未就绪
    → Set REDIS_URL env var or pass --redis <url>
    $ export REDIS_URL=redis://localhost:6379
```

## Standard CLI

```bash
# Full run with preflight
bun run sentinel

# Skip preflight (faster, for CI)
bun run sentinel --skip-preflight

# Auto-debug on failure
bun run sentinel:auto

# JSON output for CI
bun run sentinel:json

# Against remote
bun run sentinel:remote https://api.example.com
```

## Install (drop-in to any project)

```bash
# 1. Copy the engine into your project
cp -r packages/runtime-sentinel/ <your-project>/runtime-sentinel/

# 2. Add it as a workspace package (optional but recommended)
#    in package.json
{ "workspaces": [..., "runtime-sentinel"] }

# 3. Add script entries
{ "scripts": {
    "sentinel": "bun run runtime-sentinel/bin/sentinel.ts",
    "sentinel:quick": "bun run runtime-sentinel/bin/sentinel-quick.ts"
  }
}

# 4. Write your probes
mkdir -p .sentinel
$EDITOR .sentinel/probes.ts

# 5. Run it
bun run sentinel:quick
```

If you skip step 4, the engine falls back to a single `GET /health` probe so the
command still works out of the box.

## Writing probes

```ts
// .sentinel/probes.ts
import { defineProbe, httpJson } from 'runtime-sentinel';
import type { Probe } from 'runtime-sentinel';

const probes: Probe[] = [
  defineProbe('liveness', 'GET /', async (ctx) => {
    const r = await httpJson(ctx, '/');
    return r.ok ? { status: 'pass' } : { status: 'fail', error: r.error };
  }),

  defineProbe('login', 'POST /auth/login', async (ctx) => {
    const r = await httpJson(ctx, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'demo@example.com', password: '...' }),
    });
    if (!r.ok) return { status: 'fail', error: r.error };
    ctx.state.token = r.body?.token;            // share with later probes
    return { status: 'pass' };
  }),

  defineProbe('me', 'GET /me', async (ctx) => {
    const token = ctx.state.token as string | undefined;
    if (!token) return { status: 'skip', error: 'login failed' };
    const r = await httpJson(ctx, '/me', { token });
    return r.ok ? { status: 'pass' } : { status: 'fail', error: r.error };
  }),
];

export default probes;
```

### Conventions

- Probes run **sequentially** in array order.
- Use `ctx.state` to pass values across probes (`token`, `runId`, ...).
- Use `ctx.options.<key>` for CLI overrides (`--turns 8` → `ctx.options.turns === 8`).
- Return `'skip'` when a precondition isn't met — that propagates correctly into reports.
- Put any structured numbers you want diffed under `details.counts: { ... }` and the
  engine will detect drops automatically (no extra wiring needed).
- Add `hint:` to your `fail` return for actionable fix suggestions in the output.

## CLI Reference

```
sentinel [options]

  --base <url>         API base (default: localhost:3001 / API_BASE / VITE_API_BASE)
  --redis <url>        Redis URL for helpers (default: REDIS_URL)
  --probes <file>      Explicit probe file (overrides .sentinel/ discovery)
  --skip-preflight     Skip environment diagnostics (faster, for CI)
  --auto-debug         On failure, spawn the project's bugfix command
  --bugfix '<cmd>'     Bugfix command (default: bun run scripts/bugfix/loop.ts --auto)
  --json               JSON to stdout (CI mode)
  --out <dir>          Report directory (default: ./reports)
  -v, --verbose        Verbose logs
  --help               Show help

Pass-through flags:
  Any other --key value pair becomes ctx.options.<key>.

Exit codes:
  0  All green (or only skips)
  1  At least one probe failed
  2  Runner crashed
```

## Probe discovery rules

1. `--probes <file>` (explicit) wins.
2. Otherwise, walk parents from cwd looking for `.sentinel/probes.{ts,mjs,js}`.
3. Otherwise, fallback to `default-probes.ts` (just `GET /health`).

## Helpers

| Helper | Purpose |
|---|---|
| `httpJson(ctx, path, opts?)` | fetch wrapper, JSON parse, timing |
| `extractCookieValue(setCookie, name?)` | parse Set-Cookie response header |
| `readOtpFromRedis(ctx, { email })` | optional, requires `ioredis` peer dep |

## Error Classification

The engine classifies errors into three types:

| Type | Examples | Behavior |
|---|---|---|
| `transient` | ECONNREFUSED, timeout, 503 | Retryable — auto-fix suggestions |
| `permanent` | 404, 401, bad JSON | Not retried — check probe logic |
| `config` | missing REDIS_URL, wrong base URL | Not retried — setup fix suggested |

Use `classifyError(error)` and `getAutoFixSuggestions(classification)` in your own tooling:

```ts
import { classifyError, getAutoFixSuggestions } from 'runtime-sentinel';

const cls = classifyError(new Error('ECONNREFUSED'));
// { type: 'transient', category: 'connection_refused', retryable: true, ... }

const fixes = getAutoFixSuggestions(cls);
// [{ command: 'bun run dev:api', description: 'Start the API development server', ... }]
```

## Drift detection

After each run the engine reads `<outDir>/sentinel-latest.json` and produces a
`regressions[]` field on the new report:

| Kind | Trigger |
|---|---|
| `status` | pass→fail, pass→skip, skip→fail |
| `latency` | previous ≥ 200ms and current is 50% slower |
| `detail` | any number key inside `details.counts` decreased |

## Auto-debug

Off by default. With `--auto-debug` the CLI calls `args.bugfixCommand` after
emitting the report — the spawned process inherits stdio and the CLI exits with
its status code. Pair this with a project bugfix loop that has its own safety
gates (TIER 1 only, etc.).

## Backend snapshot endpoint (optional)

If your service exposes `GET /sentinel/snapshot` returning `{ deps, domain, ... }`,
you can use it inside a probe to enrich domain-level checks (see EVA's
`.sentinel/probes.ts` `sentinel.snapshot` probe for an example).

## File layout

```
runtime-sentinel/
├── bin/
│   ├── sentinel.ts              ← Full CLI entry
│   └── sentinel-quick.ts        ← Quick-start with diagnostics + fix suggestions
├── src/
│   ├── index.ts                 ← Public exports
│   ├── types.ts                 ← Probe / SentinelContext / SentinelReport
│   ├── probe.ts                 ← defineProbe()
│   ├── runner.ts                ← runSentinel()
│   ├── http.ts                  ← httpJson, extractCookieValue
│   ├── reporter.ts              ← console + JSON output, latest tracking
│   ├── diff.ts                  ← compareReports
│   ├── loader.ts                ← discover .sentinel/probes.{ts,mjs,js}
│   ├── default-probes.ts        ← fallback when no project probes exist
│   ├── preflight.ts             ← Environment diagnostics
│   ├── error-classifier.ts      ← Error type classification + fix suggestions
│   ├── retry.ts                 ← Exponential backoff retry logic
│   └── helpers/
│       ├── index.ts
│       └── redis-otp.ts         ← optional, requires ioredis peer dep
├── package.json                 ← bin, exports, peerDeps
├── tsconfig.json
└── README.md                    ← this file
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `--probes file not found` | wrong path | use absolute path or `--probes ./.sentinel/probes.ts` |
| All probes SKIP | first probe failed (cascade) | check first FAIL line + hint |
| CLI exits 2 | probe file syntax / import error | run with `-v` for details |
| `readOtpFromRedis requires ioredis` | peer dep missing | `bun add ioredis` |
| `redisUrl is not configured` | REDIS_URL not set | pass `--redis redis://localhost:6379` |
| Diff says "no regressions" but a probe failed | regressions only fire on **changes** | re-run after a green pass |
| Preflight fails on API | API not running | `bun run dev:api` then retry |

## Roadmap

- [x] v0.1 — Core probe runner, drift detection, JSON reports
- [x] v0.2 — Environment diagnostics, error classification, quick-start CLI
- [ ] v0.3 — Retry logic integration, performance baseline tracking
- [ ] v0.4 — Web dashboard (real-time probe status at `localhost:3002/sentinel`)
- [ ] v0.5 — CI/CD integration, Slack/webhook alerting, SLA checks

## License

MIT.
