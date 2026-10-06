-- Reject new orphaned original-input copies while preserving existing rows for audit.
ALTER TABLE evidence_input_archives
  ADD CONSTRAINT evidence_input_archives_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
