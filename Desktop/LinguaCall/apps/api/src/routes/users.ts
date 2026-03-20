import { Response, Router } from "express";
import { z } from "zod";
import { ApiError, ApiResponse, UserProfile } from "@lingua/shared";
import rateLimit from "express-rate-limit";
import { store } from "../storage/inMemoryStore";
import { requireClerkUser, AuthenticatedRequest } from "../middleware/auth";

const phoneOtpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "rate_limited", message: "phone OTP rate limit exceeded" } }
});

const router = Router();

router.get("/me", requireClerkUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<UserProfile>>) => {
  try {
    const user = await store.getUserByClerk(req.clerkUserId);
    if (!user) {
      res.status(404).json({
        ok: false,
        error: { code: "not_found", message: "user_not_found" }
      });
      return;
    }
    res.json({ ok: true, data: user });
  } catch (error) {
    console.error("[users/me] failed_to_load_user", {
      clerkUserId: req.clerkUserId,
      error
    });
    res.status(500).json({
      ok: false,
      error: { code: "validation_error", message: "failed_to_load_user" }
    });
  }
});

const UpsertUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email()
});

router.post("/me", requireClerkUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<UserProfile>>) => {
  const parsed = UpsertUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: parsed.error.errors[0]?.message ?? "invalid_request" } });
    return;
  }
  try {
    const { name, email } = parsed.data;
    const user = await store.upsertUser(req.clerkUserId, { name, email });
    res.status(201).json({ ok: true, data: user });
  } catch (error) {
    console.error("[users/me] failed_to_upsert_user", {
      clerkUserId: req.clerkUserId,
      body: req.body,
      error
    });
    res.status(500).json({
      ok: false,
      error: { code: "validation_error", message: "failed_to_upsert_user" }
    });
  }
});

const UiLanguageSchema = z.object({
  uiLanguage: z.enum(["en", "ko", "ja", "zh", "de", "es", "fr"])
});

router.patch("/me/ui-language", requireClerkUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<UserProfile>>) => {
  const parsed = UiLanguageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "uiLanguage must be one of: en, ko, ja, zh, de, es, fr" } });
    return;
  }
  try {
    const user = await store.updateUiLanguage(req.clerkUserId, parsed.data.uiLanguage);
    res.json({ ok: true, data: user });
  } catch (error) {
    console.error("[users/me/ui-language] failed", { clerkUserId: req.clerkUserId, error });
    res.status(500).json({ ok: false, error: { code: "validation_error", message: "failed_to_update_ui_language" } });
  }
});

const PhoneStartSchema = z.object({ phone: z.string().min(8) });

router.post("/phone/start", phoneOtpLimiter, requireClerkUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<{ maskedPhone: string; debugCode: string }>>) => {
  const parsed = PhoneStartSchema.safeParse(req.body);
  if (!parsed.success) {
    const error: ApiError = { code: "validation_error", message: "phone is required (min 8 chars)" };
    res.status(422).json({ ok: false, error });
    return;
  }
  const { phone } = parsed.data;
  try {
    const result = await store.startPhoneVerification(req.clerkUserId, phone);
    res.status(200).json({
      ok: true,
      data: { maskedPhone: result.maskedPhone, debugCode: result.debugCode }
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: { code: "validation_error", message: "failed_to_send_verification" } });
  }
});

router.post("/phone/confirm", requireClerkUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<UserProfile>>) => {
  const { phone, code } = req.body ?? {};
  if (typeof phone !== "string" || typeof code !== "string") {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "phone and code are required" } });
    return;
  }
  const ok = await store.confirmPhoneVerification(req.clerkUserId, phone, code);
  if (!ok) {
    res.status(401).json({ ok: false, error: { code: "validation_error", message: "invalid_verification_code_or_expired" } });
    return;
  }
  const user = await store.getUserByClerk(req.clerkUserId);
  res.status(200).json({ ok: true, data: user! });
});

export default router;
