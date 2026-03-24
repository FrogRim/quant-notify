import { describe, expect, it } from "vitest";
import { createAuthService, type AuthRepository, type OtpSmsSender } from "../modules/auth/service";

const createRepo = () => {
  const state: {
    challenges: Array<{
      phoneE164: string;
      codeHash: string;
      expiresAt: string;
      attemptCount: number;
      consumedAt?: string;
    }>;
  } = {
    challenges: []
  };

  const repo: AuthRepository = {
    async replaceOtpChallenge(input) {
      state.challenges = [
        {
          phoneE164: input.phoneE164,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          attemptCount: 0
        }
      ];
    },
    async findActiveOtpChallengeByPhone(phoneE164) {
      return state.challenges.find((entry) => entry.phoneE164 === phoneE164);
    },
    async incrementOtpAttempt() {
      return;
    },
    async consumeOtpChallenge(phoneE164) {
      state.challenges = state.challenges.map((entry) =>
        entry.phoneE164 === phoneE164
          ? { ...entry, consumedAt: new Date().toISOString() }
          : entry
      );
    },
    async findUserByPhone() {
      return undefined;
    },
    async findUserById() {
      return undefined;
    },
    async createUserForPhone() {
      return {
        id: "user-1",
        phoneE164: "+821012345678"
      };
    },
    async createAuthSession() {
      return {
        id: "session-1"
      };
    }
  };

  return { repo, state };
};

describe("createAuthService.startOtp", () => {
  it("hashes the OTP code before storing it and sends SMS via the sender", async () => {
    const { repo, state } = createRepo();
    const sent: Array<{ to: string; message: string }> = [];
    const smsSender: OtpSmsSender = {
      async sendOtp(payload) {
        sent.push(payload);
      }
    };

    const service = createAuthService({
      repo,
      smsSender,
      now: () => new Date("2026-03-23T00:00:00.000Z"),
      generateOtpCode: () => "123456",
      generateToken: () => "refresh-token"
    });

    const result = await service.startOtp("010-1234-5678");

    expect(result.phoneE164).toBe("+821012345678");
    expect(result.maskedPhone).toBe("+8210****5678");
    expect(result.debugCode).toBe("123456");
    expect(state.challenges).toHaveLength(1);
    expect(state.challenges[0]?.codeHash).toBeDefined();
    expect(state.challenges[0]?.codeHash).not.toContain("123456");
    expect(sent).toEqual([
      {
        to: "+821012345678",
        message: "[LinguaCall] Your verification code is 123456"
      }
    ]);
  });
});
