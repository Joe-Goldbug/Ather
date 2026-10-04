-- 004_force_rls.sql — 强制 RLS 对表 owner 生效
--
-- 问题：Neon 池化连接使用的角色 `neondb_owner` 带 `rolbypassrls=true`，
--       而 PostgreSQL 的 RLS 对表owner 默认不生效（除非 FORCE）。
--       结果：`SET search_path` + `set_config('app.session_token')` 全部照做，
--       但策略被跳过—— 任何登录用户都能读到全表数据，**静默越权且不报错**。
--       Ather-ethan 同样存在此问题（未使用 FORCE RLS）。
--
-- 解法：ALTER TABLE ... FORCE ROW LEVEL SECURITY，让 owner 也受策略约束。
--
-- 前提：策略必须写成USING (...) + WITH CHECK (...)，
--       否则 owner 在写入时会被策略挡住。当前策略只有 USING，
--       因此本迁移同时补上 WITH CHECK。

-- captures
ALTER TABLE captures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS captures_self ON captures;
CREATE POLICY captures_self ON captures
  USING (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW())
  )
  WITH CHECK (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW())
  );

-- theme_assessment_rounds
ALTER TABLE theme_assessment_rounds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS theme_rounds_self ON theme_assessment_rounds;
CREATE POLICY theme_rounds_self ON theme_assessment_rounds
  USING (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW())
  )
  WITH CHECK (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW())
  );

-- theme_assessment_round_items
ALTER TABLE theme_assessment_round_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS theme_round_items_self ON theme_assessment_round_items;
CREATE POLICY theme_round_items_self ON theme_assessment_round_items
  USING (
    round_id IN (
      SELECT r.id FROM theme_assessment_rounds r
      WHERE r.user_id = (SELECT user_id FROM session_tokens
                         WHERE token = current_setting('app.session_token', true)
                           AND NOT revoked
                           AND expires_at > NOW())
    )
  )
  WITH CHECK (
    round_id IN (
      SELECT r.id FROM theme_assessment_rounds r
      WHERE r.user_id = (SELECT user_id FROM session_tokens
                         WHERE token = current_setting('app.session_token', true)
                           AND NOT revoked
                           AND expires_at > NOW())
    )
  );

-- theme_assessment_round_answers
ALTER TABLE theme_assessment_round_answers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS theme_round_answers_self ON theme_assessment_round_answers;
CREATE POLICY theme_round_answers_self ON theme_assessment_round_answers
  USING (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW())
  )
  WITH CHECK (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW())
  );

-- theme_assessment_result_revisions
ALTER TABLE theme_assessment_result_revisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS theme_result_revisions_self ON theme_assessment_result_revisions;
CREATE POLICY theme_result_revisions_self ON theme_assessment_result_revisions
  USING (
    round_id IN (
      SELECT r.id FROM theme_assessment_rounds r
      WHERE r.user_id = (SELECT user_id FROM session_tokens
                         WHERE token = current_setting('app.session_token', true)
                           AND NOT revoked
                           AND expires_at > NOW())
    )
  )
  WITH CHECK (
    round_id IN (
      SELECT r.id FROM theme_assessment_rounds r
      WHERE r.user_id = (SELECT user_id FROM session_tokens
                         WHERE token = current_setting('app.session_token', true)
                           AND NOT revoked
                           AND expires_at > NOW())
    )
  );

-- theme_assessment_result_responses
ALTER TABLE theme_assessment_result_responses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS theme_result_responses_self ON theme_assessment_result_responses;
CREATE POLICY theme_result_responses_self ON theme_assessment_result_responses
  USING (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW())
  )
  WITH CHECK (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW())
  );
