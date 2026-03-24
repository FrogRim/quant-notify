import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequireAuthenticatedUser, type AuthenticatedRequest } from "../middleware/auth";
import { issueAccessToken } from "../modules/auth/session";

describe("createRequireAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates requests from app session cookies", async () => {
    const app = express();
    app.get(
      "/protected",
      createRequireAuthenticatedUser({
        accessTokenSecret: "middleware-secret",
        repo: {
          async findIdentityByUserId(userId) {
            return {
              userId,
              clerkUserId: "local:phone-user"
            };
          }
        }
      }),
      (req, res) => {
        const authReq = req as AuthenticatedRequest;
        res.json({
          ok: true,
          data: {
            userId: authReq.userId,
            clerkUserId: authReq.clerkUserId
          }
        });
      }
    );

    const accessToken = issueAccessToken(
      {
        userId: "user-123",
        sessionId: "session-123",
        expiresAt: "2099-01-01T00:00:00.000Z"
      },
      "middleware-secret"
    );

    const response = await request(app)
      .get("/protected")
      .set("Cookie", [`lc_access=${accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      userId: "user-123",
      clerkUserId: "local:phone-user"
    });
  });

  it("rejects requests without an app session cookie", async () => {
    const app = express();
    app.get(
      "/protected",
      createRequireAuthenticatedUser({
        accessTokenSecret: "middleware-secret",
        repo: {
          async findIdentityByUserId() {
            return undefined;
          }
        }
      }),
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: "forbidden",
        message: "authentication required"
      }
    });
  });
});
