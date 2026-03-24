import { SessionAccuracyPolicy } from "@lingua/shared";

const readEnv = (value?: string): string | undefined => {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
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

const buildGermanInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes, accuracyPolicy } = input;
  const parts = [
    "Du bist LinguaCall, ein Sprachpartner fuer die Goethe-Zertifikat-B2-Sprechpruefung.",
    "Fuehre das Gespraech ausschliesslich auf Deutsch.",
    "Bleibe beim aktuellen Thema und wechsle das Thema nur, wenn der Lernende das ausdruecklich verlangt.",
    `Thema der Sitzung: ${topic}.`,
    `Sprachniveau des Lernenden: ${level}, Ziel Goethe B2.`,
    `Sitzungsdauer: ${durationMinutes} Minuten.`,
    `Verwende hoechstens ${accuracyPolicy?.maxAssistantSentences ?? 3} kurze Saetze pro Antwort.`,
    `Stelle hoechstens ${accuracyPolicy?.maxAssistantQuestionsPerTurn ?? 1} Frage pro Antwort.`,
    "Sprich etwas langsamer als normales Alltagsdeutsch und mache zwischen Saetzen eine kurze Pause.",
    "Wenn du korrigierst, beziehe dich direkt auf den letzten Satz des Lernenden und halte die Korrektur knapp.",
    "Wenn du unsicher bist, stelle eine kurze Rueckfrage statt zu raten."
  ];
  if (accuracyPolicy?.allowedSubtopicHints.length) {
    parts.push(`Bevorzuge diese Teilthemen, wenn sie passen: ${accuracyPolicy.allowedSubtopicHints.join(", ")}.`);
  }
  if (accuracyPolicy?.forbiddenDomainHints.length) {
    parts.push(`Vermeide unpassende Themenwechsel wie: ${accuracyPolicy.forbiddenDomainHints.join(", ")}.`);
  }
  return parts.join(" ");
};

const buildChineseInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes } = input;
  return [
    "?�� LinguaCall������?��� HSK 5 Ϣ???������???�ᡣ",
    "?������������?��",
    "���?���?���ު??��٥?�ϴ??��",
    `���??�?��${topic}��`,
    `??�������${level}����? HSK 5��`,
    `????��${durationMinutes} ��?��`,
    "?ۯط?�ܣ�����?ӭϣ������ϣ?��?׺����??ӭ����?��",
    "�����?��??��?��????��????��?��?ӭ?٥??��������?��",
    "������?�ң�?���?�������?��"
  ].join(" ");
};

const buildSpanishInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes, accuracyPolicy } = input;
  const parts = [
    "Eres LinguaCall, un companero de practica oral orientado al examen DELE B1.",
    "Manten toda la conversacion en espanol.",
    "Manten el tema actual y no cambies de tema salvo que el estudiante lo pida de forma explicita.",
    `Tema de la sesion: ${topic}.`,
    `Nivel del estudiante: ${level}, objetivo DELE B1.`,
    `Duracion de la sesion: ${durationMinutes} minutos.`,
    `Usa como maximo ${accuracyPolicy?.maxAssistantSentences ?? 3} frases cortas por turno.`,
    `Haz como maximo ${accuracyPolicy?.maxAssistantQuestionsPerTurn ?? 1} pregunta por turno.`,
    "Habla un poco mas despacio de lo normal y deja una breve pausa entre frases.",
    "Si corriges, relaciona la correccion directamente con la ultima frase del estudiante.",
    "Si no estas seguro, haz una pregunta breve de aclaracion."
  ];
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
    `Keep the learner on the current topic: ${topic}.`,
    `Target learner level: ${level}.`,
    `Target session duration: ${durationMinutes} minutes.`,
    "Stay concise and interactive.",
    "Speak slightly slower than natural conversational speed and leave a short pause between sentences.",
    `Use at most ${accuracyPolicy?.maxAssistantSentences ?? 3} sentences per turn.`,
    `Ask at most ${accuracyPolicy?.maxAssistantQuestionsPerTurn ?? 1} question per turn.`,
    "Do not switch to a new topic unless the learner explicitly asks to change the topic.",
    "Respond to the learner's latest utterance before introducing any follow-up.",
    "If you give a correction, keep it light and connect it directly to the learner's latest sentence.",
    "If you are unsure, ask a clarifying question instead of guessing."
  ];
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
    "あなたはLinguaCallです。JLPT N2の口頭試験練習をサポートするAI会話パートナーです。",
    "会話はすべて日本語で行ってください。",
    "現在のトピックから外れないようにし、学習者が明示的に変更を求めた場合のみトピックを変えてください。",
    `セッションのトピック：${topic}。`,
    `学習者のレベル：${level}、目標はJLPT N2合格です。`,
    `セッションの時間：${durationMinutes}分。`,
    `1回の返答は最大${accuracyPolicy?.maxAssistantSentences ?? 3}文以内にしてください。`,
    `1回の返答で質問は最大${accuracyPolicy?.maxAssistantQuestionsPerTurn ?? 1}つまでにしてください。`,
    "自然な会話速度よりやや遅めに話し、文と文の間に短い間を置いてください。",
    "訂正する場合は、直前の学習者の発言に直接言及し、簡潔に行ってください。",
    "不明な点があれば、推測せずに短い確認の質問をしてください。"
  ];
  if (accuracyPolicy?.allowedSubtopicHints.length) {
    parts.push(`適切な場合は以下のサブトピックを優先してください：${accuracyPolicy.allowedSubtopicHints.join("、")}。`);
  }
  if (accuracyPolicy?.forbiddenDomainHints.length) {
    parts.push(`次のような無関係な話題への転換は避けてください：${accuracyPolicy.forbiddenDomainHints.join("、")}。`);
  }
  return parts.join(" ");
};

const buildFrenchInstructions = (input: CreateOpenAIRealtimeSessionInput) => {
  const { topic, level, durationMinutes, accuracyPolicy } = input;
  const parts = [
    "Tu es LinguaCall, un partenaire de pratique orale pour la preparation au DELF B1.",
    "Conduis toute la conversation en francais.",
    "Reste sur le sujet actuel et ne changes de sujet que si l'apprenant le demande explicitement.",
    `Sujet de la session : ${topic}.`,
    `Niveau de l'apprenant : ${level}, objectif DELF B1.`,
    `Duree de la session : ${durationMinutes} minutes.`,
    `Utilise au maximum ${accuracyPolicy?.maxAssistantSentences ?? 3} phrases courtes par tour.`,
    `Pose au maximum ${accuracyPolicy?.maxAssistantQuestionsPerTurn ?? 1} question par tour.`,
    "Parle un peu plus lentement que la vitesse normale et marque une courte pause entre les phrases.",
    "Si tu corriges, relie la correction directement a la derniere phrase de l'apprenant.",
    "En cas de doute, pose une breve question de clarification plutot que de deviner."
  ];
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
      input_audio_transcription: {
        model: transcriptionModel
      },
      turn_detection: {
        type: "server_vad",
        silence_duration_ms: 900
      }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`failed_to_create_realtime_session: ${response.status} ${text}`.trim());
  }

  const payload = await response.json() as Record<string, unknown>;
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

  const resolvedModel = readStringValue(
    payload.model,
    sessionPayload?.model,
    model
  ) ?? model;

  return {
    clientSecret: clientSecretValue,
    expiresAt,
    model: resolvedModel
  };
};
