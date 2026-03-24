import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createAuthRouter } from "../modules/auth/routes";
import { issueAccessToken } from "../modules/auth/session";
import type { AuthRepository, OtpSmsSender } from "../modules/auth/service";

const accessTokenSecret = "route-test-secret";

const createRepo = (): AuthRepository => {
  return {
    async replaceOtpChallenge() {
      return;
    },
    async findActiveOtpChallengeByPhone() {
      return undefined;
    },
    async incrementOtpAttempt() {
      return;
    },
    async consumeOtpChallenge() {
      return;
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
    async createAuthSession() {
      return {
        id: "session-1"
      };
    }
  };
};

describe("createAuthRouter", () => {
  it("returns the current user from an auth cookie", async () => {
    const app = express();
    app.use(express.json());
    const smsSender: OtpSmsSender = {
      async sendOtp() {
        return;
      }
    };
    app.use(
      "/auth",
      createAuthRouter({
        repo: createRepo(),
        smsSender,
        accessTokenSecret
      })
    );

    const accessToken = issueAccessToken(
      {
        userId: "user-1",
        sessionId: "session-1",
        expiresAt: "2099-03-23T01:00:00.000Z"
      },
      accessTokenSecret
    );

    const response = await request(app)
      .get("/auth/me")
      .set("Cookie", [`lc_access=${accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.data).toMatchObject({
      userId: "user-1",
      sessionId: "session-1"
    });
  });

  it("clears auth cookies on logout", async () => {
    const app = express();
    app.use(express.json());
    const smsSender: OtpSmsSender = {
      async sendOtp() {
        return;
      }
    };
    app.use(
      "/auth",
      createAuthRouter({
        repo: createRepo(),
        smsSender,
        accessTokenSecret
      })
    );

    const response = await request(app).post("/auth/logout");

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();
    const setCookie = response.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
    expect(cookieHeader).toContain("lc_access=");
    expect(cookieHeader).toContain("lc_refresh=");
  });
});
