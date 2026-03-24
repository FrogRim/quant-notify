import { Request, Response, Router } from "express";
import { ApiResponse } from "@lingua/shared";
import { AUTH_ACCESS_COOKIE, clearAuthCookies, setAuthCookies } from "./cookies";
import { StartOtpSchema, VerifyOtpSchema } from "./schema";
import { createAuthService, type AuthRepository, type OtpSmsSender } from "./service";
import { createPgAuthRepository } from "./repository";
import { createNaverSmsSender } from "./naverSms";

const createFallbackSmsSender = () => {
  return {
    async sendOtp(payload: { to: string; message: string }) {
      if (process.env.NODE_ENV !== "production") {
        console.log("auth.otp.sms", payload);
        return;
      }
      throw new Error("NAVER SMS sender is not configured");
    }
  };
};

const createDefaultSmsSender = (): OtpSmsSender => {
  const serviceId = process.env.NAVER_SMS_SERVICE_ID?.trim();
  const accessKey = process.env.NAVER_SMS_ACCESS_KEY?.trim();
  const secretKey = process.env.NAVER_SMS_SECRET_KEY?.trim();
  const from = process.env.NAVER_SMS_FROM?.trim();

  if (serviceId && accessKey && secretKey && from) {
    return createNaverSmsSender({
      serviceId,
      accessKey,
      secretKey,
      from
    });
  }

  return createFallbackSmsSender();
};

type CreateAuthRouterOptions = {
  repo?: AuthRepository;
  smsSender?: OtpSmsSender;
  accessTokenSecret?: string;
};

const readCookie = (cookieHeader: string | undefined, name: string) => {
  if (!cookieHeader) {
    return undefined;
  }
  const match = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  if (!match) {
    return undefined;
  }
  return decodeURIComponent(match.slice(name.length + 1));
};

export const createAuthRouter = (options: CreateAuthRouterOptions = {}) => {
  const router = Router();
  const defaultRepo = (() => {
    if (options.repo) {
      return options.repo;
    }
    const { store } = require("../../storage/inMemoryStore") as typeof import("../../storage/inMemoryStore");
    return createPgAuthRepository(store.getPool());
  })();
  const authService = createAuthService({
    repo: defaultRepo,
    smsSender: options.smsSender ?? createDefaultSmsSender(),
    accessTokenSecret: options.accessTokenSecret
  });

  router.post("/otp/start", async (req: Request, res: Response<ApiResponse<{ maskedPhone: string }>>) => {
    const parsed = StartOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        ok: false,
        error: { code: "validation_error", message: "phone is required" }
      });
      return;
    }

    try {
      const result = await authService.startOtp(parsed.data.phone);
      res.json({
        ok: true,
        data: {
          maskedPhone: result.maskedPhone
        }
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: {
          code: "validation_error",
          message: error instanceof Error ? error.message : "failed_to_start_otp"
        }
      });
    }
  });

  router.post("/otp/verify", async (req: Request, res: Response) => {
    const parsed = VerifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        ok: false,
        error: { code: "validation_error", message: "phone and code are required" }
      });
      return;
    }

    try {
      const result = await authService.verifyOtp({
        phone: parsed.data.phone,
        code: parsed.data.code,
        userAgent: req.get("user-agent") ?? undefined,
        ip: req.ip
      });
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      });
      res.json({
        ok: true,
        data: {
          userId: result.user.id,
          sessionId: result.sessionId
        }
      });
    } catch (error) {
      res.status(401).json({
        ok: false,
        error: {
          code: "validation_error",
          message: error instanceof Error ? error.message : "failed_to_verify_otp"
        }
      });
    }
  });

  router.get("/me", async (req: Request, res: Response) => {
    const accessToken = readCookie(req.headers.cookie, AUTH_ACCESS_COOKIE);
    if (!accessToken) {
      res.status(401).json({
        ok: false,
        error: { code: "forbidden", message: "authentication required" }
      });
      return;
    }

    const currentUser = await authService.getCurrentUser(accessToken);
    if (!currentUser) {
      res.status(401).json({
        ok: false,
        error: { code: "forbidden", message: "invalid session" }
      });
      return;
    }

    res.json({
      ok: true,
      data: {
        userId: currentUser.user.id,
        phoneE164: currentUser.user.phoneE164,
        sessionId: currentUser.sessionId
      }
    });
  });

  router.post("/logout", async (_req: Request, res: Response) => {
    clearAuthCookies(res);
    res.json({
      ok: true,
      data: { loggedOut: true }
    });
  });

  return router;
};
