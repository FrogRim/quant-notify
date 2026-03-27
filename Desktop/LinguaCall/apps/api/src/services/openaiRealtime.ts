import { SessionAccuracyPolicy } from "@lingua/shared";

const readEnv = (value?: string): string | undefined => {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
};

const readStringValue = (...candidates: unknown[]): string | undefined => {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized.length > 0) {
        return normalized;
      }
      continue;
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return undefined;
};

const readExpiresAt = (...candidates: unknown[]): string | undefined => {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized.length > 0) {
        return normalized;
      }
      continue;
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const epochMs = candidate > 1_000_000_000_000 ? candidate : candidate * 1000;
      return new Date(epochMs).toISOString();
    }
  }
  return undefined;
};

export type CreateOpenAIRealtimeSessionInput = {
  sessionId: string;
  callId: string;
  clerkUserId: string;
  language: string;
  exam: string;
  topic: string;
  level: string;
  durationMinutes: number;
  accuracyPolicy?: SessionAccuracyPolicy;
};

export type OpenAIRealtimeSession = {
  clientSecret: string;
  expiresAt?: string;
  model: string;
};

const REALTIME_LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  zh: "Mandarin Chinese",
  es: "Spanish",
  ja: "Japanese",
  fr: "French"
};

const buildConversationPolicyParts = (accuracyPolicy?: SessionAccuracyPolicy) => [
  "Prioritize keeping the conversation moving naturally until the topic feels complete.",
  "Respond to the learner's meaning first, then ask one short follow-up that keeps the topic going.",
  "Do not correct every turn.",
  "Favor conversation flow over pronunciation coaching.",
  "Only give a brief correction when the mistake blocks comprehension, repeats several times, or there is a natural pause.",
  "If you correct, place the correction after your response instead of before it.",
  `Use at most ${accuracyPolicy?.maxAssistantSentences ?? 3} short sentences per turn.`,
  `Ask at most ${accuracyPolicy?.maxAssistantQuestionsPerTurn ?? 1} question per turn.`,
  "Speak slightly slower than natural conversational speed and leave a short pause between sentences.",
  "If you are unsure, ask a short clarifying question instead of guessing."
];

const resolveTranscriptionLanguage = (language: string): string | undefined => {
  const normalized = language.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
};

export const buildRealtimeTranscriptionConfig = (
  input: CreateOpenAIRealtimeSessionInput,
  model: string
) => {
  const languageName = REALTIME_LANGUAGE_NAMES[input.language] ?? "the selected target language";
  const transcriptionLanguage = resolveTranscriptionLanguage(input.language);

  return {
    model,
    ...(transcriptionLanguage ? { language: transcriptionLanguage } : {}),
    prompt: [
      `Transcribe the learner faithfully in ${languageName}.`,
      "Preserve hesitations, incomplete phrases, and imperfect grammar.",
      "Do not translate or rewrite the learner's wording.",
      "Prefer the selected learning language unless the learner clearly switches languages."
    ].join(" ")
  };
};

export const buildRealtimeTurnDetectionConfig = () => ({
  type: "semantic_vad" as const,
  eagerness: "low" as const,
  create_response: true,
  interrupt_response: true
});

const buildGermanInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes, accuracyPolicy } = input;
  const parts = [
    "Du bist LinguaCall, ein Sprachpartner fuer die Goethe-Zertifikat-B2-Sprechpruefung.",
    "Fuehre das Gespraech ausschliesslich auf Deutsch.",
    "Beginne die Sitzung mit dem ersten Satz auf Deutsch.",
    "Bleibe beim aktuellen Thema und wechsle das Thema nur, wenn der Lernende das ausdruecklich verlangt.",
    `Thema der Sitzung: ${topic}.`,
    `Sprachniveau des Lernenden: ${level}, Ziel Goethe B2.`,
    `Sitzungsdauer: ${durationMinutes} Minuten.`
  ];
  parts.push(...buildConversationPolicyParts(accuracyPolicy));
  if (accuracyPolicy?.allowedSubtopicHints.length) {
    parts.push(`Bevorzuge diese Teilthemen, wenn sie passen: ${accuracyPolicy.allowedSubtopicHints.join(", ")}.`);
  }
  if (accuracyPolicy?.forbiddenDomainHints.length) {
    parts.push(`Vermeide unpassende Themenwechsel wie: ${accuracyPolicy.forbiddenDomainHints.join(", ")}.`);
  }
  return parts.join(" ");
};

const buildChineseInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes, accuracyPolicy } = input;
  const parts = [
    "You are LinguaCall, a live Mandarin Chinese speaking practice partner for HSK 5 preparation.",
    "Conduct the entire conversation only in Mandarin Chinese.",
    "Open the session with the first sentence in Mandarin Chinese.",
    "Stay on the current topic unless the learner explicitly asks to change it.",
    `Session topic: ${topic}.`,
    `Learner level: ${level}, target HSK 5.`,
    `Session duration: ${durationMinutes} minutes.`
  ];
  parts.push(...buildConversationPolicyParts(accuracyPolicy));
  if (accuracyPolicy?.allowedSubtopicHints.length) {
    parts.push(`Prefer these subtopic cues when they fit: ${accuracyPolicy.allowedSubtopicHints.join(", ")}.`);
  }
  if (accuracyPolicy?.forbiddenDomainHints.length) {
    parts.push(`Avoid drifting into unrelated domains such as: ${accuracyPolicy.forbiddenDomainHints.join(", ")}.`);
  }
  return parts.join(" ");
};

const buildSpanishInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes, accuracyPolicy } = input;
  const parts = [
    "Eres LinguaCall, un companero de practica oral orientado al examen DELE B1.",
    "Manten toda la conversacion en espanol.",
    "Empieza la sesion con la primera frase en espanol.",
    "Manten el tema actual y no cambies de tema salvo que el estudiante lo pida de forma explicita.",
    `Tema de la sesion: ${topic}.`,
    `Nivel del estudiante: ${level}, objetivo DELE B1.`,
    `Duracion de la sesion: ${durationMinutes} minutos.`
  ];
  parts.push(...buildConversationPolicyParts(accuracyPolicy));
  if (accuracyPolicy?.allowedSubtopicHints.length) {
    parts.push(`Prefiere estas pistas de subtema cuando encajen: ${accuracyPolicy.allowedSubtopicHints.join(", ")}.`);
  }
  if (accuracyPolicy?.forbiddenDomainHints.length) {
    parts.push(`Evita desviarte hacia dominios no relacionados como: ${accuracyPolicy.forbiddenDomainHints.join(", ")}.`);
  }
  return parts.join(" ");
};

const buildEnglishInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes, accuracyPolicy } = input;
  const rules = [
    "You are LinguaCall, a live English speaking practice partner for OPIC preparation.",
    "Conduct the entire conversation only in English.",
    "Open the session with the first sentence in English.",
    `Keep the learner on the current topic: ${topic}.`,
    `Target learner level: ${level}.`,
    `Target session duration: ${durationMinutes} minutes.`,
    "Do not switch to a new topic unless the learner explicitly asks to change the topic.",
    "Stay concise and interactive."
  ];
  rules.push(...buildConversationPolicyParts(accuracyPolicy));
  if (accuracyPolicy?.allowedSubtopicHints.length) {
    rules.push(`Prefer these subtopic cues when useful: ${accuracyPolicy.allowedSubtopicHints.join(", ")}.`);
  }
  if (accuracyPolicy?.forbiddenDomainHints.length) {
    rules.push(`Avoid drifting into unrelated domains such as: ${accuracyPolicy.forbiddenDomainHints.join(", ")}.`);
  }
  return rules.join(" ");
};

const buildJapaneseInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes, accuracyPolicy } = input;
  const parts = [
    "You are LinguaCall, a live Japanese speaking practice partner for JLPT N2 preparation.",
    "Conduct the entire conversation only in Japanese.",
    "Open the session with the first sentence in Japanese.",
    "Stay on the current topic unless the learner explicitly asks to change it.",
    `Session topic: ${topic}.`,
    `Learner level: ${level}, target JLPT N2.`,
    `Session duration: ${durationMinutes} minutes.`
  ];
  parts.push(...buildConversationPolicyParts(accuracyPolicy));
  if (accuracyPolicy?.allowedSubtopicHints.length) {
    parts.push(`Prefer these subtopic cues when they fit: ${accuracyPolicy.allowedSubtopicHints.join(", ")}.`);
  }
  if (accuracyPolicy?.forbiddenDomainHints.length) {
    parts.push(`Avoid drifting into unrelated domains such as: ${accuracyPolicy.forbiddenDomainHints.join(", ")}.`);
  }
  return parts.join(" ");
};

const buildFrenchInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes, accuracyPolicy } = input;
  const parts = [
    "Tu es LinguaCall, un partenaire de pratique orale pour la preparation au DELF B1.",
    "Conduis toute la conversation en francais.",
    "Commence la session avec la premiere phrase en francais.",
    "Reste sur le sujet actuel et ne changes de sujet que si l'apprenant le demande explicitement.",
    `Sujet de la session : ${topic}.`,
    `Niveau de l'apprenant : ${level}, objectif DELF B1.`,
    `Duree de la session : ${durationMinutes} minutes.`
  ];
  parts.push(...buildConversationPolicyParts(accuracyPolicy));
  if (accuracyPolicy?.allowedSubtopicHints.length) {
    parts.push(`Privilegie ces pistes de sous-sujet si elles sont pertinentes : ${accuracyPolicy.allowedSubtopicHints.join(", ")}.`);
  }
  if (accuracyPolicy?.forbiddenDomainHints.length) {
    parts.push(`Evite de deriver vers des domaines non lies comme : ${accuracyPolicy.forbiddenDomainHints.join(", ")}.`);
  }
  return parts.join(" ");
};

export const buildInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { language, exam } = input;

  if (language === "de" && exam === "goethe_b2") {
    return buildGermanInstructions(input);
  }

  if (language === "zh" && exam === "hsk5") {
    return buildChineseInstructions(input);
  }

  if (language === "es" && exam === "dele_b1") {
    return buildSpanishInstructions(input);
  }

  if (language === "en" && exam === "opic") {
    return buildEnglishInstructions(input);
  }

  if (language === "ja" && exam === "jlpt_n2") {
    return buildJapaneseInstructions(input);
  }

  if (language === "fr" && exam === "delf_b1") {
    return buildFrenchInstructions(input);
  }

  return buildEnglishInstructions(input);
};

export const createOpenAIRealtimeSession = async (
  input: CreateOpenAIRealtimeSessionInput
): Promise<OpenAIRealtimeSession> => {
  const apiKey = readEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const model = readEnv(process.env.OPENAI_REALTIME_MODEL) ?? "gpt-realtime-mini";
  const voice = readEnv(process.env.OPENAI_REALTIME_VOICE) ?? "marin";
  const transcriptionModel = readEnv(process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL) ?? "gpt-4o-mini-transcribe";
  const sessionUrl = readEnv(process.env.OPENAI_REALTIME_SESSION_URL) ?? "https://api.openai.com/v1/realtime/sessions";

  const response = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      voice,
      speed: 0.9,
      modalities: ["audio", "text"],
      instructions: buildInstructions(input),
      input_audio_transcription: buildRealtimeTranscriptionConfig(input, transcriptionModel),
      turn_detection: buildRealtimeTurnDetectionConfig()
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`failed_to_create_realtime_session: ${response.status} ${text}`.trim());
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const sessionPayload = asRecord(payload.session);
  const clientSecretPayload = asRecord(payload.client_secret) ?? asRecord(sessionPayload?.client_secret);
  const secretPayload = asRecord(payload.secret) ?? asRecord(sessionPayload?.secret);
  const ephemeralPayload =
    asRecord(payload.ephemeral_key) ??
    asRecord(payload.ephemeralKey) ??
    asRecord(sessionPayload?.ephemeral_key) ??
    asRecord(sessionPayload?.ephemeralKey);

  const clientSecretValue = readStringValue(
    clientSecretPayload?.value,
    clientSecretPayload?.secret,
    payload.client_secret,
    secretPayload?.value,
    secretPayload?.secret,
    payload.secret,
    ephemeralPayload?.value,
    ephemeralPayload?.secret,
    payload.clientSecret,
    payload.token,
    sessionPayload?.client_secret,
    sessionPayload?.clientSecret,
    sessionPayload?.token
  );

  if (!clientSecretValue) {
    throw new Error("realtime_session_missing_client_secret");
  }

  const expiresAt = readExpiresAt(
    clientSecretPayload?.expires_at,
    clientSecretPayload?.expiresAt,
    secretPayload?.expires_at,
    secretPayload?.expiresAt,
    ephemeralPayload?.expires_at,
    ephemeralPayload?.expiresAt,
    payload.expires_at,
    payload.expiresAt,
    sessionPayload?.expires_at,
    sessionPayload?.expiresAt
  );

  const resolvedModel = readStringValue(payload.model, sessionPayload?.model, model) ?? model;

  return {
    clientSecret: clientSecretValue,
    expiresAt,
    model: resolvedModel
  };
};
