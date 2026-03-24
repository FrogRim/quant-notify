import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
  expiresAt: string;
}

const encodeBase64Url = (value: string) =>
  Buffer.from(value, "utf8").toString("base64url");

const sign = (value: string, secret: string) =>
  createHmac("sha256", secret).update(value).digest("base64url");

export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const issueAccessToken = (payload: AccessTokenPayload, secret: string) => {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
};

export const verifyAccessToken = (
  token: string,
  secret: string
): AccessTokenPayload | undefined => {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return undefined;
  }

  const expectedSignature = sign(encodedPayload, secret);
  try {
    if (
      !timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(expectedSignature, "utf8")
      )
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8")
  ) as AccessTokenPayload;

  if (!payload.userId || !payload.sessionId || !payload.expiresAt) {
    return undefined;
  }

  if (Date.parse(payload.expiresAt) <= Date.now()) {
    return undefined;
  }

  return payload;
};
