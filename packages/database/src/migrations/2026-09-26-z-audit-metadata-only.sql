BEGIN;

-- Audit ownership and action without making another long-lived copy of private content.
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  source_row JSONB;
  old_meta JSONB;
  new_meta JSONB;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    source_row := to_jsonb(OLD);
    old_meta := jsonb_build_object('id', source_row -> 'id');
    IF source_row ? 'user_id' THEN
      old_meta := old_meta || jsonb_build_object('user_id', source_row -> 'user_id');
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    source_row := to_jsonb(NEW);
    new_meta := jsonb_build_object('id', source_row -> 'id');
    IF source_row ? 'user_id' THEN
      new_meta := new_meta || jsonb_build_object('user_id', source_row -> 'user_id');
    END IF;
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(new_meta ->> 'id', old_meta ->> 'id'),
    TG_OP,
    old_meta,
    new_meta,
    (SELECT st.user_id FROM public.session_tokens st
     WHERE st.token = current_setting('app.session_token', true)
       AND (st.revoked IS NULL OR st.revoked = false)
     LIMIT 1)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog;

COMMIT;
