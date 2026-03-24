import { describe, expect, it } from "vitest";
import {
  createAuthService,
  type AuthRepository,
  type OtpChallengeRecord,
  type OtpSmsSender
} from "../modules/auth/service";
import { hashToken, issueAccessToken, verifyAccessToken } from "../modules/auth/session";

const accessTokenSecret = "test-secret";

const createRepo = () => {
  let challenge: OtpChallengeRecord | undefined = {
    phoneE164: "+821012345678",
    codeHash: hashToken("123456"),
    expiresAt: "2026-03-23T00:05:00.000Z",
    attemptCount: 0
  };

  let createdSession:
    | {
      userId: string;
      refreshTokenHash: string;
      expiresAt: string;
      userAgent?: string;
      ip?: string;
    }
    | undefined;

  const repo: AuthRepository = {
    async replaceOtpChallenge() {
      return;
    },
    async findActiveOtpChallengeByPhone() {
      return challenge;
    },
    async incrementOtpAttempt() {
      if (challenge) {
        challenge = { ...challenge, attemptCount: challenge.attemptCount + 1 };
      }
    },
    async consumeOtpChallenge() {
      if (challenge) {
        challenge = { ...challenge, consumedAt: "2026-03-23T00:01:00.000Z" };
      }
    },
    async findUserByPhone() {
      return undefined;
    },
    async findUserById(userId) {
      return {
        id: userId,
        phoneE164: "+821012345678"
      };
    },
    async createUserForPhone(phoneE164) {
      return {
        id: "user-1",
        phoneE164
      };
    },
    async createAuthSession(input) {
      createdSession = input;
      return {
        id: "session-1"
      };
    }
  };

  return {
    repo,
    getCreatedSession: () => createdSession
  };
};

describe("createAuthService.verifyOtp", () => {
  it("creates an auth session after a valid OTP verification", async () => {
    const { repo, getCreatedSession } = createRepo();
    const smsSender: OtpSmsSender = {
      async sendOtp() {
        return;
      }
    };

    const service = createAuthService({
      repo,
      smsSender,
      now: () => new Date("2026-03-23T00:00:00.000Z"),
      generateOtpCode: () => "654321",
      generateToken: () => "refresh-token",
      accessTokenSecret
    });

    const result = await service.verifyOtp({
      phone: "01012345678",
      code: "123456",
      userAgent: "vitest",
      ip: "127.0.0.1"
    });

    expect(result.user.id).toBe("user-1");
    expect(result.sessionId).toBe("session-1");
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBe("refresh-token");
    expect(getCreatedSession()).toMatchObject({
      userId: "user-1",
      refreshTokenHash: hashToken("refresh-token"),
      userAgent: "vitest",
      ip: "127.0.0.1"
    });
  });
});

describe("auth session token helpers", () => {
  it("issues and verifies signed access tokens", () => {
    const token = issueAccessToken(
      {
        userId: "user-1",
        sessionId: "session-1",
        expiresAt: "2099-03-23T01:00:00.000Z"
      },
      accessTokenSecret
    );

    const parsed = verifyAccessToken(token, accessTokenSecret);

    expect(parsed).toMatchObject({
      userId: "user-1",
      sessionId: "session-1"
    });
  });
});
