import { Router, Request, Response } from "express";
import { ApiResponse } from "@lingua/shared";
import { requireAuthenticatedUser, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

type DictEntry = { pos: string; meaning: string; example: string };

// In-process memory cache: "lang:word" → DictEntry
const cache = new Map<string, DictEntry>();

router.get("/", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<DictEntry>>) => {
  const word = String((req as Request).query.word ?? "").trim().toLowerCase();
  const lang = String((req as Request).query.lang ?? "en").trim().toLowerCase();

  if (!word) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "word is required" } });
    return;
  }

  const cacheKey = `${lang}:${word}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    res.json({ ok: true, data: cached });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ ok: false, error: { code: "validation_error", message: "dictionary service unavailable" } });
    return;
  }

  const langNames: Record<string, string> = {
    en: "English", de: "German", zh: "Chinese (Mandarin)",
    es: "Spanish", ja: "Japanese", fr: "French", ko: "Korean"
  };
  const langName = langNames[lang] ?? "English";

  const prompt = `You are a concise dictionary. For the ${langName} word "${word}", reply with ONLY valid JSON in this exact shape (no extra text):
{"pos":"<part of speech>","meaning":"<brief definition in Korean>","example":"<one short example sentence in ${langName}>"}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0
      })
    });

    if (!response.ok) {
      res.status(502).json({ ok: false, error: { code: "validation_error", message: "upstream error" } });
      return;
    }

    const json = await response.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const entry = JSON.parse(raw) as DictEntry;

    if (!entry.pos || !entry.meaning) {
      throw new Error("invalid shape");
    }

    cache.set(cacheKey, entry);
    res.json({ ok: true, data: entry });
  } catch {
    res.status(502).json({ ok: false, error: { code: "validation_error", message: "failed to look up word" } });
  }
});

export default router;
