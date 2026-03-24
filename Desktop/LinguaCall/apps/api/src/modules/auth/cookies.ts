import { Response } from "express";

export const AUTH_ACCESS_COOKIE = "lc_access";
export const AUTH_REFRESH_COOKIE = "lc_refresh";

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
};

export const setAuthCookies = (
  res: Response,
  payload: {
    accessToken: string;
    refreshToken: string;
  }
) => {
  res.cookie(AUTH_ACCESS_COOKIE, payload.accessToken, {
    ...baseCookieOptions,
    maxAge: 60 * 60 * 1000
  });
  res.cookie(AUTH_REFRESH_COOKIE, payload.refreshToken, {
    ...baseCookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(AUTH_ACCESS_COOKIE, baseCookieOptions);
  res.clearCookie(AUTH_REFRESH_COOKIE, baseCookieOptions);
};
