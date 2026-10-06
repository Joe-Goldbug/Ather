-- Opaque restore guard for accounts deleted from the active database.
-- No foreign key: the row must survive deletion of its users record.
CREATE TABLE IF NOT EXISTS account_deletion_tombstones (
  user_id UUID PRIMARY KEY,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE account_deletion_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE account_deletion_tombstones FROM PUBLIC;
