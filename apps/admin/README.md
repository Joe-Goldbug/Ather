# EVA Signal Room

A standalone internal product-intelligence dashboard for EVA.

## Independent runtime

- The app lives under `apps/admin` and does not import the user-facing web app, the Nest API, or `@eva/core`.
- The browser talks only to this app's `/api/snapshot` route.
- Neon / PostgreSQL is accessed server-side only through `lib/db.ts`; credentials never enter client bundles.
- **Security Constraint**: API mode uses a dedicated least-privilege role via `ADMIN_DATABASE_URL`; it must not fall back to the main app's write-level `DATABASE_URL`. The role may read dashboard tables and may write only `admin_access_logs`, `product_feedback_status_history`, and the explicitly allowed fields of `product_feedback` for the internal workflow.
- The dashboard refreshes the snapshot every 30 seconds without touching the main app process.

## Authentication

If `ADMIN_SECRET` (or `ADMIN_API_KEY`) is configured on the server, requests to `/api/snapshot` require authentication via:
- Header: `Authorization: Bearer <ADMIN_SECRET>` or `x-admin-key: <ADMIN_SECRET>`
- Or Cookie: `eva_admin_key=<ADMIN_SECRET>`
- In local dev mode without `ADMIN_SECRET` configured, the server allows direct local access.

Production also requires an explicit actor identity:

```text
ADMIN_ACTOR_EMAIL=developer@eva.local
```

That email must be an active row in `admin_users`. Its role controls access to masked user data, feedback workflow, and each sensitive-field reveal; a shared secret alone is deliberately not treated as a person identity.

## Data modes

- `ADMIN_DATA_MODE=mock` (default) serves local fixtures and is safe for offline UI review.
- `ADMIN_DATA_MODE=api` makes the server route read the existing PostgreSQL tables (`users`, `session_tokens`, `theme_assessment_rounds`, `theme_assessment_result_responses`, `user_corrections`, `evidence_events`, `continuous_portraits`, etc.) from Neon. Optional tables (`product_feedback`, `product_events`) gracefully degrade to empty states if not yet migrated.

Required server-only variable for API mode:

```text
ADMIN_DATABASE_URL=postgresql://admin_dashboard_least_privilege:pass@ep-xyz.neon.tech/eva?sslmode=require
```

## Run locally

```bash
# 1. Run Mock Mode (Default, safe UI review)
bun run dev:admin

# 2. Run API Mode with read-only database
ADMIN_DATA_MODE=api ADMIN_DATABASE_URL="postgresql://..." ADMIN_SECRET="..." ADMIN_ACTOR_EMAIL="developer@eva.local" bun run dev:admin
```

## Test & Verify

```bash
# Run standalone automated tests
bun run test:admin

# Run live database test
ADMIN_DATA_MODE=api ADMIN_DATABASE_URL="postgresql://..." bun run test:admin
```

## V1 Demo areas

- 01 Product pulse and funnel (`theme_assessment_rounds` conversion)
- 02 User directory with search and masked fields (Email/IP masked)
- 03 User 360° detail tabs
- 04 Feedback inbox with status changes
- 05 Assessment and portrait quality laboratory (real confirmation/rebuttal rates)
