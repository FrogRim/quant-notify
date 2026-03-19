import {
  AccuracyValidationResult,
  Session,
  SessionAccuracyPolicy,
  SessionAccuracyState,
  WebVoiceTranscriptSegment
} from "@lingua/shared";

const VALIDATION_VERSION = "accuracy-v1";

const tokenize = (value: string): string[] => {
  const normalized = value.normalize("NFKC").toLowerCase();
  const matches = normalized.match(/\p{Script=Han}|[\p{L}\p{N}]+/gu);
  return matches?.map((token) => token.trim()).filter(Boolean) ?? [];
};

const uniqueTokens = (value: string): Set<string> => new Set(tokenize(value));

const countSentences = (value: string): number => {
  const parts = value
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length === 0 && value.trim().length > 0 ? 1 : parts.length;
};

const countQuestions = (value: string): number => (value.match(/\?/g) ?? []).length;

const overlapScore = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let hits = 0;
  for (const token of left) {
    if (right.has(token)) {
      hits += 1;
    }
  }
  return hits / Math.max(1, Math.min(left.size, right.size));
};

const DEFAULT_FORBIDDEN_BY_TOPIC: Array<{ match: string[]; hints: string[] }> = [
  {
    match: ["hospital", "doctor", "clinic", "symptom", "medicine", "krankenhaus", "arzt", "klinik", "sintoma", "sintoma", "medico", "medico", "?ßæ", "?êÂ", "ñø?"],
    hints: ["bank", "loan", "mortgage", "account", "investment", "kredit", "konto", "banco", "prestamo", "prestamo", "cuenta", "?ú¼", "?Î³", "??"]
  },
  {
    match: ["bank", "finance", "loan", "account", "money", "kredit", "konto", "banco", "prestamo", "prestamo", "cuenta", "?ú¼", "?Î³", "??"],
    hints: ["hospital", "doctor", "clinic", "symptom", "medicine", "krankenhaus", "arzt", "klinik", "sintoma", "sintoma", "medico", "medico", "?ßæ", "?êÂ", "ñø?"]
  },
  {
    match: ["interview", "job", "career", "resume", "bewerbung", "vorstellungsgesprach", "vorstellungsgesprach", "entrevista", "trabajo", "Øü?", "ÍïíÂ"],
    hints: ["hospital", "clinic", "symptom", "surgery", "krankenhaus", "klinik", "cirugia", "cirugia", "?êÂ", "â¢?"]
  },
  {
    match: ["travel", "trip", "airport", "hotel", "reise", "flughafen", "viaje", "aeropuerto", "Õéú¼", "Ïõ?", "ñĞïÁ"],
    hints: ["mortgage", "loan", "investment", "surgery", "hypothek", "kredit", "investition", "prestamo", "prestamo", "inversion", "inversion", "?Î³", "÷á?", "â¢?"]
  }
];

const CORRECTION_HINTS = [
  "you can say",
  "a better way",
  "more natural",
  "instead of",
  "better to say",
  "you should say",
  "du kannst sagen",
  "naturlicher ist",
  "naturlicher ist",
  "besser ist",
  "podrias decir",
  "podrias decir",
  "mas natural",
  "mas natural",
  "mejor seria",
  "mejor seria",
  "?Ê¦ì¤?",
  "ÌÚí»æÔîÜ?Ûö",
  "ÌÚû¿îÜøú?"
];

export const buildSessionAccuracyPolicy = (session: Pick<Session, "language" | "exam" | "topic">): SessionAccuracyPolicy => {
  const supportsStrictAccuracy =
    (session.language === "en" && session.exam === "opic") ||
    (session.language === "de" && session.exam === "goethe_b2") ||
    (session.language === "es" && session.exam === "dele_b1");

  const topicTokens = tokenize(session.topic);
  const forbiddenDomainHints =
    DEFAULT_FORBIDDEN_BY_TOPIC.find((entry) => entry.match.some((token) => topicTokens.includes(token)))?.hints ?? [];

  if (supportsStrictAccuracy) {
    return {
      topicLockEnabled: true,
      explicitTopicSwitchRequired: true,
      correctionMode: "light_inline",
      maxAssistantSentences: 3,
      maxAssistantQuestionsPerTurn: 1,
      enforceTopicRetention: true,
      enforceIntentAlignment: true,
      enforceCorrectionRelevance: true,
      forbiddenDomainHints,
      allowedSubtopicHints: topicTokens.slice(0, 8)
    };
  }

  if (session.language === "zh" && session.exam === "hsk5") {
    return {
      topicLockEnabled: true,
      explicitTopicSwitchRequired: true,
      correctionMode: "light_inline",
      maxAssistantSentences: 3,
      maxAssistantQuestionsPerTurn: 1,
      enforceTopicRetention: true,
      enforceIntentAlignment: false,
      enforceCorrectionRelevance: false,
      forbiddenDomainHints,
      allowedSubtopicHints: topicTokens.slice(0, 8)
    };
  }

  return {
    topicLockEnabled: false,
    explicitTopicSwitchRequired: false,
    correctionMode: "light_inline",
    maxAssistantSentences: 4,
    maxAssistantQuestionsPerTurn: 2,
    enforceTopicRetention: false,
    enforceIntentAlignment: false,
    enforceCorrectionRelevance: false,
    forbiddenDomainHints: [],
    allowedSubtopicHints: topicTokens.slice(0, 8)
  };
};

const detectCorrectionLikeTurn = (text: string) => {
  const normalized = text.toLowerCase();
  return CORRECTION_HINTS.some((hint) => normalized.includes(hint));
};

const buildAccuracyState = (result: AccuracyValidationResult): SessionAccuracyState => ({
  validationVersion: VALIDATION_VERSION,
  driftDetected: result.flags.some((flag) => flag.startsWith("topic_drift")),
  intentMismatchDetected: result.flags.some((flag) => flag.startsWith("intent_mismatch")),
  correctionMismatchDetected: result.flags.some((flag) => flag.startsWith("correction_mismatch")),
  lastValidatedAt: new Date().toISOString(),
  flags: result.flags
});

export const validateCompletedTranscript = (
  session: Pick<Session, "topic" | "language" | "exam">,
  transcript: WebVoiceTranscriptSegment[],
  policy: SessionAccuracyPolicy
): AccuracyValidationResult => {
  if (!policy.enforceTopicRetention && !policy.enforceIntentAlignment && !policy.enforceCorrectionRelevance) {
    return {
      ok: true,
      flags: [],
      fallbackRecommended: false
    };
  }

  const flags: string[] = [];
  const topicTokens = uniqueTokens(session.topic);
  const assistantTurns = transcript.filter((segment) => segment.role === "assistant" && segment.content.trim().length > 0);

  let driftScore = 1;
  let intentAlignmentScore = 1;
  let correctionAlignmentScore = 1;

  for (const assistantTurn of assistantTurns) {
    const assistantTokens = uniqueTokens(assistantTurn.content);
    const topicOverlap = overlapScore(topicTokens, assistantTokens);
    const forbiddenHits = policy.forbiddenDomainHints.filter((hint) => assistantTokens.has(hint.toLowerCase()));
    const sentences = countSentences(assistantTurn.content);
    const questions = countQuestions(assistantTurn.content);

    driftScore = Math.min(driftScore, topicOverlap);

    if (policy.enforceTopicRetention && topicTokens.size > 0 && topicOverlap === 0 && forbiddenHits.length > 0) {
      flags.push("topic_drift_detected");
    }

    if (sentences > policy.maxAssistantSentences) {
      flags.push("assistant_verbosity_exceeded");
    }

    if (questions > policy.maxAssistantQuestionsPerTurn) {
      flags.push("assistant_question_count_exceeded");
    }
  }

  for (let index = 0; index < transcript.length; index += 1) {
    const current = transcript[index];
    const next = transcript[index + 1];
    if (!current || !next || current.role !== "user" || next.role !== "assistant") {
      continue;
    }

    const currentTokens = uniqueTokens(current.content);
    const nextTokens = uniqueTokens(next.content);
    const pairOverlap = overlapScore(currentTokens, nextTokens);
    intentAlignmentScore = Math.min(intentAlignmentScore, pairOverlap);

    if (policy.enforceIntentAlignment && currentTokens.size > 0 && pairOverlap === 0) {
      flags.push("intent_mismatch_detected");
    }

    if (policy.enforceCorrectionRelevance && detectCorrectionLikeTurn(next.content)) {
      correctionAlignmentScore = Math.min(correctionAlignmentScore, pairOverlap);
      if (pairOverlap === 0) {
        flags.push("correction_mismatch_detected");
      }
    }
  }

  const uniqueFlags = [...new Set(flags)];
  return {
    ok: uniqueFlags.length === 0,
    flags: uniqueFlags,
    driftScore,
    intentAlignmentScore,
    correctionAlignmentScore,
    fallbackRecommended: uniqueFlags.some((flag) => flag === "topic_drift_detected" || flag === "intent_mismatch_detected")
  };
};

export const toAccuracyState = (result: AccuracyValidationResult): SessionAccuracyState =>
  buildAccuracyState(result);
