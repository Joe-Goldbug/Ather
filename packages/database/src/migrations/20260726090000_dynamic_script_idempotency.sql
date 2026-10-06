-- packages/database/src/migrations/20260726090000_dynamic_script_idempotency.sql
--
-- [Bug fix #2 from CRITICAL review]
-- The dynamic_script_generations table was missing the `idempotency_key`
-- column promised by the API contract. Without it, double-clicking /complete
-- creates two generations + two BullMQ jobs; the dedupe logic in
-- dynamic-script.service.ts:443 was a no-op.
--
-- This is a forward migration (additive only) so it's safe to apply on
-- existing dev / production databases. Existing rows get NULL keys, which
-- the service treats as "no key supplied" — same semantics as today.

ALTER TABLE dynamic_script_generations
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Partial unique index: enforces idempotency only when a key is provided.
-- NULLs are excluded (Postgres default for UNIQUE) so the typical case
-- (no client key) still creates a fresh generation row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dynamic_script_generations_idem
  ON dynamic_script_generations(session_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;