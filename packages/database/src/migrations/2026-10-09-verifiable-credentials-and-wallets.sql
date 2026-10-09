-- 2026-10-09-verifiable-credentials-and-wallets.sql
-- 凭证存证与钱包绑定表结构（两层凭证模型 + 增量钱包身份）

-- 1. 签发的可验证凭证记录表
CREATE TABLE IF NOT EXISTS issued_credentials (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_id UUID NOT NULL,
  revision_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'revoked', 'superseded')),
  superseded_by UUID REFERENCES issued_credentials(id) ON DELETE SET NULL,
  on_chain_status TEXT NOT NULL DEFAULT 'none' CHECK (on_chain_status IN ('none', 'pending', 'submitted', 'confirmed', 'finalized')),
  on_chain_network TEXT,
  on_chain_chain_id INTEGER,
  on_chain_contract TEXT,
  on_chain_tx_hash TEXT,
  on_chain_anchor_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issued_credentials_user ON issued_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_issued_credentials_record ON issued_credentials(record_id, revision_id);
CREATE INDEX IF NOT EXISTS idx_issued_credentials_digest ON issued_credentials(content_digest);

ALTER TABLE issued_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS issued_credentials_self ON issued_credentials;
CREATE POLICY issued_credentials_self ON issued_credentials
  USING (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW() LIMIT 1)
  )
  WITH CHECK (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW() LIMIT 1)
  );

-- 2. 用户绑定的附加钱包身份表（阶段 5）
CREATE TABLE IF NOT EXISTS user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  wallet_type TEXT NOT NULL DEFAULT 'eoa' CHECK (wallet_type IN ('eoa', 'contract', 'smart_wallet')),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_via TEXT NOT NULL DEFAULT 'eip712' CHECK (verified_via IN ('eip712', 'erc1271', 'erc6492', 'personal_sign')),
  CONSTRAINT uq_user_wallets_address_chain UNIQUE (address, chain_id)
);

CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);

ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_wallets_self ON user_wallets;
CREATE POLICY user_wallets_self ON user_wallets
  USING (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW() LIMIT 1)
  )
  WITH CHECK (
    user_id = (SELECT user_id FROM session_tokens
                WHERE token = current_setting('app.session_token', true)
                  AND NOT revoked
                  AND expires_at > NOW() LIMIT 1)
  );

-- 3. 钱包绑定与操作的一次性防重放挑战表
CREATE TABLE IF NOT EXISTS wallet_auth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('bind_wallet', 'authorize_action', 'anchor_credential')),
  chain_id INTEGER NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_challenges_nonce ON wallet_auth_challenges(nonce);
