# Eva (Eva-web3)

> **项目仓库**：[https://github.com/EthanLau1/Eva-web3](https://github.com/EthanLau1/Eva-web3)  
> **核心定位**：IA（Intelligence Augmentation，增强人类智能）与 Web3 自主认知凭证平台。

## GitHub 仓库与协作方式

核对日期：2026-10-06

用户口头称呼对应关系：

- **“我的 Eva 私人仓”**：EthanLau1/Eva-web3，用户自己的私人仓。
- **“我的 Eva 协助仓”**：Joe-Goldbug/Eva，用户与协作小伙伴共用的仓库。

| 仓库 | 用途 | 当前可见性 | 本地远端 |
|---|---|---|---|
| [EthanLau1/Eva-web3](https://github.com/EthanLau1/Eva-web3) | 用户的个人项目仓 | Private | origin |
| [Joe-Goldbug/Eva](https://github.com/Joe-Goldbug/Eva) | 用户与协作者共同使用的协作仓；用户有时会把项目内容同步到这里 | Public | upstream |

这两个仓库用途不同。协作仓是共享工作空间，不是用户的个人私人仓。本地目录当前位于 master 分支并跟踪 origin/master。用户说“有时会同步”表示存在按需同步的工作方式；每次具体同步仍应依据当次明确指示确认目标分支、内容范围和同步动作。

## 架构与设计规范 (Docs)

本项目关于 IA 目标、Web2/Web3 边界、公链选型与 V1 MVP 规划的设计文档已归档于 `docs/`：

- [00-eva-ia-web3-discussion.md](docs/00-eva-ia-web3-discussion.md)：Eva IA 与 Web3 首个 Demo 讨论总纲
- [01-chain-selection.md](docs/01-chain-selection.md)：基础设施选型评估（首选 Base 链）
- [02-architecture-and-boundary.md](docs/02-architecture-and-boundary.md)：Web2 / Web3 边界架构与系统设计
- [03-v1-mvp-spec.md](docs/03-v1-mvp-spec.md)：V1 MVP 功能规格说明书（RWA 算力基金 + 认知凭证 SBT）
- [04-industry-insights-and-pitfalls.md](docs/04-industry-insights-and-pitfalls.md)：行业案例借鉴与避坑指南

---

## What this repository is

A closed loop: read the whitepaper → play the first chapter → get a result.
No login, no session, no database, no LLM, no queue.

```
GET  /v1/story/guest-opening          → new run + shuffled options
POST /v1/story/guest-opening/complete → scored result + claim token
```

Both endpoints are public by design. The whole service is pure in-memory
computation, which is why it needs no auth layer and no RLS.

## Layout

| Path | What |
|---|---|
| `packages/core/src/assessment/theme-round.ts` | Theme question bank and scoring |
| `packages/core/src/assessment/guest-episode.ts` | Episode 1 question bank (6 nodes × 4 options) |
| `packages/core/src/shared/` | Locale types (used by web i18n) |
| `apps/api/src/modules/theme-assessment/` | The two anonymous endpoints |
| `apps/web/app/whitepaper/` | Whitepaper viewer with full-text search |
| `apps/web/app/play/` | The assessment page |
| `apps/web/messages/` | zh-CN / en / ja / es bundles |

## Layout system

The visual identity comes from three pieces that must stay in sync with the
original. All three are aligned with the upstream baseline design system:

| File | What it provides |
|---|---|
| `app/layout.tsx` | Loads four Google fonts (Inter, Space Grotesk, Share Tech Mono, Caveat) and injects the `--font-*` CSS variables, plus the hand-drawn border SVG filters |
| `app/providers.tsx` + `app/providers-impl.tsx` | SSR locale from cookie, translation lookup with `{key}` interpolation, cookie persistence |
| `components/PageShell.tsx` + `TopBar.tsx` + `GlobalLanguageSwitcher.tsx` | The 60px top bar and language switcher |
| `app/globals.css` | The entire design system |

`globals.css` references `--font-display`, `--font-sans`, `--font-mono` and
`--font-handwriting`. Those variables are only defined by the font loaders in
`layout.tsx` — drop or rewrite that file and every heading silently falls back
to a system font, which changes the whole page's appearance.

The landing hero uses `container` / `hero` / `hero-brand` / `hero-coming-soon`,
and the single entry point uses `.hero-cta` inside `.cta-group`. Both classes
already exist in `globals.css` (a second `.hero-cta` rule at the end of the file
overrides the first — it applies the hand-drawn border, the `sketch-wobble` SVG
displacement filter, and the white-on-hover pill treatment).

Do not reuse `.choices` for landing-page buttons: `.choices button` forces
`width: 100%` and `text-align: left`, which is correct for answer options but
renders as a heavy full-width stack on a landing page.

The whitepaper is reachable from the top bar only; the landing page deliberately
does not repeat it.

## Run it

```bash
npm install
npm run build:core

# terminal 1 — API on :3001
node apps/api/dist/main.js

# terminal 2 — web on :3000
cd apps/web && NEXT_PUBLIC_API_URL=http://127.0.0.1:3001 npx next start
```

Then open http://localhost:3000. No database, no `.env` required in development.

Production needs one variable:

```bash
GUEST_CLAIM_SECRET=...   # HMAC key for the claim token
```

## Tests

```bash
# terminal 1 + 2 running, then:
npm run test:e2e
```

The e2e script drives a real browser through the whole loop: home → adult gate →
six decision nodes → result → whitepaper search. Set `E2E_WEB_URL` to target a
different host, or `CHROME_PATH` if Playwright has no bundled Chromium.

## How the anti-memorisation works

Every `GET /guest-opening` mints a fresh `guest_run_id`. Options are then sorted
by `sha256(guest_run_id:node_id:option_id)`, so the order is:

- **stable within a run** — a refresh mid-chapter never reorders under you
- **different across runs** — you cannot memorise "always pick A"

## Relationship to the original

Code was extracted from the earlier prototype branch and trimmed. What was removed:

| Removed | Why |
|---|---|
| `auth` module, `AuthGuard`, session interceptor | No accounts in this repository |
| `theme-assessment.controller.ts` (authenticated) | Served the DB-backed theme-round flow |
| `ThemeFollowupGeneratorService` | LLM copy polishing; not needed to close the loop |
| `theme-assessment.service.ts` claim + all write methods | Required a database and a user id |
| portrait / evidence / diary / captures / corrections / chat | A separate product surface |
| `script-*` assessment modules (3,357 lines) | Belonged to the retired dynamic-script flow |
| `middleware.ts` | Only did locale detection, no auth |

The service keeps the HMAC claim token from the original. That is the natural
integration point for a future wallet signature — swapping `signGuestClaim` for
`signMessage` verification is a same-shaped change.

### Fixed during extraction

Two real defects, both confirmed by test:

1. The original `/play` result page read `theme_title`, `headline`, `strength`,
   `watchout`, `counterevidence` and `boundary` from the completion result. None
   of those fields exist on `GuestChapterRecord`, so the page rendered
   `undefined` for every insight. This repository uses the actual fields
   (`episode_title`, `summary`, `pattern`, `benefits`, `costs`, `exceptions`,
   `unknowns`).

2. `lib/api.ts` resolved the API base URL at module load. Because `next build`
   prerenders every page on the server, the build failed whenever
   `NEXT_PUBLIC_API_URL` was unset. Resolution is now lazy, per call.

## Licence

UNLICENSED. Private repository.
