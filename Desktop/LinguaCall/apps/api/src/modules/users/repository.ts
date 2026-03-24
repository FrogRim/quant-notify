import type { Pool } from "pg";
import type { UserProfile } from "@lingua/shared";
import { AppError, store } from "../../storage/inMemoryStore";

type Queryable = Pick<Pool, "query">;

type DbUserRow = {
  id: string;
  clerk_user_id: string;
  name: string | null;
  email: string | null;
  phone_last4: string | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  trial_calls_remaining: number;
  paid_minutes_balance: number;
  plan_code: string;
  ui_language: string;
  created_at: string;
  updated_at: string;
};

type DbPhoneVerificationRow = {
  phone: string;
  code: string;
  attempts: number;
};

const mapUserProfile = (row: DbUserRow): UserProfile => {
  return {
    id: row.id,
    clerkUserId: row.clerk_user_id,
    name: row.name ?? undefined,
    email: row.email ?? undefined,
    phoneLast4: row.phone_last4 ?? undefined,
    phoneVerified: row.phone_verified,
    phoneVerifiedAt: row.phone_verified_at ?? undefined,
    trialCallsRemaining: row.trial_calls_remaining,
    paidMinutesBalance: row.paid_minutes_balance,
    planCode: row.plan_code,
    uiLanguage: row.ui_language,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const sanitizeDigits = (value: string) => value.replace(/\D+/g, "");

const normalizePhoneMasked = (phone: string) => {
  const digits = sanitizeDigits(phone);
  if (digits.length < 4) {
    return digits;
  }
  const last4 = digits.slice(-4);
  return `***-****-${last4}`;
};

export const createUsersRepository = (db: Queryable) => {
  const getByClerkUserId = async (clerkUserId: string): Promise<UserProfile | undefined> => {
    const result = await db.query<DbUserRow>(
      "SELECT * FROM users WHERE clerk_user_id = $1 LIMIT 1",
      [clerkUserId]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return mapUserProfile(result.rows[0]);
  };

  const upsert = async (
    clerkUserId: string,
    profile?: { name?: string; email?: string }
  ): Promise<UserProfile> => {
    const result = await db.query<DbUserRow>(
      `
        INSERT INTO users (
          clerk_user_id, name, email, created_at, updated_at
        ) VALUES (
          $1, $2, $3, NOW(), NOW()
        )
        ON CONFLICT (clerk_user_id) DO UPDATE
          SET name = COALESCE(EXCLUDED.name, users.name),
              email = COALESCE(EXCLUDED.email, users.email),
              updated_at = NOW()
        RETURNING *
      `,
      [clerkUserId, profile?.name ?? null, profile?.email ?? null]
    );
    return mapUserProfile(result.rows[0]);
  };

  const updateUiLanguage = async (
    clerkUserId: string,
    uiLanguage: string
  ): Promise<UserProfile> => {
    const result = await db.query<DbUserRow>(
      "UPDATE users SET ui_language = $2, updated_at = NOW() WHERE clerk_user_id = $1 RETURNING *",
      [clerkUserId, uiLanguage]
    );
    if (result.rows.length === 0) {
      throw new AppError("USER_NOT_FOUND", "user not found");
    }
    return mapUserProfile(result.rows[0]);
  };

  const startPhoneVerification = async (
    clerkUserId: string,
    phone: string
  ): Promise<{ maskedPhone: string; debugCode: string }> => {
    const existing = await getByClerkUserId(clerkUserId);
    if (!existing) {
      throw new AppError("USER_NOT_FOUND", "user not found");
    }

    const sanitizedPhone = sanitizeDigits(phone);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await db.query(
      "DELETE FROM phone_verifications WHERE clerk_user_id = $1",
      [clerkUserId]
    );
    await db.query(
      `
        INSERT INTO phone_verifications (clerk_user_id, phone, code, attempts, expires_at)
        VALUES ($1, $2, $3, 0, $4)
      `,
      [clerkUserId, sanitizedPhone, code, expiresAt]
    );

    return {
      maskedPhone: normalizePhoneMasked(sanitizedPhone),
      debugCode: code
    };
  };

  const confirmPhoneVerification = async (
    clerkUserId: string,
    phone: string,
    code: string
  ): Promise<boolean> => {
    const existing = await getByClerkUserId(clerkUserId);
    if (!existing) {
      throw new AppError("USER_NOT_FOUND", "user not found");
    }

    const sanitizedPhone = sanitizeDigits(phone);
    const result = await db.query<DbPhoneVerificationRow>(
      `
        SELECT phone, code, attempts
        FROM phone_verifications
        WHERE clerk_user_id = $1 AND expires_at > NOW()
        LIMIT 1
      `,
      [clerkUserId]
    );

    const challenge = result.rows[0];
    if (!challenge) {
      return false;
    }

    const newAttempts = challenge.attempts + 1;
    await db.query(
      "UPDATE phone_verifications SET attempts = $2 WHERE clerk_user_id = $1",
      [clerkUserId, newAttempts]
    );

    if (newAttempts > 5 || challenge.code !== code || challenge.phone !== sanitizedPhone) {
      return false;
    }

    const last4 = sanitizedPhone.slice(-4);
    await db.query(
      `
        UPDATE users
        SET phone_encrypted = $2,
            phone_last4 = $3,
            phone_country_code = $4,
            phone_verified = true,
            phone_verified_at = NOW(),
            updated_at = NOW()
        WHERE clerk_user_id = $1
      `,
      [clerkUserId, sanitizedPhone, last4, "+82"]
    );
    await db.query(
      "DELETE FROM phone_verifications WHERE clerk_user_id = $1",
      [clerkUserId]
    );
    return true;
  };

  return {
    getByClerkUserId,
    upsert,
    updateUiLanguage,
    startPhoneVerification,
    confirmPhoneVerification
  };
};

export const usersRepository = createUsersRepository(store.getPool());
