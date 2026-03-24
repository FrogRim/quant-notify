import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../modules/auth/session";

export interface AuthenticatedRequest extends Request {
  userId: string;
  clerkUserId: string;
  sessionId?: string;
}

type AuthIdentity = {
  userId: string;
  clerkUserId: string;
};

type AuthMiddlewareRepository = {
  findIdentityByUserId(userId: string): Promise<AuthIdentity | undefined>;
};

type CreateRequireAuthenticatedUserOptions = {
  repo?: AuthMiddlewareRepository;
  accessTokenSecret?: string;
};

const AUTH_ACCESS_COOKIE = "lc_access";

const readCookie = (cookieHeader: string | undefined, name: string) => {
  if (!cookieHeader) {
    return undefined;
  }
  const pair = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  if (!pair) {
    return undefined;
  }
  return decodeURIComponent(pair.slice(name.length + 1));
};

const createDefaultRepo = (): AuthMiddlewareRepository => {
  const { store } = require("../storage/inMemoryStore") as typeof import("../storage/inMemoryStore");
  return {
    async findIdentityByUserId(userId: string) {
      const result = await store.getPool().query<{ id: string; clerk_user_id: string }>(
        "SELECT id, clerk_user_id FROM users WHERE id = $1 LIMIT 1",
        [userId]
      );
      if (!result.rows.length) {
        return undefined;
      }
      return {
        userId: result.rows[0].id,
        clerkUserId: result.rows[0].clerk_user_id
      };
    }
  };
};

export function createRequireAuthenticatedUser(
  options: CreateRequireAuthenticatedUserOptions = {}
) {
  const accessTokenSecret =
    options.accessTokenSecret ?? process.env.SESSION_COOKIE_SECRET ?? "dev-session-secret";

  return async function requireAuthenticatedUser(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const accessToken = readCookie(req.headers.cookie, AUTH_ACCESS_COOKIE);
    if (accessToken) {
      const payload = verifyAccessToken(accessToken, accessTokenSecret);
      if (payload) {
        const repo = options.repo ?? createDefaultRepo();
        const identity = await repo.findIdentityByUserId(payload.userId);
        if (identity) {
          const authReq = req as AuthenticatedRequest;
          authReq.userId = identity.userId;
          authReq.clerkUserId = identity.clerkUserId;
          authReq.sessionId = payload.sessionId;
          next();
          return;
        }
      }
    }

    res.status(401).json({
      ok: false,
      error: { code: "forbidden", message: "authentication required" }
    });
  };
}

export const requireAuthenticatedUser = createRequireAuthenticatedUser();
