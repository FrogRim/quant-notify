import { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";

export interface AuthenticatedRequest extends Request {
  clerkUserId: string;
}

export function requireClerkUser(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({
      ok: false,
      error: { code: "forbidden", message: "authentication required" }
    });
    return;
  }
  (req as AuthenticatedRequest).clerkUserId = userId;
  next();
}
