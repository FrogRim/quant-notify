import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  AuthRepository,
  AuthUserRecord,
  CreateAuthSessionInput,
  OtpChallengeRecord
} from "./service";

const localIdentityForPhone = (phoneE164: string) => {
  const hash = createHash("sha256").update(phoneE164).digest("hex").slice(0, 24);
  return `local:${hash}`;
};

export const createPgAuthRepository = (pool: Pool): AuthRepository => {
  return {
    async replaceOtpChallenge(input) {
      await pool.query("DELETE FROM phone_verifications WHERE phone = $1", [
        input.phoneE164
      ]);
      await pool.query(
        `INSERT INTO phone_verifications (clerk_user_id, phone, code, attempts, expires_at)
         VALUES ($1, $2, $3, 0, $4)`,
        [localIdentityForPhone(input.phoneE164), input.phoneE164, input.codeHash, input.expiresAt]
      );
    },

    async findActiveOtpChallengeByPhone(phoneE164): Promise<OtpChallengeRecord | undefined> {
      const result = await pool.query<{
        phone: string;
        code: string;
        expires_at: string;
        attempts: number;
      }>(
        `SELECT phone, code, expires_at, attempts
         FROM phone_verifications
         WHERE phone = $1 AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [phoneE164]
      );
      if (!result.rows.length) {
        return undefined;
      }
      const row = result.rows[0];
      return {
        phoneE164: row.phone,
        codeHash: row.code,
        expiresAt: row.expires_at,
        attemptCount: row.attempts
      };
    },

    async incrementOtpAttempt(phoneE164) {
      await pool.query(
        `UPDATE phone_verifications
         SET attempts = attempts + 1
         WHERE phone = $1`,
        [phoneE164]
      );
    },

    async consumeOtpChallenge(phoneE164) {
      await pool.query(`DELETE FROM phone_verifications WHERE phone = $1`, [
        phoneE164
      ]);
    },

    async findUserByPhone(phoneE164): Promise<AuthUserRecord | undefined> {
      const result = await pool.query<{ id: string; phone_encrypted: string | null }>(
        `SELECT id, phone_encrypted
         FROM users
         WHERE phone_encrypted = $1
         LIMIT 1`,
        [phoneE164]
      );
      if (!result.rows.length) {
        return undefined;
      }
      return {
        id: result.rows[0].id,
        phoneE164: result.rows[0].phone_encrypted ?? phoneE164
      };
    },

    async findUserById(userId): Promise<AuthUserRecord | undefined> {
      const result = await pool.query<{ id: string; phone_encrypted: string | null }>(
        `SELECT id, phone_encrypted
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      if (!result.rows.length) {
        return undefined;
      }
      return {
        id: result.rows[0].id,
        phoneE164: result.rows[0].phone_encrypted ?? ""
      };
    },

    async createUserForPhone(phoneE164): Promise<AuthUserRecord> {
      const last4 = phoneE164.slice(-4);
      const result = await pool.query<{ id: string; phone_encrypted: string }>(
        `INSERT INTO users (
           clerk_user_id,
           phone_encrypted,
           phone_last4,
           phone_country_code,
           phone_verified,
           phone_verified_at,
           ui_language,
           created_at,
           updated_at
         ) VALUES ($1, $2, $3, '+82', true, NOW(), 'ko', NOW(), NOW())
         RETURNING id, phone_encrypted`,
        [localIdentityForPhone(phoneE164), phoneE164, last4]
      );
      return {
        id: result.rows[0].id,
        phoneE164: result.rows[0].phone_encrypted
      };
    },

    async createAuthSession(input: CreateAuthSessionInput) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO auth_sessions (
           id,
           user_id,
           refresh_token_hash,
           expires_at,
           ip,
           user_agent,
           created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          id,
          input.userId,
          input.refreshTokenHash,
          input.expiresAt,
          input.ip ?? null,
          input.userAgent ?? null
        ]
      );
      return { id };
    }
  };
};
