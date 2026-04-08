import { Router, Request, Response } from "express";
import { ApiResponse } from "@lingua/shared";
import { requireAuthenticatedUser, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

type TranslateResult = { translation: string };

const cache = new Map<string, string>();

const LANG_NAMES: Record<string, string> = {
  ko: "Korean",
  en: "English",
  de: "German",
  zh: "Chinese (Simplified)",
  es: "Spanish",
  ja: "Japanese",
  fr: "French"
};

router.post(
  "/",
  requireAuthenticatedUser,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<TranslateResult>>) => {
    const text = String((req as Request).body?.text ?? "").trim().slice(0, 1000);
    const targetLang = String((req as Request).body?.targetLang ?? "ko")
      .trim()
      .toLowerCase()
      .slice(0, 8);

    if (!text) {
      res.status(422).json({ ok: false, error: { code: "validation_error", message: "text is required" } });
      return;
    }

    const cacheKey = `${targetLang}:${text}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.json({ ok: true, data: { translation: cached } });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ ok: false, error: { code: "validation_error", message: "translation service unavailable" } });
      return;
    }

    const langName = LANG_NAMES[targetLang] ?? "Korean";

    const prompt = `Translate the following text into ${langName}. Reply with ONLY the translated text, no explanation, no quotes:\n\n${text}`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
          temperature: 0
        })
      });

      if (!response.ok) {
        res.status(502).json({ ok: false, error: { code: "validation_error", message: "translation failed" } });
        return;
      }

      const json = await response.json() as { choices?: { message?: { content?: string } }[] };
      const translation = json.choices?.[0]?.message?.content?.trim() ?? "";

      if (!translation) {
        throw new Error("empty translation");
      }

      cache.set(cacheKey, translation);
      res.json({ ok: true, data: { translation } });
    } catch {
      res.status(502).json({ ok: false, error: { code: "validation_error", message: "translation failed" } });
    }
  }
);

export default router;
