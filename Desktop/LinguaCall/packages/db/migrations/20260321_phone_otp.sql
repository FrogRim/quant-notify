-- Phone OTP verification persistence
-- Replaces in-memory OTP store so verifications survive server restarts.

CREATE TABLE IF NOT EXISTS phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_clerk_user_id
  ON phone_verifications (clerk_user_id);

-- Clean up expired rows automatically (requires pg_cron or manual job; safe to run anytime)
-- DELETE FROM phone_verifications WHERE expires_at < NOW();
