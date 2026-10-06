-- Keep the requested locale when a committed report must be requeued after a crash.
ALTER TABLE conversation_reports
  ADD COLUMN IF NOT EXISTS report_locale TEXT NOT NULL DEFAULT 'zh-CN';
