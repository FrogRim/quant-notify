import rateLimit from "express-rate-limit";
import type { Request } from "express";

type AuthenticatedRateLimitOptions = {
  windowMs: number;
  max: number;
  message: string;
};

const keyForRequest = (req: Request) => {
  const maybeUserId = Reflect.get(req, "clerkUserId");
  if (typeof maybeUserId === "string" && maybeUserId.trim()) {
    return `user:${maybeUserId.trim()}`;
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${ip}`;
};

export const createAuthenticatedRateLimiter = ({
  windowMs,
  max,
  message
}: AuthenticatedRateLimitOptions) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyForRequest,
    message: { ok: false, error: { code: "rate_limited", message } }
  });
