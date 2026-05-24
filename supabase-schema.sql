-- povo Guard — Supabase schema
-- Supabase ダッシュボードの SQL Editor で実行すること

CREATE TABLE povo_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  last_expiry     DATE,
  last_scanned_at TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'warning', 'suspended')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE povo_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES povo_accounts(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_elapsed INTEGER NOT NULL,
  threshold   INTEGER NOT NULL
);

CREATE INDEX idx_notifications_lookup
  ON povo_notifications(account_id, threshold, notified_at);

-- 初期データ: 2回線を投入
INSERT INTO povo_accounts (email, label) VALUES
  ('yosinn1@gmail.com',   'メイン'),
  ('yosinn1+1@gmail.com', 'サブ');

-- RLS を無効化（個人ツール・Worker側で認証）
-- Supabase ダッシュボード → Table Editor → 各テーブル → RLS → Disable
