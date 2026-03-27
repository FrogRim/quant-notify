import { randomUUID } from "node:crypto";
import { ALLOWED_LANGUAGE_EXAM_PAIRS } from "../config/languageExam";
import { Pool, PoolClient } from "pg";
import {
  ContactMode,
  ExamType,
  FailureReason,
  LessonLanguage,
  ReportStatus,
  Report,
  Session,
  SessionStatus,
  CreateSessionPayload,
  StartCallResponse,
  TranscriptMessage,
  UserProfile,
  BillingPlan,
  UserSubscription,
  CreateCheckoutSessionPayload,
  BillingCheckoutSession,
  BillingWebhookPayload,
  ReportEvaluationSummary,
  ReportEvaluatorFluencyMetrics,
  ReportEvaluatorGrammarCorrection,
  ReportEvaluatorInput,
  CompleteWebVoiceCallPayload,
  WebVoiceRuntimeEventPayload,
  WebVoiceTranscriptSegment,
  SessionAccuracyPolicy,
  SessionAccuracyState
} from "@lingua/shared";
import {
  sendKakaoReminder,
  sendKakaoReportSummary,
} from "../services/kakaoNotifier";
import {
  sendTelegramReminder,
  sendTelegramReportSummary
} from "../services/telegramNotifier";
import { evaluateSessionForReport } from "../services/reportEvaluator";
import { createOutboundCall, endOutboundCall } from "../services/callProvider";
import {
  classifyTwilioFailureReason,
  isTwilioCompletedPlatformFault
} from "../callFaultClassifier";
import {
  buildSessionAccuracyPolicy,
  toAccuracyState,
  validateCompletedTranscript
} from "../services/sessionAccuracy";
import { describeErrorForLog, summarizeUserIdForLog } from "../lib/logging";

type OutboundCallOptions = {
  twimlUrl?: string;
  statusCallbackUrl?: string;
  from?: string;
  timeoutSeconds?: number;
};

type NotificationProvider = "kakao" | "telegram";

type NotificationPayload = {
  provider: NotificationProvider;
  ok: boolean;
  status: "sent" | "accepted" | "mock_sent" | "mock_accepted" | "failed";
  messageId?: string;
  reason?: string;
};

type ClerkUserId = string;


interface DbSessionRow {
  id: string;
  public_id: string;
  user_id: string;
  status: string;
  status_detail: string | null;
  contact_mode: string;
  language: LessonLanguage;
  exam: ExamType;
  level: string;
  topic: string;
  duration_target_minutes: number;
  timezone: string;
  scheduled_for_at_utc: string | null;
  dispatch_deadline_at_utc: string | null;
  reminder_at_utc: string | null;
  reminder_sent: boolean;
  reminder_sent_at: string | null;
  prompt_version: string | null;
  call_id: string | null;
  report_status: string;
  failure_reason: string | null;
  accuracy_policy: unknown | null;
  accuracy_state: unknown | null;
  reserved_trial_call: boolean;
  reserved_minutes: number;
  provider_call_sid: string | null;
  last_provider_sequence_number: number;
  created_at: string;
  updated_at: string;
}

interface DbUserRow {
  id: string;
  clerk_user_id: string;
  name: string | null;
  email: string | null;
  phone_encrypted: string | null;
  phone_last4: string | null;
  phone_country_code: string | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  trial_calls_remaining: number;
  paid_minutes_balance: number;
  plan_code: string;
  ui_language: string;
  created_at: string;
  updated_at: string;
}

interface DbWebhookPayload {
  callId?: string;
  status?: string;
  provider?: string;
  reason?: string;
  providerCallSid?: string;
}

interface DbSessionQueryResult {
  payload: DbWebhookPayload | null;
}

interface DbMessageRow {
  sequence_no: number;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp_ms: string | null;
  is_final: boolean;
  created_at: string;
}

interface DbReportRow {
  id: string;
  public_id: string;
  session_id: string;
  status: string;
  summary_text: string | null;
  recommendations: unknown;
  storage_path: string | null;
  kakao_status: string | null;
  kakao_sent_at: string | null;
  email_status: string | null;
  email_sent_at: string | null;
  ready_at: string | null;
  attempt_count: number;
  error_code: string | null;
  created_at: string;
}

interface DbEvaluationRow {
  session_id: string;
  grammar_score: number | null;
  vocabulary_score: number | null;
  fluency_score: number | null;
  topic_score: number | null;
  total_score: number | null;
  level_assessment: string | null;
  grammar_corrections: unknown;
  vocabulary_analysis: unknown;
  fluency_metrics: unknown;
  scoring_version: string | null;
}

interface DbReportDeliveryRow {
  id: string;
  public_id: string;
  session_id: string;
  status: string;
  kakao_status: string | null;
  error_code: string | null;
  kakao_sent_at: string | null;
  ready_at: string | null;
  attempt_count: number;
  created_at: string;
}

interface DbPlanRow {
  id: string;
  code: string;
  display_name: string;
  price_krw: number;
  included_minutes: number;
  trial_calls: number;
  max_session_minutes: number;
  entitlements: unknown;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface DbSubscriptionRow {
  id: string;
  user_id: string;
  provider: string;
  provider_subscription_id: string;
  plan_code: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

class AppError extends Error {
  constructor(
    public code:
      | "not_found"
      | "conflict"
      | "validation_error"
      | "internal_error"
      | "USER_NOT_FOUND"
      | "SESSION_NOT_FOUND"
      | "SCHEDULED_CONFLICT"
      | "SCHEDULED_TIME_REQUIRED"
      | "INVALID_SCHEDULED_TIME"
      | "SCHEDULED_TOO_SOON"
      | "SCHEDULED_TOO_FAR"
      | "LANGUAGE_EXAM_SCOPE_ERROR"
      | "DURATION_SCOPE_ERROR"
      | "INVALID_SESSION_STATE"
      | "INVALID_SESSION_ID"
      | "REPORT_NOT_FOUND"
      | "INSUFFICIENT_ALLOWANCE",
    message: string
  ) {
    super(message);
  }
}

const DB_ERROR = {
  USER_NOT_FOUND: "USER_NOT_FOUND",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SCHEDULED_CONFLICT: "SCHEDULED_CONFLICT",
  SCHEDULED_TIME_REQUIRED: "SCHEDULED_TIME_REQUIRED",
  INVALID_SCHEDULED_TIME: "INVALID_SCHEDULED_TIME",
  SCHEDULED_TOO_SOON: "SCHEDULED_TOO_SOON",
  SCHEDULED_TOO_FAR: "SCHEDULED_TOO_FAR",
  LANGUAGE_EXAM_SCOPE_ERROR: "LANGUAGE_EXAM_SCOPE_ERROR",
  DURATION_SCOPE_ERROR: "DURATION_SCOPE_ERROR",
  INVALID_SESSION_STATE: "INVALID_SESSION_STATE",
  INVALID_SESSION_ID: "INVALID_SESSION_ID",
  REPORT_NOT_FOUND: "REPORT_NOT_FOUND",
  INSUFFICIENT_ALLOWANCE: "INSUFFICIENT_ALLOWANCE"
} as const;

const MAX_SESSION_MINUTES = 10;

const nowIso = () => new Date().toISOString();
const asObject = (value: unknown): Record<string, unknown> | undefined => {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
};
const pickFirstString = (...values: Array<unknown>): string | undefined => {
  return values.find((entry) => typeof entry === "string" && entry.trim().length > 0) as string | undefined;
};
const sanitizeDigits = (value: string) => value.replace(/\D/g, "");
const readEnv = (value?: string): string | undefined => {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
};
const normalizePlaceholderTwimlUrl = (template: string, callId: string) => {
  if (template.includes("{call_id}")) {
    return template.replace(/{call_id}/g, callId);
  }
  if (template.includes("{callId}")) {
    return template.replace(/{callId}/g, callId);
  }
  if (template.includes("{session_id}")) {
    return template.replace(/{session_id}/g, callId);
  }
  return `${template.replace(/\/$/, "")}/${callId}`;
};
const defaultTwilioBaseUrl = () => {
  return (
    readEnv(process.env.PUBLIC_BASE_URL) ||
    readEnv(process.env.API_BASE_URL) ||
    readEnv(process.env.APP_BASE_URL)
  );
};

const buildPublicSummaryUrl = (reportPublicId: string) => {
  const base = readEnv(process.env.PUBLIC_BASE_URL) || readEnv(process.env.APP_BASE_URL);
  if (!base) {
    return undefined;
  }
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/#report/${encodeURIComponent(reportPublicId)}`;
};

const normalizePhoneMasked = (phone: string) => {
  const normalized = sanitizeDigits(phone);
  if (normalized.length <= 4) {
    return normalized;
  }
  return `${normalized.slice(0, 3)}***${normalized.slice(-2)}`;
};

const isTwilioCallSid = (value?: string | null): boolean => {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.startsWith("CA") && trimmed.length > 2;
};

const isLanguageExamLocked = (language: string, exam: string) =>
  (ALLOWED_LANGUAGE_EXAM_PAIRS[language] ?? []).includes(exam);

class InMemoryStore {
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for LinguaCall API");
    }
    this.pool = new Pool({ connectionString });
  }

  getPool(): Pool {
    return this.pool;
  }

  private toUserProfile(row: DbUserRow): UserProfile {
    return {
      id: row.id,
      clerkUserId: row.clerk_user_id,
      name: row.name ?? undefined,
      email: row.email ?? undefined,
      phoneLast4: row.phone_last4 ?? undefined,
      phoneVerified: row.phone_verified,
      phoneVerifiedAt: row.phone_verified_at ?? undefined,
      trialCallsRemaining: row.trial_calls_remaining,
      paidMinutesBalance: row.paid_minutes_balance,
      planCode: row.plan_code,
      uiLanguage: row.ui_language ?? "en",
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private resolveFromNumber(explicitFrom?: string): string | undefined {
    return (
      readEnv(explicitFrom) ||
      readEnv(process.env.TWILIO_FROM_NUMBER) ||
      readEnv(process.env.TWILIO_FROM_PHONE_NUMBER) ||
      readEnv(process.env.TWILIO_FROM)
    );
  }

  private resolveToNumber(user: DbUserRow): string | undefined {
    const raw = readEnv(user.phone_encrypted) || readEnv(user.phone_last4);
    if (!raw) {
      return undefined;
    }
    const trimmedRaw = raw.trim();
    const normalized = sanitizeDigits(raw);
    if (!normalized) {
      return undefined;
    }
    if (trimmedRaw.startsWith("+")) {
      return `+${normalized}`;
    }
    const countryCode = sanitizeDigits(readEnv(user.phone_country_code) || "+82");
    return `+${countryCode}${normalized}`;
  }

  private resolveTwimlUrl(
    callId: string,
    explicitTwimlUrl?: string
  ): string | undefined {
    const template = (
      readEnv(explicitTwimlUrl) ||
      readEnv(process.env.TWILIO_TWIML_URL) ||
      (defaultTwilioBaseUrl() ? `${defaultTwilioBaseUrl()}/calls/twilio-twiml` : undefined)
    );
    if (!template) {
      return undefined;
    }
    return normalizePlaceholderTwimlUrl(template, callId);
  }

  private resolveStatusCallbackUrl(explicitStatusCallbackUrl?: string): string | undefined {
    return (
      readEnv(explicitStatusCallbackUrl) ||
      readEnv(process.env.TWILIO_STATUS_CALLBACK_URL) ||
      (defaultTwilioBaseUrl() ? `${defaultTwilioBaseUrl()}/calls/twilio-status-callback` : undefined)
    );
  }

  private mapSession(row: DbSessionRow): Session {
    const accuracyPolicy = asObject(row.accuracy_policy) as unknown as SessionAccuracyPolicy | undefined;
    const accuracyState = asObject(row.accuracy_state) as unknown as SessionAccuracyState | undefined;
    return {
      id: row.id,
      publicId: row.public_id,
      userId: row.user_id,
      status: row.status as SessionStatus,
      contactMode: row.contact_mode as ContactMode,
      language: row.language,
      exam: row.exam,
      level: row.level,
      topic: row.topic,
      durationMinutes: row.duration_target_minutes,
      timezone: row.timezone,
      scheduledForAtUtc: row.scheduled_for_at_utc ?? undefined,
      dispatchDeadlineAtUtc: row.dispatch_deadline_at_utc ?? undefined,
      reminderAtUtc: row.reminder_at_utc ?? undefined,
      reminderSent: row.reminder_sent,
      reminderSentAt: row.reminder_sent_at ?? undefined,
      promptVersion: row.prompt_version ?? undefined,
      callId: row.call_id ?? undefined,
      reportStatus: row.report_status as ReportStatus,
      failureReason: (row.failure_reason as FailureReason) ?? undefined,
      accuracyPolicy,
      accuracyState,
      reservedTrialCall: row.reserved_trial_call,
      reservedMinutes: row.reserved_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapReportEvaluation(row: DbEvaluationRow): ReportEvaluationSummary {
    const grammarCorrections = Array.isArray(row.grammar_corrections)
      ? row.grammar_corrections.flatMap((entry) => {
        const value = asObject(entry);
        if (!value) {
          return [];
        }
        const timestamp = Number(value.timestamp_ms_from_call_start);
        if (!Number.isFinite(timestamp) || typeof value.issue !== "string" || typeof value.suggestion !== "string") {
          return [];
        }
        const correction: ReportEvaluatorGrammarCorrection = {
          timestamp_ms_from_call_start: timestamp,
          issue: value.issue,
          suggestion: value.suggestion
        };
        return [correction];
      })
      : [];
    const vocabularyAnalysis = Array.isArray(row.vocabulary_analysis)
      ? row.vocabulary_analysis.filter((entry): entry is string => typeof entry === "string")
      : [];
    const fluencyMetricsSource = asObject(row.fluency_metrics);
    const fluencyMetrics: ReportEvaluatorFluencyMetrics = {
      avg_wpm: Number(fluencyMetricsSource?.avg_wpm ?? 0),
      filler_count: Number(fluencyMetricsSource?.filler_count ?? 0),
      pause_count: Number(fluencyMetricsSource?.pause_count ?? 0)
    };

    return {
      grammarScore: Number(row.grammar_score ?? 0),
      vocabularyScore: Number(row.vocabulary_score ?? 0),
      fluencyScore: Number(row.fluency_score ?? 0),
      topicScore: Number(row.topic_score ?? 0),
      totalScore: Number(row.total_score ?? 0),
      levelAssessment: row.level_assessment ?? "",
      grammarCorrections,
      vocabularyAnalysis,
      fluencyMetrics,
      scoringVersion: row.scoring_version ?? "unknown"
    };
  }

  private mapReport(row: DbReportRow, evaluationRow?: DbEvaluationRow): Report {
    const recommendations = Array.isArray(row.recommendations)
      ? row.recommendations.filter((entry): entry is string => typeof entry === "string")
      : [];

    return {
      id: row.id,
      publicId: row.public_id,
      sessionId: row.session_id,
      status: row.status as ReportStatus,
      summaryText: row.summary_text ?? undefined,
      recommendations,
      storagePath: row.storage_path ?? undefined,
      kakaoStatus: row.kakao_status ?? undefined,
      kakaoSentAt: row.kakao_sent_at ?? undefined,
      emailStatus: row.email_status ?? undefined,
      emailSentAt: row.email_sent_at ?? undefined,
      readyAt: row.ready_at ?? undefined,
      attemptCount: row.attempt_count,
      evaluation: evaluationRow ? this.mapReportEvaluation(evaluationRow) : undefined,
      errorCode: row.error_code ?? undefined,
      createdAt: row.created_at
    };
  }

  private async loadReportEvaluation(sessionId: string): Promise<DbEvaluationRow | undefined> {
    const result = await this.pool.query<DbEvaluationRow>(
      `
        SELECT
          session_id,
          grammar_score,
          vocabulary_score,
          fluency_score,
          topic_score,
          total_score,
          level_assessment,
          grammar_corrections,
          vocabulary_analysis,
          fluency_metrics,
          scoring_version
        FROM evaluations
        WHERE session_id = $1
        LIMIT 1
      `,
      [sessionId]
    );
    return result.rows[0];
  }

  private normalizeReportFailureCode(reason: string): string {
    return reason.trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 96) || "report_generation_error";
  }

  private async markReportFailure(sessionId: string, errorCode: string): Promise<void> {
    const normalizedCode = this.normalizeReportFailureCode(errorCode);
    const reportPublicId = `RG_${randomUUID().replace(/-/g, "").slice(0, 18)}`;

    await this.pool.query("UPDATE sessions SET report_status = 'failed' WHERE id = $1", [sessionId]);
    const existing = await this.pool.query<{ id: string }>("SELECT id FROM reports WHERE session_id = $1", [sessionId]);
    if (existing.rows.length > 0) {
      await this.pool.query(
        `
          UPDATE reports
          SET status = 'failed',
              error_code = $2,
              ready_at = NULL,
              attempt_count = COALESCE(attempt_count, 0) + 1
          WHERE session_id = $1
        `,
        [sessionId, normalizedCode]
      );
      return;
    }

    await this.pool.query(
      `
        INSERT INTO reports (
          public_id,
          session_id,
          status,
          summary_text,
          recommendations,
          ready_at,
          attempt_count,
          error_code,
          created_at
        )
        VALUES ($1, $2, 'failed', NULL, '[]'::jsonb, NULL, 1, $3, NOW())
      `,
      [reportPublicId, sessionId, normalizedCode]
    );
  }

  private async markReportFailureInTransaction(client: PoolClient, sessionId: string, errorCode: string): Promise<void> {
    const normalizedCode = this.normalizeReportFailureCode(errorCode);
    await client.query("UPDATE sessions SET report_status = 'failed' WHERE id = $1", [sessionId]);
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM reports WHERE session_id = $1 FOR UPDATE",
      [sessionId]
    );
    if (existing.rows.length > 0) {
      await client.query(
        `
          UPDATE reports
          SET status = 'failed',
              error_code = $2,
              ready_at = NULL,
              attempt_count = COALESCE(attempt_count, 0) + 1
          WHERE session_id = $1
        `,
        [sessionId, normalizedCode]
      );
      return;
    }

    const reportPublicId = `RG_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    await client.query(
      `
        INSERT INTO reports (
          public_id,
          session_id,
          status,
          summary_text,
          recommendations,
          ready_at,
          attempt_count,
          error_code,
          created_at
        )
        VALUES ($1, $2, 'failed', NULL, '[]'::jsonb, NULL, 1, $3, NOW())
      `,
      [reportPublicId, sessionId, normalizedCode]
    );
  }

  private buildReportEvaluatorInput(
    session: Session,
    messages: TranscriptMessage[]
  ): ReportEvaluatorInput {
    return {
      sessionId: session.id,
      language: session.language,
      exam: session.exam,
      level: session.level,
      topic: session.topic,
      durationMinutes: session.durationMinutes,
      accuracyState: session.accuracyState,
      messages
    };
  }

  private async loadSessionMessagesForEvaluation(
    client: PoolClient,
    sessionId: string,
    limit = 12
  ): Promise<TranscriptMessage[]> {
    const messagesResult = await client.query<DbMessageRow>(
      "SELECT sequence_no, role, content, timestamp_ms, is_final, created_at FROM messages WHERE session_id = $1 ORDER BY sequence_no ASC LIMIT $2",
      [sessionId, limit]
    );

    return messagesResult.rows.map((row) => ({
      sequenceNo: row.sequence_no,
      role: row.role,
      content: row.content,
      timestampMs: row.timestamp_ms ? Number(row.timestamp_ms) : null,
      isFinal: row.is_final,
      createdAt: row.created_at
    }));
  }

  private async persistSessionReportArtifacts(
    client: PoolClient,
    session: Session,
    messages: TranscriptMessage[]
  ): Promise<void> {
    const evaluatorInput = this.buildReportEvaluatorInput(session, messages);
    const evaluation = await evaluateSessionForReport(evaluatorInput);
    const summaryText = evaluation.summary_text || "Session summary is ready.";
    const recommendations = evaluation.recommendations.length > 0
      ? evaluation.recommendations
      : ["Practice longer responses with topic-related details."];

    const existingReport = await client.query<{ id: string }>(
      "SELECT id FROM reports WHERE session_id = $1 FOR UPDATE",
      [session.id]
    );
    if (existingReport.rows.length > 0) {
      await client.query(
        `
          UPDATE reports
          SET status = $2,
              summary_text = $3,
              recommendations = $4::jsonb,
              ready_at = NOW(),
              attempt_count = attempt_count + 1
          WHERE session_id = $1
        `,
        [session.id, "ready", summaryText, JSON.stringify(recommendations)]
      );
    } else {
      const reportPublicId = `RG_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
      await client.query(
        `
          INSERT INTO reports (
            public_id,
            session_id,
            status,
            summary_text,
            recommendations,
            ready_at,
            attempt_count,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), 1, NOW())
        `,
        [reportPublicId, session.id, "ready", summaryText, JSON.stringify(recommendations)]
      );
    }

    const previousEvaluation = await client.query<{ total_score: number | null }>(
      "SELECT total_score FROM evaluations WHERE session_id = $1 FOR UPDATE",
      [session.id]
    );
    const previousTotalScore = previousEvaluation.rows[0]?.total_score ?? null;
    const scoreDelta = previousTotalScore === null
      ? 0
      : evaluation.total_score - previousTotalScore;

    await client.query(
      `
        INSERT INTO evaluations (
          session_id,
          status,
          grammar_score,
          vocabulary_score,
          fluency_score,
          topic_score,
          total_score,
          level_assessment,
          score_delta,
          grammar_corrections,
          vocabulary_analysis,
          fluency_metrics,
          scoring_version,
          attempt_count,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, 1, NOW())
        ON CONFLICT (session_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          grammar_score = EXCLUDED.grammar_score,
          vocabulary_score = EXCLUDED.vocabulary_score,
          fluency_score = EXCLUDED.fluency_score,
          topic_score = EXCLUDED.topic_score,
          total_score = EXCLUDED.total_score,
          level_assessment = EXCLUDED.level_assessment,
          score_delta = EXCLUDED.score_delta,
          grammar_corrections = EXCLUDED.grammar_corrections,
          vocabulary_analysis = EXCLUDED.vocabulary_analysis,
          fluency_metrics = EXCLUDED.fluency_metrics,
          scoring_version = EXCLUDED.scoring_version,
          attempt_count = evaluations.attempt_count + 1,
          created_at = NOW()
      `,
      [
        session.id,
        "ready",
        evaluation.grammar_score,
        evaluation.vocabulary_score,
        evaluation.fluency_score,
        evaluation.topic_score,
        evaluation.total_score,
        evaluation.level_assessment,
        scoreDelta,
        JSON.stringify(evaluation.grammar_corrections),
        JSON.stringify(evaluation.vocabulary_analysis),
        JSON.stringify(evaluation.fluency_metrics),
        evaluation.scoring_version
      ]
    );
  }

  private mapPlan(row: DbPlanRow): BillingPlan {
    return {
      id: row.id,
      code: row.code,
      displayName: row.display_name,
      priceKrw: row.price_krw,
      includedMinutes: row.included_minutes,
      trialCalls: row.trial_calls,
      maxSessionMinutes: row.max_session_minutes,
      entitlements: row.entitlements,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapSubscription(row: DbSubscriptionRow, userId: string): UserSubscription {
    return {
      id: row.id,
      userId,
      provider: row.provider,
      providerSubscriptionId: row.provider_subscription_id,
      planCode: row.plan_code,
      status: row.status,
      currentPeriodStart: row.current_period_start ?? undefined,
      currentPeriodEnd: row.current_period_end ?? undefined,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private async resolvePlan(planCode: string): Promise<DbPlanRow> {
    const result = await this.pool.query<DbPlanRow>(
      "SELECT * FROM plans WHERE code = $1 AND active = true LIMIT 1",
      [planCode]
    );
    if (result.rows.length === 0) {
      throw new AppError("validation_error", "plan not found");
    }
    return result.rows[0];
  }

  private resolveCheckoutCallbackUrl(
    kind: "return" | "cancel",
    provider: string,
    overrideUrl?: string
  ): string {
    const normalizedKind = kind === "return" ? "RETURN" : "CANCEL";
    const normalizedProvider = provider.trim().toLowerCase();

    const direct = readEnv(overrideUrl);
    if (direct) {
      return direct;
    }

    const providerSpecific = readEnv(process.env[`PAYMENT_${normalizedKind}_URL_${normalizedProvider.toUpperCase()}`]);
    if (providerSpecific) {
      return providerSpecific;
    }

    const global = readEnv(process.env[`PAYMENT_${normalizedKind}_URL`]);
    if (global) {
      return global;
    }

    const base = defaultTwilioBaseUrl() || readEnv(process.env.PAYMENT_SUCCESS_URL) || "https://example.com";
    const result = kind === "return" ? "success" : "cancel";
    const fallback = `${base.replace(/\/$/, "")}/#billing?checkout=${encodeURIComponent(result)}&provider=${encodeURIComponent(provider)}`;
    return fallback;
  }

  private async resolveAnyPlan(planCode: string): Promise<DbPlanRow | undefined> {
    const result = await this.pool.query<DbPlanRow>(
      "SELECT * FROM plans WHERE code = $1 LIMIT 1",
      [planCode]
    );
    return result.rows[0];
  }

  private normalizeBillingStatus(status?: string): string {
    const value = status?.trim().toLowerCase();
    if (!value) {
      return "active";
    }
    return value;
  }

  private isActiveBillingStatus(status: string): boolean {
    return status === "active" || status === "trialing";
  }

  private async applyActiveSubscriptionAllowance(
    client: PoolClient,
    userId: string,
    plan: DbPlanRow
  ) {
    await client.query(
      "UPDATE users SET paid_minutes_balance = paid_minutes_balance + $2, trial_calls_remaining = GREATEST(trial_calls_remaining, $3), plan_code = $4, updated_at = NOW() WHERE id = $1",
      [userId, plan.included_minutes, plan.trial_calls, plan.code]
    );

    if (plan.trial_calls > 0) {
      await this.writeLedger(
        client,
        userId,
        "trial_call",
        "grant",
        plan.trial_calls,
        null,
        "subscription allowance grant"
      );
    }
    if (plan.included_minutes > 0) {
      await this.writeLedger(
        client,
        userId,
        "paid_minute",
        "grant",
        plan.included_minutes,
        null,
        "subscription allowance grant"
      );
    }
  }

  private async applyPlanUpgradeAllowanceDelta(
    client: PoolClient,
    userId: string,
    previousPlanCode: string | undefined,
    nextPlan: DbPlanRow
  ) {
    if (!previousPlanCode) {
      return;
    }
    const previousPlan = await this.resolveAnyPlan(previousPlanCode);
    if (!previousPlan) {
      return;
    }
    const trialCallDelta = Math.max(0, nextPlan.trial_calls - previousPlan.trial_calls);
    const paidMinuteDelta = Math.max(0, nextPlan.included_minutes - previousPlan.included_minutes);
    if (trialCallDelta <= 0 && paidMinuteDelta <= 0) {
      return;
    }

    await client.query(
      "UPDATE users SET paid_minutes_balance = paid_minutes_balance + $2, trial_calls_remaining = trial_calls_remaining + $3, updated_at = NOW() WHERE id = $1",
      [userId, paidMinuteDelta, trialCallDelta]
    );

    if (trialCallDelta > 0) {
      await this.writeLedger(
        client,
        userId,
        "trial_call",
        "grant",
        trialCallDelta,
        null,
        `subscription plan upgrade: ${previousPlanCode} -> ${nextPlan.code}`
      );
    }
    if (paidMinuteDelta > 0) {
      await this.writeLedger(
        client,
        userId,
        "paid_minute",
        "grant",
        paidMinuteDelta,
        null,
        `subscription plan upgrade: ${previousPlanCode} -> ${nextPlan.code}`
      );
    }
  }

  private async writeLedger(
    client: PoolClient,
    userId: string,
    unitType: "trial_call" | "paid_minute",
    entryKind: "reserve" | "release" | "commit" | "refund" | "grant",
    delta: number,
    sessionId: string | null = null,
    reason: string
  ) {
      await client.query(
        `INSERT INTO credit_ledger (user_id, unit_type, entry_kind, delta, session_id, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)`,
      [userId, unitType, entryKind, delta, sessionId, reason]
    );
  }

  private async commitScheduledAllowance(
    client: PoolClient,
    userId: string,
    session: DbSessionRow,
    reason: string
  ) {
    if (!session.reserved_trial_call && session.reserved_minutes <= 0) {
      return;
    }

    if (session.reserved_trial_call) {
      await this.writeLedger(
        client,
        userId,
        "trial_call",
        "commit",
        0,
        session.id,
        reason
      );
    }
    if (session.reserved_minutes > 0) {
      await this.writeLedger(
        client,
        userId,
        "paid_minute",
        "commit",
        0,
        session.id,
        reason
      );
    }
  }

  private async releaseScheduledAllowance(
    client: PoolClient,
    userId: string,
    session: DbSessionRow,
    reason: string
  ) {
    const user = await client.query<DbUserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    if (user.rows.length === 0) {
      throw new AppError(DB_ERROR.USER_NOT_FOUND, "user not found");
    }

    if (!session.reserved_trial_call && session.reserved_minutes <= 0) {
      return;
    }

    if (session.reserved_trial_call) {
      await client.query(
        "UPDATE users SET trial_calls_remaining = trial_calls_remaining + 1, updated_at = NOW() WHERE id = $1",
        [userId]
      );
      await this.writeLedger(
        client,
        userId,
        "trial_call",
        "release",
        1,
        session.id,
        reason
      );
    }
    if (session.reserved_minutes > 0) {
      await client.query(
        "UPDATE users SET paid_minutes_balance = paid_minutes_balance + $2, updated_at = NOW() WHERE id = $1",
        [userId, session.reserved_minutes]
      );
      await this.writeLedger(
        client,
        userId,
        "paid_minute",
        "release",
        session.reserved_minutes,
        session.id,
        reason
      );
    }
  }

  private async refundScheduledAllowance(
    client: PoolClient,
    userId: string,
    session: DbSessionRow,
    reason: string
  ) {
    const user = await client.query<DbUserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    if (user.rows.length === 0) {
      throw new AppError(DB_ERROR.USER_NOT_FOUND, "user not found");
    }

    if (!session.reserved_trial_call && session.reserved_minutes <= 0) {
      return;
    }

    if (session.reserved_trial_call) {
      await client.query(
        "UPDATE users SET trial_calls_remaining = trial_calls_remaining + 1, updated_at = NOW() WHERE id = $1",
        [userId]
      );
      await this.writeLedger(
        client,
        userId,
        "trial_call",
        "refund",
        1,
        session.id,
        reason
      );
    }
    if (session.reserved_minutes > 0) {
      await client.query(
        "UPDATE users SET paid_minutes_balance = paid_minutes_balance + $2, updated_at = NOW() WHERE id = $1",
        [userId, session.reserved_minutes]
      );
      await this.writeLedger(
        client,
        userId,
        "paid_minute",
        "refund",
        session.reserved_minutes,
        session.id,
        reason
      );
    }
  }

  private assertScheduledConstraint(scheduledForAtUtc?: string) {
    if (!scheduledForAtUtc) {
      throw new AppError(DB_ERROR.SCHEDULED_TIME_REQUIRED, "scheduledForAtUtc is required");
    }
    const target = new Date(scheduledForAtUtc);
    if (Number.isNaN(target.getTime())) {
      throw new AppError(DB_ERROR.INVALID_SCHEDULED_TIME, "invalid scheduled time");
    }
    const now = Date.now();
    const leadMs = target.getTime() - now;
    if (leadMs < 15 * 60 * 1000) {
      throw new AppError(DB_ERROR.SCHEDULED_TOO_SOON, "scheduled session must be scheduled at least 15 minutes ahead");
    }
    if (leadMs > 7 * 24 * 60 * 60 * 1000) {
      throw new AppError(DB_ERROR.SCHEDULED_TOO_FAR, "scheduled session must be within 7 days");
    }
  }

  private computeReminderAt(scheduledForAtUtc: string): string {
    return new Date(new Date(scheduledForAtUtc).getTime() - 10 * 60 * 1000).toISOString();
  }

  private computeDispatchDeadline(scheduledForAtUtc: string): string {
    return new Date(new Date(scheduledForAtUtc).getTime() + 15 * 60 * 1000).toISOString();
  }

  private async getUser(clerkUserId: ClerkUserId): Promise<DbUserRow> {
    const result = await this.pool.query<DbUserRow>(
      "SELECT * FROM users WHERE clerk_user_id = $1 LIMIT 1",
      [clerkUserId]
    );
    if (result.rows.length === 0) {
      throw new AppError(DB_ERROR.USER_NOT_FOUND, "user not found");
    }
    return result.rows[0];
  }

  async upsertUser(
    clerkUserId: ClerkUserId,
    profile?: { name?: string; email?: string }
  ): Promise<UserProfile> {
    const result = await this.pool.query<DbUserRow>(
      `
        INSERT INTO users (
          clerk_user_id, name, email, created_at, updated_at
        ) VALUES (
          $1, $2, $3, NOW(), NOW()
        )
        ON CONFLICT (clerk_user_id) DO UPDATE
          SET name = COALESCE(EXCLUDED.name, users.name),
              email = COALESCE(EXCLUDED.email, users.email),
              updated_at = NOW()
        RETURNING *
      `,
      [clerkUserId, profile?.name ?? null, profile?.email ?? null]
    );
    return this.toUserProfile(result.rows[0]);
  }

  async getUserByClerk(clerkUserId: ClerkUserId): Promise<UserProfile | undefined> {
    const result = await this.pool.query<DbUserRow>(
      "SELECT * FROM users WHERE clerk_user_id = $1 LIMIT 1",
      [clerkUserId]
    );
    if (!result.rows.length) {
      return undefined;
    }
    return this.toUserProfile(result.rows[0]);
  }

  async updateUiLanguage(clerkUserId: ClerkUserId, uiLanguage: string): Promise<UserProfile> {
    const result = await this.pool.query<DbUserRow>(
      "UPDATE users SET ui_language = $2, updated_at = NOW() WHERE clerk_user_id = $1 RETURNING *",
      [clerkUserId, uiLanguage]
    );
    if (!result.rows.length) {
      throw new AppError(DB_ERROR.USER_NOT_FOUND, "user not found");
    }
    return this.toUserProfile(result.rows[0]);
  }

  async startPhoneVerification(clerkUserId: ClerkUserId, phone: string): Promise<{ maskedPhone: string; debugCode: string }> {
    await this.getUser(clerkUserId);
    const sanitizedPhone = sanitizeDigits(phone);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await this.pool.query(
      `DELETE FROM phone_verifications WHERE clerk_user_id = $1`,
      [clerkUserId]
    );
    await this.pool.query(
      `INSERT INTO phone_verifications (clerk_user_id, phone, code, attempts, expires_at)
       VALUES ($1, $2, $3, 0, $4)`,
      [clerkUserId, sanitizedPhone, code, expiresAt]
    );
    return {
      maskedPhone: normalizePhoneMasked(sanitizedPhone),
      debugCode: code
    };
  }

  async confirmPhoneVerification(
    clerkUserId: ClerkUserId,
    phone: string,
    code: string
  ): Promise<boolean> {
    await this.getUser(clerkUserId);
    const sanitizedPhone = sanitizeDigits(phone);
    const result = await this.pool.query(
      `SELECT * FROM phone_verifications WHERE clerk_user_id = $1 AND expires_at > NOW() LIMIT 1`,
      [clerkUserId]
    );
    const challenge = result.rows[0] as { phone: string; code: string; attempts: number } | undefined;

    if (!challenge) {
      return false;
    }

    const newAttempts = challenge.attempts + 1;
    await this.pool.query(
      `UPDATE phone_verifications SET attempts = $2 WHERE clerk_user_id = $1`,
      [clerkUserId, newAttempts]
    );

    if (newAttempts > 5 || challenge.code !== code || challenge.phone !== sanitizedPhone) {
      return false;
    }

    const countryCode = "82";
    const normalized = sanitizedPhone;
    const last4 = normalized.slice(-4);
    await this.pool.query(
      "UPDATE users SET phone_encrypted = $2, phone_last4 = $3, phone_country_code = $4, phone_verified = true, phone_verified_at = NOW(), updated_at = NOW() WHERE clerk_user_id = $1",
      [clerkUserId, normalized, last4, `+${countryCode}`]
    );
    await this.pool.query(
      `DELETE FROM phone_verifications WHERE clerk_user_id = $1`,
      [clerkUserId]
    );
    return true;
  }

  async createSession(clerkUserId: ClerkUserId, payload: CreateSessionPayload): Promise<Session> {
    const user = await this.getUser(clerkUserId);
    const {
      language,
      exam,
      level,
      topic,
      durationMinutes,
      contactMode,
      scheduledForAtUtc,
      timezone
    } = payload;

    if (!isLanguageExamLocked(language, exam)) {
      throw new AppError(DB_ERROR.LANGUAGE_EXAM_SCOPE_ERROR, "language/exam scope violation");
    }
    if (!["immediate", "scheduled_once"].includes(contactMode)) {
      throw new AppError("validation_error", "unsupported contact mode");
    }
    const userPlan = user.plan_code === "admin_internal"
      ? null
      : await this.resolvePlan(user.plan_code).catch(() => undefined);
    const maxSessionMinutes = userPlan?.max_session_minutes ?? MAX_SESSION_MINUTES;
    if (user.plan_code !== "admin_internal" && durationMinutes > maxSessionMinutes) {
      throw new AppError(
        DB_ERROR.DURATION_SCOPE_ERROR,
        `duration exceeds plan max session minutes: ${maxSessionMinutes}`
      );
    }
    if (contactMode === "scheduled_once") {
      this.assertScheduledConstraint(scheduledForAtUtc);
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const userWithLock = await client.query<DbUserRow>(
        "SELECT * FROM users WHERE clerk_user_id = $1 FOR UPDATE",
        [clerkUserId]
      );
      if (userWithLock.rows.length === 0) {
        throw new AppError(DB_ERROR.USER_NOT_FOUND, "user not found");
      }

      if (contactMode === "scheduled_once") {
        const scheduledConflict = await client.query<{ id: string }>(
          "SELECT id FROM sessions WHERE user_id = $1 AND status = 'scheduled' LIMIT 1",
          [user.id]
        );
        if (scheduledConflict.rows.length > 0) {
          throw new AppError(DB_ERROR.SCHEDULED_CONFLICT, "already has an upcoming scheduled session");
        }
      }

      const sessionId = randomUUID();
      const sessionStatus = contactMode === "immediate" ? "ready" : "scheduled";
      const reminderAt = contactMode === "scheduled_once" && scheduledForAtUtc ? this.computeReminderAt(scheduledForAtUtc) : null;
      const dispatchDeadline = contactMode === "scheduled_once" && scheduledForAtUtc ? this.computeDispatchDeadline(scheduledForAtUtc) : null;
      let reservedTrialCall = false;
      let reservedMinutes = 0;

      if (contactMode === "scheduled_once") {
        if (userWithLock.rows[0].trial_calls_remaining > 0) {
          reservedTrialCall = true;
          await client.query(
            "UPDATE users SET trial_calls_remaining = trial_calls_remaining - 1, updated_at = NOW() WHERE id = $1",
            [user.id]
          );
          await this.writeLedger(
            client,
            user.id,
            "trial_call",
            "reserve",
            -1,
            sessionId,
            "scheduled session reservation from trial"
          );
        } else if (userWithLock.rows[0].paid_minutes_balance >= durationMinutes) {
          reservedMinutes = durationMinutes;
          await client.query(
            "UPDATE users SET paid_minutes_balance = paid_minutes_balance - $2, updated_at = NOW() WHERE id = $1",
            [user.id, durationMinutes]
          );
          await this.writeLedger(
            client,
            user.id,
            "paid_minute",
            "reserve",
            -durationMinutes,
            sessionId,
            "scheduled session reservation from paid minutes"
          );
        } else {
          throw new AppError(DB_ERROR.INSUFFICIENT_ALLOWANCE, "insufficient allowance for scheduled session");
        }
      }

      const result = await client.query<DbSessionRow>(
        `
          INSERT INTO sessions (
            public_id,
            user_id,
            status,
            contact_mode,
            language,
            exam,
            level,
            topic,
            duration_target_minutes,
            timezone,
            scheduled_for_at_utc,
            dispatch_deadline_at_utc,
            reminder_at_utc,
            reminder_sent,
            reminder_sent_at,
            reserved_trial_call,
            reserved_minutes,
            config_snapshot,
            model_config,
            report_status,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, '{}'::jsonb, '{}'::jsonb, 'not_requested', NOW(), NOW()
          )
          RETURNING *
        `,
        [
          sessionId,
          user.id,
          sessionStatus,
          contactMode,
          language,
          exam,
          level,
          topic,
          durationMinutes,
          timezone ?? "Asia/Seoul",
          scheduledForAtUtc ?? null,
          dispatchDeadline,
          reminderAt,
          false,
          null,
          reservedTrialCall,
          reservedMinutes
        ]
      );

      await client.query("COMMIT");
      return this.mapSession(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed to create session");
    } finally {
      client.release();
    }
  }

  async listSessions(clerkUserId: ClerkUserId): Promise<Session[]> {
    const user = await this.getUser(clerkUserId);
    const result = await this.pool.query<DbSessionRow>(
      "SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id]
    );
    return result.rows.map((row) => this.mapSession(row));
  }

  async listBillingPlans(): Promise<BillingPlan[]> {
    const result = await this.pool.query<DbPlanRow>(
      `
        SELECT id, code, display_name, price_krw, included_minutes, trial_calls, max_session_minutes, entitlements, active, created_at, updated_at
        FROM plans
        WHERE active = true
        ORDER BY price_krw ASC, code ASC
      `
    );
    return result.rows.map((row) => this.mapPlan(row));
  }

  async getUserActiveSubscription(clerkUserId: ClerkUserId): Promise<UserSubscription | null> {
    const user = await this.getUser(clerkUserId);
    const result = await this.pool.query<DbSubscriptionRow>(
      `
        SELECT
          id,
          provider,
          provider_subscription_id,
          plan_code,
          status,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          created_at,
          updated_at
        FROM subscriptions
        WHERE user_id = $1 AND status IN ('active', 'trialing')
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
      [user.id]
    );

    if (result.rows.length === 0) {
      return null;
    }
    return this.mapSubscription(result.rows[0], user.id);
  }

  private resolveCheckoutEndpoint(provider: string): string | undefined {
    const normalizedProvider = provider.trim().toLowerCase();
    const explicit = process.env[`PAYMENT_PROVIDER_CREATE_URL_${normalizedProvider.toUpperCase()}`]?.trim();
    return explicit || process.env.PAYMENT_PROVIDER_CREATE_URL?.trim();
  }

  private resolveCheckoutAuthHeader(provider: string): {
    header: string;
    value: string;
  } | undefined {
    const normalizedProvider = provider.trim().toUpperCase();
    const bearerToken = readEnv(process.env[`PAYMENT_PROVIDER_BEARER_TOKEN_${normalizedProvider}`])
      || readEnv(process.env.PAYMENT_PROVIDER_BEARER_TOKEN);
    const customHeader = readEnv(process.env[`PAYMENT_PROVIDER_AUTH_HEADER_${normalizedProvider}`])
      || readEnv(process.env.PAYMENT_PROVIDER_AUTH_HEADER);
    const customValue = readEnv(process.env[`PAYMENT_PROVIDER_AUTH_VALUE_${normalizedProvider}`])
      || readEnv(process.env.PAYMENT_PROVIDER_AUTH_VALUE);

    if (bearerToken) {
      return { header: "authorization", value: `Bearer ${bearerToken}` };
    }
    if (customHeader && customValue) {
      return { header: customHeader.toLowerCase(), value: customValue };
    }
    return undefined;
  }

  private buildCheckoutRequestBody(
    provider: string,
    clerkUserId: ClerkUserId,
    planCode: string,
    checkoutSessionId: string,
    payload: CreateCheckoutSessionPayload
  ): Record<string, unknown> {
    const returnUrl = this.resolveCheckoutCallbackUrl("return", provider, payload.returnUrl);
    const cancelUrl = this.resolveCheckoutCallbackUrl("cancel", provider, payload.cancelUrl);
    const commonPayload = {
      provider,
      checkoutSessionId,
      planCode,
      clerkUserId,
      returnUrl,
      cancelUrl,
      successRedirectUrl: returnUrl,
      cancelRedirectUrl: cancelUrl
    };

    return commonPayload;
  }

  private resolveNotificationProviders(): NotificationProvider[] {
    const providers: NotificationProvider[] = [];
    const kakaoEnabled = Boolean(
      readEnv(process.env.KAKAO_API_URL) || readEnv(process.env.KAKAO_API_ENDPOINT)
    ) && Boolean(readEnv(process.env.KAKAO_API_TOKEN) || readEnv(process.env.KAKAO_AUTH_TOKEN));
    const telegramTransportEnabled = Boolean(
      readEnv(process.env.TELEGRAM_BOT_TOKEN)
      || readEnv(process.env.TELEGRAM_API_URL)
      || readEnv(process.env.TELEGRAM_API_ENDPOINT)
    );
    const telegramTargetEnabled = Boolean(
      readEnv(process.env.TELEGRAM_CHAT_ID)
      || readEnv(process.env.TELEGRAM_CHAT_ID_DEFAULT)
      || readEnv(process.env.TELEGRAM_CHAT_ID_MAP)
      || readEnv(process.env.TELEGRAM_CHAT_ID_MAP_JSON)
    );
    const telegramEnabled = telegramTransportEnabled && telegramTargetEnabled;

    if (kakaoEnabled) {
      providers.push("kakao");
    }
    if (telegramEnabled) {
      providers.push("telegram");
    }
    if (providers.length === 0) {
      providers.push("kakao");
    }
    return providers;
  }

  private async sendReminderNotificationByProvider(payload: {
    sessionId: string;
    sessionPublicId: string;
    userId: string;
    scheduledAt: string;
  }, provider: NotificationProvider): Promise<NotificationPayload> {
    if (provider === "kakao") {
      const result = await sendKakaoReminder(payload);
      return {
        provider,
        ok: result.ok,
        status: result.status,
        messageId: result.messageId,
        reason: result.reason
      };
    }

    const result = await sendTelegramReminder(payload);
    return {
      provider,
      ok: result.ok,
      status: result.status,
      messageId: result.messageId,
      reason: result.reason
    };
  }

  private async sendReportNotificationByProvider(payload: {
    reportId: string;
    sessionId: string;
    publicReportId: string;
    userId: string;
    publicSummaryUrl?: string;
  }, provider: NotificationProvider): Promise<NotificationPayload> {
    if (provider === "kakao") {
      const result = await sendKakaoReportSummary(payload);
      return {
        provider,
        ok: result.ok,
        status: result.status,
        messageId: result.messageId,
        reason: result.reason
      };
    }

    const result = await sendTelegramReportSummary(payload);
    return {
      provider,
      ok: result.ok,
      status: result.status,
      messageId: result.messageId,
      reason: result.reason
    };
  }

  private aggregateNotificationSummary(attempts: NotificationPayload[]): {
    ok: boolean;
    status: "sent" | "accepted" | "failed";
    reason?: string;
    messageIds: string[];
    attempts: NotificationPayload[];
  } {
    const messageIds = attempts
      .map((item) => item.messageId)
      .filter((item): item is string => typeof item === "string" && item.length > 0);
    if (attempts.some((attempt) => attempt.ok)) {
      const accepted = attempts.some((attempt) => attempt.status === "accepted" || attempt.status === "mock_accepted");
      return {
        ok: true,
        status: accepted ? "accepted" : "sent",
        messageIds,
        attempts
      };
    }

    const firstReason = attempts.find((attempt) => attempt.reason)?.reason ?? "notification_delivery_failed";
    return {
      ok: false,
      status: "failed",
      reason: firstReason,
      messageIds,
      attempts
    };
  }

  private getNotificationEventPayloadSummary(attempts: NotificationPayload[]) {
    return attempts.map((attempt) => `${attempt.provider}:${attempt.status}`).join(",");
  }

  private readCheckoutProviderResponseText(body: unknown): string | undefined {
    if (typeof body === "string") {
      const trimmed = body.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  }

  private pickCheckoutResponseString(body: Record<string, unknown>, ...candidates: Array<unknown>): string | undefined {
    for (const candidate of candidates) {
      const value = pickFirstString(candidate);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private extractCheckoutResponseUrl(body: Record<string, unknown>): string | undefined {
    const data = asObject(body?.data);
    const nestedData = asObject(data?.data);
    const checkoutSession = asObject(body.checkout_session) ?? asObject(data?.checkout_session);
    return this.pickCheckoutResponseString(
      body,
      body.checkoutUrl,
      body.checkout_url,
      body.sessionUrl,
      body.session_url,
      body.url,
      checkoutSession?.url,
      data?.checkoutUrl,
      data?.checkout_url,
      data?.sessionUrl,
      data?.session_url,
      data?.url,
      nestedData?.checkoutUrl,
      nestedData?.checkout_url,
      nestedData?.sessionUrl,
      nestedData?.session_url,
      nestedData?.url,
      asObject(data?.object)?.url
    );
  }

  private extractCheckoutResponseSessionId(body: Record<string, unknown>): string | undefined {
    const data = asObject(body?.data);
    const nestedData = asObject(data?.data);
    const objectData = asObject(data?.object);
    const checkoutSession = asObject(body.checkout_session) ?? asObject(data?.checkout_session);
    return this.pickCheckoutResponseString(
      body,
      body.checkoutSessionId,
      body.checkout_session_id,
      body.sessionId,
      body.session_id,
      body.id,
      body.session,
      checkoutSession?.id,
      asObject(body.object)?.id,
      data?.checkoutSessionId,
      data?.checkout_session_id,
      data?.sessionId,
      data?.session_id,
      data?.id,
      data?.session,
      nestedData?.id,
      nestedData?.checkoutSessionId,
      nestedData?.checkout_session_id,
      nestedData?.sessionId,
      nestedData?.session_id,
      objectData?.id
    );
  }

  private async createLiveCheckoutSession(
    provider: string,
    clerkUserId: ClerkUserId,
    planCode: string,
    checkoutSessionId: string,
    payload: CreateCheckoutSessionPayload
  ): Promise<BillingCheckoutSession> {
    const normalizedProvider = provider.trim().toLowerCase();
    const endpoint = this.resolveCheckoutEndpoint(normalizedProvider);
    if (!endpoint) {
      throw new AppError("validation_error", "PAYMENT_PROVIDER_CREATE_URL is required for live checkout provider");
    }

    const requestBody = this.buildCheckoutRequestBody(
      normalizedProvider,
      clerkUserId,
      planCode,
      checkoutSessionId,
      payload
    );
    const requestHeaders: Record<string, string> = { "content-type": "application/json" };
    const requestAuth = this.resolveCheckoutAuthHeader(normalizedProvider);
    if (requestAuth) {
      requestHeaders[requestAuth.header] = requestAuth.value;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody)
    });

    const rawBody = this.readCheckoutProviderResponseText(await response.text());
    let responseBody: Record<string, unknown> = {};
    if (rawBody) {
      try {
        responseBody = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        if (!response.ok && rawBody) {
          throw new AppError("validation_error", `live provider checkout failed: ${rawBody}`);
        }
        if (/^https?:\/\//i.test(rawBody)) {
          responseBody = { checkoutUrl: rawBody };
        } else if (rawBody.length > 0) {
          throw new AppError("validation_error", "live provider checkout response is not valid JSON");
        }
      }
    }

    if (!response.ok) {
      throw new AppError(
        "validation_error",
        `failed to create live checkout session: ${response.status} ${response.statusText} ${rawBody ? rawBody.slice(0, 200) : ""}`.trim()
      );
    }

    const checkoutUrl = this.extractCheckoutResponseUrl(responseBody);
    if (!checkoutUrl) {
      throw new AppError("validation_error", "live provider checkout response missing checkoutUrl");
    }

    return {
      provider,
      checkoutSessionId: this.extractCheckoutResponseSessionId(responseBody) ?? checkoutSessionId,
      checkoutUrl,
      planCode
    };
  }

  async createCheckoutSession(clerkUserId: ClerkUserId, payload: CreateCheckoutSessionPayload): Promise<BillingCheckoutSession> {
    const user = await this.getUser(clerkUserId);
    const requestedPlanCode = payload.planCode?.trim();
    if (!requestedPlanCode) {
      throw new AppError("validation_error", "planCode is required");
    }
    const requestedProvider = (payload.provider ?? "").trim().toLowerCase();
    if (requestedProvider && requestedProvider !== "toss") {
      throw new AppError("validation_error", "only toss is supported");
    }
    const plan = await this.resolvePlan(requestedPlanCode);
    if (plan.price_krw <= 0) {
      throw new AppError("validation_error", "paid checkout is not available for the free plan");
    }
    const provider = "toss";
    const checkoutSessionId = `order_${randomUUID().replace(/-/g, "").slice(0, 26)}`;
    const successUrl = this.resolveCheckoutCallbackUrl("return", provider, payload.returnUrl);
    const failUrl = this.resolveCheckoutCallbackUrl("cancel", provider, payload.cancelUrl);

    return {
      provider,
      checkoutSessionId,
      planCode: requestedPlanCode,
      orderId: checkoutSessionId,
      orderName: plan.display_name,
      amount: plan.price_krw,
      successUrl,
      failUrl,
      customerKey: user.id,
      customerEmail: user.email ?? undefined,
      customerName: user.name ?? undefined
    };
  }

  async handlePaymentWebhook(payload: BillingWebhookPayload): Promise<UserSubscription> {
    const provider = (payload.provider || "toss").trim();
    const eventType = payload.eventType?.trim();
    const clerkUserId = (payload.clerkUserId ?? "").trim();
    const planCode = (payload.planCode ?? "").trim();
    const providerSubscriptionId = (payload.providerSubscriptionId ?? "").trim();
    const status = this.normalizeBillingStatus(payload.status);
    const eventId = (payload.eventId ?? "").trim();

    if (!eventType) {
      throw new AppError("validation_error", "eventType is required");
    }
    if (!clerkUserId) {
      throw new AppError("validation_error", "clerkUserId is required");
    }
    if (!planCode) {
      throw new AppError("validation_error", "planCode is required");
    }
    if (!providerSubscriptionId) {
      throw new AppError("validation_error", "providerSubscriptionId is required");
    }

    const user = await this.getUser(clerkUserId);
    const plan = await this.resolvePlan(planCode);
    const normalizedStatus = status;
    const isActive = this.isActiveBillingStatus(normalizedStatus);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const dedupeKey = this.getWebhookDedupeKey(
        "payments",
        eventType,
        eventId || providerSubscriptionId
      );
      const existingWebhook = await client.query<{ id: string }>(
        "SELECT id FROM webhook_events WHERE dedupe_key = $1 LIMIT 1",
        [dedupeKey]
      );
      if (existingWebhook.rows.length > 0) {
        const latest = await client.query<DbSubscriptionRow>(
          `SELECT * FROM subscriptions WHERE user_id = $1 AND provider = $2 AND provider_subscription_id = $3 ORDER BY updated_at DESC LIMIT 1`,
          [user.id, provider, providerSubscriptionId]
        );
        if (latest.rows.length === 0) {
          throw new AppError("not_found", "subscription not found");
        }
        await client.query("COMMIT");
        return this.mapSubscription(latest.rows[0], user.id);
      }

      const existing = await client.query<DbSubscriptionRow & { user_id: string }>(
        `
          SELECT *
          FROM subscriptions
          WHERE user_id = $1 AND provider = $2 AND provider_subscription_id = $3
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [user.id, provider, providerSubscriptionId]
      );

      const existed = existing.rows[0];
      let subscriptionId: string;
      const previousStatus = existed?.status?.toLowerCase();
      const wasActive = this.isActiveBillingStatus(previousStatus ?? "");

      if (!existed) {
        const created = await client.query<DbSubscriptionRow>(
          `
            INSERT INTO subscriptions (
              user_id,
              provider,
              provider_subscription_id,
              plan_code,
              status,
              current_period_start,
              current_period_end,
              cancel_at_period_end,
              created_at,
              updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, NOW(), NOW()
            )
            RETURNING id
          `,
          [
            user.id,
            provider,
            providerSubscriptionId,
            plan.code,
            normalizedStatus,
            payload.currentPeriodStart ?? null,
            payload.currentPeriodEnd ?? null,
            Boolean(payload.cancelAtPeriodEnd)
          ]
        );
        subscriptionId = created.rows[0].id;
        if (isActive) {
          await this.applyActiveSubscriptionAllowance(client, user.id, plan);
        }
      } else {
        await client.query(
          `
            UPDATE subscriptions
            SET plan_code = $2, status = $3, current_period_start = $4::timestamptz, current_period_end = $5::timestamptz, cancel_at_period_end = $6, updated_at = NOW()
            WHERE id = $1
          `,
          [existed.id, plan.code, normalizedStatus, payload.currentPeriodStart ?? null, payload.currentPeriodEnd ?? null, Boolean(payload.cancelAtPeriodEnd)]
        );
        subscriptionId = existed.id;
        if (!wasActive && isActive) {
          await this.applyActiveSubscriptionAllowance(client, user.id, plan);
        } else if (wasActive && isActive) {
          await this.applyPlanUpgradeAllowanceDelta(client, user.id, existed.plan_code, plan);
        } else if (isActive && existed.plan_code !== plan.code) {
          await client.query(
            "UPDATE users SET plan_code = $2, updated_at = NOW() WHERE id = $1",
            [user.id, plan.code]
          );
        }
      }

      if (isActive) {
        await client.query(
          "UPDATE users SET plan_code = $2, updated_at = NOW() WHERE id = $1",
          [user.id, plan.code]
        );
      } else {
        const fallbackPlan = await client.query<{ plan_code: string }>(
          `
            SELECT plan_code
            FROM subscriptions
            WHERE user_id = $1 AND status IN ('active', 'trialing')
            ORDER BY updated_at DESC
            LIMIT 1
          `,
          [user.id]
        );
        const nextPlanCode = fallbackPlan.rows.length > 0 ? fallbackPlan.rows[0].plan_code : "free";
        await client.query(
          "UPDATE users SET plan_code = $1, updated_at = NOW() WHERE id = $2",
          [nextPlanCode, user.id]
        );
      }

      const subscription = await client.query<DbSubscriptionRow>(
        "SELECT * FROM subscriptions WHERE id = $1 LIMIT 1",
        [subscriptionId]
      );

      await client.query(
        `INSERT INTO webhook_events (provider, event_type, dedupe_key, payload, processed, created_at)
         VALUES ('payments', 'subscription_event', $1, $2::jsonb, true, NOW())
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          dedupeKey,
          JSON.stringify({
            eventType,
            provider,
            clerkUserId,
            planCode: plan.code,
            providerSubscriptionId,
            status: normalizedStatus,
            currentPeriodStart: payload.currentPeriodStart,
            currentPeriodEnd: payload.currentPeriodEnd,
            cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
            previousStatus,
            eventId
          })
        ]
      );

      await client.query("COMMIT");
      if (subscription.rows.length === 0) {
        throw new AppError("not_found", "subscription not found after upsert");
      }
      return this.mapSubscription(subscription.rows[0], user.id);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_handle_billing_webhook");
    } finally {
      client.release();
    }
  }

  async getSession(clerkUserId: ClerkUserId, sessionId: string): Promise<Session> {
    const user = await this.getUser(clerkUserId);
    const result = await this.pool.query<DbSessionRow>(
      "SELECT s.* FROM sessions s WHERE s.id = $1 AND s.user_id = $2 LIMIT 1",
      [sessionId, user.id]
    );
    if (result.rows.length === 0) {
      throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
    }
    return this.mapSession(result.rows[0]);
  }

  async getSessionByIdentifierForUser(clerkUserId: ClerkUserId, identifier: string): Promise<Session> {
    const user = await this.getUser(clerkUserId);
    const result = await this.pool.query<DbSessionRow>(
      `
        SELECT s.*
        FROM sessions s
        WHERE s.user_id = $2
          AND (s.id::text = $1 OR s.call_id = $1 OR s.public_id = $1 OR s.provider_call_sid = $1)
        LIMIT 1
      `,
      [identifier, user.id]
    );
    if (result.rows.length === 0) {
      throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
    }
    return this.mapSession(result.rows[0]);
  }

  async endSessionCall(clerkUserId: ClerkUserId, callOrSessionId: string): Promise<Session> {
    const user = await this.getUser(clerkUserId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const target = await client.query<DbSessionRow>(
        `
          SELECT *
          FROM sessions s
          WHERE s.user_id = $2
            AND (s.id::text = $1 OR s.call_id = $1 OR s.public_id = $1 OR s.provider_call_sid = $1)
          FOR UPDATE
        `,
        [callOrSessionId, user.id]
      );

      if (target.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }

      const session = target.rows[0];
      const terminalStatuses = ["completed", "failed", "cancelled", "no_answer", "busy", "voicemail", "user_cancelled", "provider_error", "schedule_missed"];
      if (terminalStatuses.includes(session.status)) {
        await client.query("COMMIT");
        return this.mapSession(session);
      }

      const activeStatuses = ["connecting", "dialing", "ringing", "in_progress", "ending"];
      if (!activeStatuses.includes(session.status)) {
        throw new AppError(
          DB_ERROR.INVALID_SESSION_STATE,
          "session is not active and cannot be ended"
        );
      }

      const providerCallSid = isTwilioCallSid(session.provider_call_sid) ? session.provider_call_sid : undefined;
      const isWebVoiceSession = !providerCallSid && session.call_id?.startsWith("WV_");

      if (isWebVoiceSession && session.status === "connecting") {
        if (session.reserved_trial_call || session.reserved_minutes > 0) {
          await this.releaseScheduledAllowance(client, session.user_id, session, "web voice session cancelled before connect");
        }

        const cancelled = await client.query<DbSessionRow>(
          `
            UPDATE sessions
            SET status = 'cancelled',
                failure_reason = NULL,
                reserved_trial_call = false,
                reserved_minutes = 0,
                ended_at = COALESCE(ended_at, NOW()),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [session.id]
        );
        if (cancelled.rows.length === 0) {
          throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
        }

        await this.writeWebhookEvent(
          client,
          "media",
          this.getWebhookDedupeKey("media", "web_voice_end", `cancel:${cancelled.rows[0].id}:${Date.now()}`),
          {
            event: "app_end_call",
            sessionId: cancelled.rows[0].id,
            status: "cancelled",
            providerCallSid: session.provider_call_sid,
            callId: session.call_id,
            at: nowIso()
          },
          "web_voice"
        );

        await client.query("COMMIT");
        return this.mapSession(cancelled.rows[0]);
      }

      if (isWebVoiceSession && (session.status === "in_progress" || session.status === "ending")) {
        if (session.reserved_trial_call || session.reserved_minutes > 0) {
          await this.commitScheduledAllowance(client, session.user_id, session, "user ended web voice call");
        }

        const completed = await client.query<DbSessionRow>(
          `
            UPDATE sessions
            SET status = 'completed',
                failure_reason = NULL,
                reserved_trial_call = false,
                reserved_minutes = 0,
                answered_at = COALESCE(answered_at, NOW()),
                completed_at = COALESCE(completed_at, NOW()),
                ended_at = COALESCE(ended_at, NOW()),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [session.id]
        );
        if (completed.rows.length === 0) {
          throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
        }

        await this.writeWebhookEvent(
          client,
          "media",
          this.getWebhookDedupeKey("media", "web_voice_end", `complete:${completed.rows[0].id}:${Date.now()}`),
          {
            event: "app_end_call",
            sessionId: completed.rows[0].id,
            status: "completed",
            providerCallSid: session.provider_call_sid,
            callId: session.call_id,
            at: nowIso()
          },
          "web_voice"
        );

        await client.query("COMMIT");
        return this.mapSession(completed.rows[0]);
      }

      if (providerCallSid) {
        const endResult = await endOutboundCall(providerCallSid);
        if (endResult.status === "failed") {
          await this.writeWebhookEvent(
            client,
            "twilio",
            this.getWebhookDedupeKey("twilio", "status", `end-provider:${session.id}:${Date.now()}`),
            {
              event: "app_end_provider_failed",
              sessionId: session.id,
              status: "failed",
              reason: endResult.reason,
              provider: endResult.provider,
              providerCallSid
            },
            "call_end"
          );
        }
      }

      if (session.reserved_trial_call || session.reserved_minutes > 0) {
        await this.commitScheduledAllowance(client, session.user_id, session, "user ended call");
      }

      const updated = await client.query<DbSessionRow>(
        `
          UPDATE sessions
          SET status = 'completed',
              failure_reason = NULL,
              reserved_trial_call = false,
              reserved_minutes = 0,
              completed_at = COALESCE(completed_at, NOW()),
              ended_at = COALESCE(ended_at, NOW()),
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [session.id]
      );
      if (updated.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }

      await this.writeWebhookEvent(
        client,
        "twilio",
        this.getWebhookDedupeKey("twilio", "status", `end:${updated.rows[0].id}:${Date.now()}`),
        {
          event: "app_end_call",
          sessionId: updated.rows[0].id,
          status: "completed",
          providerCallSid: session.provider_call_sid,
          callId: session.call_id,
          at: nowIso()
        },
        "call_end"
      );

      await client.query("COMMIT");
      return this.mapSession(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      console.error("endSessionCall failed", {
        callOrSessionId,
        clerkUserId: summarizeUserIdForLog(clerkUserId),
        error: describeErrorForLog(error)
      });
      throw new AppError("internal_error", "failed_to_end_call");
    } finally {
      client.release();
    }
  }

  async getSessionReport(clerkUserId: ClerkUserId, sessionId: string): Promise<Report> {
    await this.getSession(clerkUserId, sessionId);
    const result = await this.pool.query<DbReportRow>(
      "SELECT * FROM reports WHERE session_id = $1 LIMIT 1",
      [sessionId]
    );
    if (result.rows.length === 0) {
      throw new AppError(DB_ERROR.REPORT_NOT_FOUND, "report not found");
    }
    const evaluation = await this.loadReportEvaluation(sessionId);
    return this.mapReport(result.rows[0], evaluation);
  }

  async getReportDeliveryStates(params: {
    status?: string;
    limit?: number;
  }): Promise<Array<{
    reportId: string;
    publicReportId: string;
    sessionId: string;
    reportStatus: string;
    kakaoStatus: string | null;
    errorCode: string | null;
    kakaoSentAt?: string;
    readyAt?: string;
    attemptCount: number;
    createdAt: string;
  }>> {
    const status = params.status?.trim();
    const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
    const shouldFilterByStatus = Boolean(status && status.length > 0);
    const queryParams: Array<string | number> = shouldFilterByStatus ? [status, limit] : [limit];
    const query = shouldFilterByStatus ? `
        SELECT
          id,
          public_id,
          session_id,
          status,
          kakao_status,
          error_code,
          kakao_sent_at,
          ready_at,
          attempt_count,
          created_at
        FROM reports
        WHERE kakao_status = $1
        ORDER BY created_at DESC
        LIMIT $2
      ` : `
        SELECT
          id,
          public_id,
          session_id,
          status,
          kakao_status,
          error_code,
          kakao_sent_at,
          ready_at,
          attempt_count,
          created_at
        FROM reports
        ORDER BY created_at DESC
        LIMIT $1
      `;

    const result = await this.pool.query<DbReportDeliveryRow>(query, queryParams);

    return result.rows.map((row) => ({
      reportId: row.id,
      publicReportId: row.public_id,
      sessionId: row.session_id,
      reportStatus: row.status,
      kakaoStatus: row.kakao_status,
      errorCode: row.error_code,
      kakaoSentAt: row.kakao_sent_at ?? undefined,
      readyAt: row.ready_at ?? undefined,
      attemptCount: row.attempt_count,
      createdAt: row.created_at
    }));
  }

  async getReportByPublicId(clerkUserId: ClerkUserId, publicId: string): Promise<Report> {
    const user = await this.getUser(clerkUserId);
    const result = await this.pool.query<DbReportRow>(
      `
        SELECT r.*
        FROM reports r
        INNER JOIN sessions s ON s.id = r.session_id
        WHERE r.public_id = $1 AND s.user_id = $2
        LIMIT 1
      `,
      [publicId, user.id]
    );

    if (result.rows.length === 0) {
      throw new AppError(DB_ERROR.REPORT_NOT_FOUND, "report not found");
    }
    const evaluation = await this.loadReportEvaluation(result.rows[0].session_id);
    return this.mapReport(result.rows[0], evaluation);
  }

  async generateSessionReport(clerkUserId: ClerkUserId, sessionId: string): Promise<Report> {
    const session = await this.getSession(clerkUserId, sessionId);
    if (session.status !== "completed") {
      throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "session is not completed");
    }

    const messages = await this.getSessionMessages(clerkUserId, sessionId, 12);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query<{ id: string; status: string; attempt_count: number }>(
        "SELECT id, status, attempt_count FROM reports WHERE session_id = $1 FOR UPDATE",
        [session.id]
      );
      if (existing.rows[0]?.status === "failed" && existing.rows[0].attempt_count >= 3) {
        throw new AppError("conflict", "report generation retry limit reached");
      }
      await this.persistSessionReportArtifacts(client, session, messages.messages);

      await client.query(
        "UPDATE sessions SET report_status = 'ready' WHERE id = $1",
        [session.id]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        if (error.code !== "INVALID_SESSION_STATE" && error.code !== "conflict") {
          await this.markReportFailure(session.id, error.message).catch(() => undefined);
        }
        throw error;
      }
      await this.markReportFailure(session.id, error instanceof Error ? error.message : "failed_to_generate_report").catch(() => undefined);
      throw new AppError("internal_error", "failed_to_generate_report");
    } finally {
      client.release();
    }

    return this.getSessionReport(clerkUserId, sessionId);
  }

  async processPendingSessionReports(limit = 20): Promise<{
    processed: number;
    readySessionIds: string[];
    failedSessionIds: string[];
  }> {
    const pendingSessions = await this.pool.query<{ id: string }>(
      `
        SELECT id
        FROM sessions
        WHERE status = 'completed'
          AND report_status = 'pending'
        ORDER BY completed_at ASC NULLS LAST, updated_at ASC
        LIMIT $1
      `,
      [limit]
    );

    const readySessionIds: string[] = [];
    const failedSessionIds: string[] = [];

    for (const pending of pendingSessions.rows) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query<{ id: string; status: string; report_status: string }>(
          "SELECT id, status, report_status FROM sessions WHERE id = $1 FOR UPDATE",
          [pending.id]
        );
        if (
          locked.rows.length === 0 ||
          locked.rows[0].status !== "completed" ||
          locked.rows[0].report_status !== "pending"
        ) {
          await client.query("ROLLBACK");
          continue;
        }

        await this.ensureSessionReportReady(client, pending.id);
        await client.query(
          "UPDATE sessions SET report_status = 'ready', updated_at = NOW() WHERE id = $1",
          [pending.id]
        );
        await client.query("COMMIT");
        readySessionIds.push(pending.id);
      } catch (error) {
        await client.query("ROLLBACK");
        await this.markReportFailure(
          pending.id,
          error instanceof Error ? error.message : "failed_to_generate_report"
        ).catch(() => undefined);
        failedSessionIds.push(pending.id);
      } finally {
        client.release();
      }
    }

    return {
      processed: readySessionIds.length + failedSessionIds.length,
      readySessionIds,
      failedSessionIds
    };
  }

  private async ensureSessionReportReady(client: PoolClient, sessionId: string): Promise<void> {
    const sessionResult = await client.query<Pick<DbSessionRow, "id" | "language" | "exam" | "level" | "topic" | "duration_target_minutes">>(
      "SELECT id, language, exam, level, topic, duration_target_minutes FROM sessions WHERE id = $1",
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
    }

    const sessionRecord = sessionResult.rows[0];
    const session: Session = {
      id: sessionRecord.id,
      publicId: "",
      userId: "",
      status: "completed",
      contactMode: "immediate",
      language: sessionRecord.language,
      exam: sessionRecord.exam,
      level: sessionRecord.level,
      topic: sessionRecord.topic,
      durationMinutes: sessionRecord.duration_target_minutes,
      timezone: "Asia/Seoul",
      reminderSent: false,
      reportStatus: "ready",
      reservedTrialCall: false,
      reservedMinutes: 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    const messages = await this.loadSessionMessagesForEvaluation(client, session.id, 12);
    await this.persistSessionReportArtifacts(client, session, messages);
  }

  async getSessionByTwilioLookup(lookup: {
    callId?: string;
    providerCallSid?: string;
  }): Promise<Session | null> {
    if (!lookup.callId && !lookup.providerCallSid) {
      return null;
    }

    const client = await this.pool.connect();
    try {
      const tryCandidates: Array<{ sql: string; param: string }> = [];
      if (lookup.callId) {
        tryCandidates.push({ sql: "SELECT * FROM sessions WHERE call_id = $1 OR public_id = $1 OR id = $1 LIMIT 1", param: lookup.callId });
      }
      if (lookup.providerCallSid) {
        tryCandidates.push({ sql: "SELECT * FROM sessions WHERE provider_call_sid = $1 OR call_id = $1 OR public_id = $1 OR id = $1 LIMIT 1", param: lookup.providerCallSid });
      }

      for (const candidate of tryCandidates) {
        const result = await client.query<DbSessionRow>(candidate.sql, [candidate.param]);
        if (result.rows.length > 0) {
          return this.mapSession(result.rows[0]);
        }
      }

      return null;
    } finally {
      client.release();
    }
  }

  async bindMediaStreamSession(payload: {
    sessionId: string;
    providerCallSid?: string;
    callId?: string;
  }): Promise<Session> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 FOR UPDATE",
        [payload.sessionId]
      );
      if (result.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }
      const session = result.rows[0];

      const nextStatus = ["ready", "scheduled", "dialing"].includes(session.status)
        ? "ringing"
        : session.status;

      const providerCallSid = payload.providerCallSid ? payload.providerCallSid.trim() : undefined;
      const updated = await client.query<DbSessionRow>(
        `
          UPDATE sessions
          SET status = $1,
              provider_call_sid = COALESCE($2, provider_call_sid),
              updated_at = NOW()
          WHERE id = $3
          RETURNING *
        `,
        [nextStatus, providerCallSid, session.id]
      );
      if (updated.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }

      if (payload.providerCallSid) {
        await this.writeWebhookEvent(
          client,
          "media_stream",
          `twilio:media:start:${updated.rows[0].id}:${session.call_id ?? payload.providerCallSid}`,
          {
            event: "media_stream_start",
            sessionId: updated.rows[0].id,
            providerCallSid: payload.providerCallSid,
            callId: payload.callId,
            status: "bound"
          }
        );
      }

      await client.query("COMMIT");
      return this.mapSession(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_bind_media_stream_session");
    } finally {
      client.release();
    }
  }

  async markMediaStreamActive(sessionId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query<DbSessionRow>(
        `
          UPDATE sessions
          SET status = CASE
            WHEN status IN ('ringing', 'dialing') THEN 'in_progress'
            ELSE status
          END,
          answered_at = COALESCE(answered_at, NOW()),
          updated_at = NOW()
          WHERE id = $1
        `,
        [sessionId]
      );
      await this.writeWebhookEvent(
        client,
        "media_stream",
        `twilio:media:frame:${sessionId}:${Date.now()}`,
        {
          event: "media_stream_media",
          sessionId,
          receivedAt: nowIso()
        }
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_mark_media_stream_active");
    } finally {
      client.release();
    }
  }

  async markMediaStreamError(sessionId: string, reason: string, details: Record<string, unknown>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.writeWebhookEvent(
        client,
        "media_stream",
        `twilio:media:error:${sessionId}:${Date.now()}`,
        {
          event: "media_stream_error",
          sessionId,
          reason,
          details,
          at: nowIso()
        }
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
      } finally {
      client.release();
    }
  }

  async appendMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    timestampMs: number,
    isFinal = true
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const nextSeqResult = await client.query<{ sequence_no: string }>(
        "SELECT COALESCE(MAX(sequence_no), -1) + 1 AS sequence_no FROM messages WHERE session_id = $1",
        [sessionId]
      );
      const sequenceNo = Number(nextSeqResult.rows[0]?.sequence_no ?? 0);

      const inserted = await client.query<DbMessageRow>(
        `
          INSERT INTO messages (session_id, sequence_no, role, content, timestamp_ms, is_final, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING sequence_no
        `,
        [sessionId, sequenceNo, role, content, timestampMs, isFinal]
      );

      await client.query("COMMIT");
      if (inserted.rows.length === 0) {
        throw new AppError("internal_error", "failed_to_append_message");
      }
      return inserted.rows[0].sequence_no;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_append_message");
    } finally {
      client.release();
    }
  }

  async getSessionMessages(
    clerkUserId: ClerkUserId,
    sessionId: string,
    limit?: number
  ): Promise<{ sessionId: string; messages: TranscriptMessage[] }> {
    await this.getSession(clerkUserId, sessionId);

    const params: Array<string | number> = [sessionId];
    let query = `
      SELECT sequence_no, role, content, timestamp_ms, is_final, created_at
      FROM messages
      WHERE session_id = $1
      ORDER BY sequence_no ASC
    `;

    if (limit !== undefined) {
      params.push(limit);
      query += ` LIMIT $2`;
    }

    const result = await this.pool.query<DbMessageRow>(query, params);
    return {
      sessionId,
      messages: result.rows.map((row) => ({
        sequenceNo: row.sequence_no,
        role: row.role,
        content: row.content,
        timestampMs: row.timestamp_ms === null ? null : Number(row.timestamp_ms),
        isFinal: row.is_final,
        createdAt: row.created_at
      }))
    };
  }

  async startWebVoiceCall(
    sessionId: string,
    clerkUserId: ClerkUserId,
    idempotencyKey: string
  ): Promise<{ session: Session; callId: string }> {
    const session = await this.getSession(clerkUserId, sessionId);
    if (session.status !== "ready") {
      throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "immediate session is not ready to start");
    }
    return this.bootstrapWebVoiceSession(session, idempotencyKey, false);
  }

  async joinWebVoiceCall(
    sessionId: string,
    clerkUserId: ClerkUserId,
    idempotencyKey: string
  ): Promise<{ session: Session; callId: string }> {
    const session = await this.getSession(clerkUserId, sessionId);
    if (session.status !== "scheduled" && session.status !== "ready") {
      throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "session is not joinable");
    }
    return this.bootstrapWebVoiceSession(session, idempotencyKey, true);
  }

  private async bootstrapWebVoiceSession(
    session: Session,
    idempotencyKey: string,
    allowScheduledJoin: boolean
  ): Promise<{ session: Session; callId: string }> {
    const idempotency = idempotencyKey || randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const lockedSession = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [session.id, session.userId]
      );
      if (lockedSession.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }
      const sessionRow = lockedSession.rows[0];
      if (sessionRow.status !== "ready" && (!allowScheduledJoin || sessionRow.status !== "scheduled")) {
        throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "invalid session state for live voice start");
      }

      if (sessionRow.status === "scheduled" && sessionRow.scheduled_for_at_utc) {
        const scheduledAt = new Date(sessionRow.scheduled_for_at_utc).getTime();
        if (Number.isNaN(scheduledAt)) {
          throw new AppError("validation_error", "scheduled session time is invalid");
        }
        const joinWindowStarts = scheduledAt - (10 * 60 * 1000);
        if (Date.now() < joinWindowStarts) {
          throw new AppError("validation_error", "scheduled session can be joined 10 minutes before start");
        }
      }

      const userRow = await client.query<DbUserRow>(
        "SELECT * FROM users WHERE id = $1 FOR UPDATE",
        [sessionRow.user_id]
      );
      if (userRow.rows.length === 0) {
        throw new AppError(DB_ERROR.USER_NOT_FOUND, "user not found");
      }

      let reservedTrialCall = sessionRow.reserved_trial_call;
      let reservedMinutes = sessionRow.reserved_minutes;

      if (!reservedTrialCall && reservedMinutes === 0 && sessionRow.status === "ready") {
        if (userRow.rows[0].trial_calls_remaining > 0) {
          reservedTrialCall = true;
          await client.query(
            "UPDATE users SET trial_calls_remaining = trial_calls_remaining - 1, updated_at = NOW() WHERE id = $1",
            [sessionRow.user_id]
          );
          await this.writeLedger(
            client,
            sessionRow.user_id,
            "trial_call",
            "reserve",
            -1,
            session.id,
            "web voice reservation from trial call"
          );
        } else if (userRow.rows[0].paid_minutes_balance >= sessionRow.duration_target_minutes) {
          reservedMinutes = sessionRow.duration_target_minutes;
          await client.query(
            "UPDATE users SET paid_minutes_balance = paid_minutes_balance - $2, updated_at = NOW() WHERE id = $1",
            [sessionRow.user_id, sessionRow.duration_target_minutes]
          );
          await this.writeLedger(
            client,
            sessionRow.user_id,
            "paid_minute",
            "reserve",
            -sessionRow.duration_target_minutes,
            session.id,
            "web voice reservation from paid minutes"
          );
        } else {
          throw new AppError(DB_ERROR.INSUFFICIENT_ALLOWANCE, "insufficient allowance for live session");
        }
      }

      const callId = sessionRow.call_id ?? `WV_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
      const accuracyPolicy =
        (asObject(sessionRow.accuracy_policy) as unknown as SessionAccuracyPolicy | undefined) ??
        buildSessionAccuracyPolicy(this.mapSession(sessionRow));
      const updated = await client.query<DbSessionRow>(
        `
          UPDATE sessions
          SET call_id = $1,
              status = 'connecting',
              failure_reason = NULL,
              reserved_trial_call = $2,
              reserved_minutes = $3,
              accuracy_policy = COALESCE(accuracy_policy, $4::jsonb),
              updated_at = NOW()
          WHERE id = $5
          RETURNING *
        `,
        [callId, reservedTrialCall, reservedMinutes, JSON.stringify(accuracyPolicy), session.id]
      );
      if (updated.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }

      await this.writeWebhookEvent(
        client,
        "media",
        `webvoice:bootstrap:${session.id}:${idempotency}`,
        {
          event: "web_voice_bootstrap",
          sessionId: session.id,
          callId,
          status: "connecting",
          scheduled: sessionRow.status === "scheduled",
          at: nowIso()
        },
        "web_voice"
      );

      await client.query("COMMIT");
      return {
        session: this.mapSession(updated.rows[0]),
        callId
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_bootstrap_web_voice_session");
    } finally {
      client.release();
    }
  }

  async failWebVoiceBootstrap(
    sessionId: string,
    clerkUserId: ClerkUserId,
    reason: FailureReason = "platform_fault"
  ): Promise<Session> {
    const session = await this.getSession(clerkUserId, sessionId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [session.id, session.userId]
      );
      if (locked.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }
      const row = locked.rows[0];
      if (row.reserved_trial_call || row.reserved_minutes > 0) {
        await this.releaseScheduledAllowance(client, row.user_id, row, "web voice bootstrap failed");
      }
      const updated = await client.query<DbSessionRow>(
        `
          UPDATE sessions
          SET status = 'failed',
              failure_reason = $2,
              reserved_trial_call = false,
              reserved_minutes = 0,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [row.id, reason]
      );
      await client.query("COMMIT");
      return this.mapSession(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_fail_web_voice_bootstrap");
    } finally {
      client.release();
    }
  }

  async handleWebVoiceRuntimeEvent(
    sessionId: string,
    clerkUserId: ClerkUserId,
    payload: WebVoiceRuntimeEventPayload
  ): Promise<Session> {
    const session = await this.getSession(clerkUserId, sessionId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [session.id, session.userId]
      );
      if (locked.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }
      const row = locked.rows[0];

      let nextStatus = row.status;
      let failureReason = row.failure_reason as FailureReason | null;
      let ended = false;
      let releaseReservation = false;

      switch (payload.event) {
        case "connecting":
          nextStatus = "connecting";
          break;
        case "connected":
          nextStatus = "in_progress";
          break;
        case "participant_left":
          nextStatus = "ending";
          break;
        case "permission_denied":
          nextStatus = "failed";
          failureReason = "mic_permission_denied";
          ended = true;
          releaseReservation = true;
          break;
        case "network_error":
          nextStatus = "failed";
          failureReason = "network_error";
          ended = true;
          releaseReservation = true;
          break;
        case "media_error":
          nextStatus = "failed";
          failureReason = "media_connection_failed";
          ended = true;
          releaseReservation = true;
          break;
        default:
          throw new AppError("validation_error", "unsupported runtime event");
      }

      if (releaseReservation && (row.reserved_trial_call || row.reserved_minutes > 0)) {
        await this.releaseScheduledAllowance(client, row.user_id, row, `web voice runtime event: ${payload.event}`);
      }

      const updated = await client.query<DbSessionRow>(
        `
          UPDATE sessions
          SET status = $2,
              failure_reason = $3,
              answered_at = CASE WHEN $4::boolean THEN COALESCE(answered_at, NOW()) ELSE answered_at END,
              ended_at = CASE WHEN $5::boolean THEN COALESCE(ended_at, NOW()) ELSE ended_at END,
              reserved_trial_call = CASE WHEN $5::boolean THEN false ELSE reserved_trial_call END,
              reserved_minutes = CASE WHEN $5::boolean THEN 0 ELSE reserved_minutes END,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [row.id, nextStatus, failureReason, payload.event === "connected", ended]
      );

      await this.writeWebhookEvent(
        client,
        "media",
        `webvoice:event:${row.id}:${payload.event}:${Date.now()}`,
        {
          event: payload.event,
          sessionId: row.id,
          detail: payload.detail,
          connectionState: payload.connectionState,
          at: nowIso()
        },
        "web_voice"
      );

      await client.query("COMMIT");
      return this.mapSession(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_handle_web_voice_runtime_event");
    } finally {
      client.release();
    }
  }

  async completeWebVoiceCall(
    sessionId: string,
    clerkUserId: ClerkUserId,
    payload: CompleteWebVoiceCallPayload
  ): Promise<Session> {
    const session = await this.getSession(clerkUserId, sessionId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [session.id, session.userId]
      );
      if (locked.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }
      const row = locked.rows[0];
      const accuracyPolicy =
        (asObject(row.accuracy_policy) as SessionAccuracyPolicy | undefined) ??
        buildSessionAccuracyPolicy(this.mapSession(row));

      const transcript = Array.isArray(payload.transcript) ? payload.transcript : [];
      const normalizedMessages = transcript
        .filter((message): message is WebVoiceTranscriptSegment => !!message && typeof message.content === "string" && typeof message.role === "string")
        .map((message) => ({
          role: message.role.trim(),
          content: message.content.trim(),
          timestampMs: message.timestampMs ?? null,
          isFinal: message.isFinal ?? true
        }))
        .filter((message) =>
          message.content.length > 0 &&
          (message.role === "assistant" || message.role === "user" || message.role === "system")
        )
        .map((message, index) => ({
          sequenceNo: index,
          role: message.role,
          content: message.content,
          timestampMs: message.timestampMs,
          isFinal: message.isFinal
        }));

      const accuracyValidation = validateCompletedTranscript(
        this.mapSession(row),
        normalizedMessages.map((message) => ({
          role: message.role,
          content: message.content,
          timestampMs: message.timestampMs,
          isFinal: message.isFinal
        })),
        accuracyPolicy
      );
      const accuracyState = toAccuracyState(accuracyValidation);

      if (normalizedMessages.length > 0) {
        await client.query("DELETE FROM messages WHERE session_id = $1", [row.id]);
        for (const message of normalizedMessages) {
          await client.query(
            `
              INSERT INTO messages (session_id, sequence_no, role, content, timestamp_ms, is_final, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `,
            [row.id, message.sequenceNo, message.role, message.content, message.timestampMs, message.isFinal]
          );
        }
      }

      let updatedRow: DbSessionRow;
      if (payload.failureReason) {
        if (payload.failureReason === "platform_fault" && (row.reserved_trial_call || row.reserved_minutes > 0)) {
          await this.refundScheduledAllowance(client, row.user_id, row, "web voice session platform fault");
        } else if (row.reserved_trial_call || row.reserved_minutes > 0) {
          await this.releaseScheduledAllowance(client, row.user_id, row, `web voice session failed: ${payload.failureReason}`);
        }

        const failed = await client.query<DbSessionRow>(
          `
            UPDATE sessions
            SET status = 'failed',
                failure_reason = $2,
                accuracy_policy = COALESCE(accuracy_policy, $3::jsonb),
                accuracy_state = $4::jsonb,
                reserved_trial_call = false,
                reserved_minutes = 0,
                ended_at = COALESCE(ended_at, NOW()),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [row.id, payload.failureReason, JSON.stringify(accuracyPolicy), JSON.stringify(accuracyState)]
        );
        updatedRow = failed.rows[0];
      } else {
        if (row.reserved_trial_call || row.reserved_minutes > 0) {
          await this.commitScheduledAllowance(client, row.user_id, row, "web voice session completed");
        }
        const completed = await client.query<DbSessionRow>(
          `
            UPDATE sessions
            SET status = 'completed',
                failure_reason = NULL,
                report_status = 'pending',
                accuracy_policy = COALESCE(accuracy_policy, $2::jsonb),
                accuracy_state = $3::jsonb,
                reserved_trial_call = false,
                reserved_minutes = 0,
                answered_at = COALESCE(answered_at, NOW()),
                completed_at = COALESCE(completed_at, NOW()),
                ended_at = COALESCE(ended_at, NOW()),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [row.id, JSON.stringify(accuracyPolicy), JSON.stringify(accuracyState)]
        );
        updatedRow = completed.rows[0];
      }

      await this.writeWebhookEvent(
        client,
        "media",
        `webvoice:complete:${row.id}:${Date.now()}`,
        {
          event: "web_voice_complete",
          sessionId: row.id,
          endReason: payload.endReason,
          failureReason: payload.failureReason ?? null,
          transcriptCount: normalizedMessages.length,
          at: nowIso()
        },
        "web_voice"
      );
      await this.writeWebhookEvent(
        client,
        "media",
        `webvoice:accuracy:${row.id}:${Date.now()}`,
        {
          event: "web_voice_accuracy_validated",
          sessionId: row.id,
          flags: accuracyState.flags,
          driftDetected: accuracyState.driftDetected,
          intentMismatchDetected: accuracyState.intentMismatchDetected,
          correctionMismatchDetected: accuracyState.correctionMismatchDetected,
          fallbackRecommended: accuracyValidation.fallbackRecommended,
          at: nowIso()
        },
        "web_voice"
      );

      await client.query("COMMIT");
      return this.mapSession(updatedRow);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_complete_web_voice_call");
    } finally {
      client.release();
    }
  }

  private async writeWebhookEvent(
    client: PoolClient,
    provider: "twilio" | "kakao" | "telegram" | "payments" | "media" | "media_stream",
    dedupeKey: string,
    payload: Record<string, unknown>,
    eventType = "media_stream"
  ) {
    await client.query(
      `INSERT INTO webhook_events (provider, event_type, dedupe_key, payload, processed, created_at)
       VALUES ($1, $2, $3, $4::jsonb, true, NOW())
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [provider, eventType, dedupeKey, JSON.stringify(payload)]
    );
  }

  async updateScheduledSession(
    clerkUserId: ClerkUserId,
    sessionId: string,
    payload: { scheduledForAtUtc?: string; timezone?: string }
  ): Promise<Session> {
    if (!payload.scheduledForAtUtc && !payload.timezone) {
      throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "at least one scheduled field is required");
    }

    const user = await this.getUser(clerkUserId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [sessionId, user.id]
      );
      if (existing.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }
      const current = existing.rows[0];

      if (current.status !== "scheduled") {
        throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "only scheduled sessions can be updated");
      }

      const scheduledForAtUtc = payload.scheduledForAtUtc ?? current.scheduled_for_at_utc;
      if (!scheduledForAtUtc) {
        throw new AppError(DB_ERROR.SCHEDULED_TIME_REQUIRED, "scheduledForAtUtc is required");
      }

      this.assertScheduledConstraint(scheduledForAtUtc);
      const reminderAtUtc = this.computeReminderAt(scheduledForAtUtc);
      const timezone = payload.timezone ?? current.timezone;

      const updated = await client.query<DbSessionRow>(
        `
          UPDATE sessions
          SET
            scheduled_for_at_utc = $1,
            timezone = $2,
            reminder_at_utc = $3,
            reminder_sent = false,
            reminder_sent_at = NULL,
            updated_at = NOW()
          WHERE id = $4 AND user_id = $5 AND status = 'scheduled'
          RETURNING *
        `,
        [scheduledForAtUtc, timezone, reminderAtUtc, sessionId, user.id]
      );

      if (updated.rows.length === 0) {
        throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "session could not be updated");
      }

      await client.query("COMMIT");
      return this.mapSession(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed to update session");
    } finally {
      client.release();
    }
  }

  async cancelScheduledSession(clerkUserId: ClerkUserId, sessionId: string): Promise<Session> {
    const user = await this.getUser(clerkUserId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const current = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [sessionId, user.id]
      );
      if (current.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }

      const session = current.rows[0];
      if (session.status === "user_cancelled") {
        await client.query("COMMIT");
        return this.mapSession(session);
      }
      if (session.status !== "scheduled") {
        throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "only scheduled sessions can be cancelled");
      }

      const userRow = await client.query<DbUserRow>(
        "SELECT * FROM users WHERE id = $1 FOR UPDATE",
        [user.id]
      );
      if (userRow.rows.length === 0) {
        throw new AppError(DB_ERROR.USER_NOT_FOUND, "user not found");
      }

      await this.releaseScheduledAllowance(
        client,
        user.id,
        session,
        "scheduled session cancelled"
      );

      await client.query(
        `
          UPDATE sessions
          SET status = 'user_cancelled', reserved_trial_call = false, reserved_minutes = 0, updated_at = NOW()
          WHERE id = $1 AND user_id = $2
        `,
        [sessionId, user.id]
      );

      const cancelled = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 AND user_id = $2 LIMIT 1",
        [sessionId, user.id]
      );
      if (cancelled.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }

      await client.query("COMMIT");
      return this.mapSession(cancelled.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed to cancel session");
    } finally {
      client.release();
    }
  }

  async dispatchDueScheduledSessions(
    limit = 1,
    options: OutboundCallOptions = {}
  ): Promise<Session[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = nowIso();
      const dueSessions = await client.query<DbSessionRow>(
        `
          SELECT *
          FROM sessions
          WHERE status = 'scheduled'
            AND scheduled_for_at_utc <= $1
            AND dispatch_deadline_at_utc > $1
          ORDER BY scheduled_for_at_utc ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        `,
        [now, limit]
      );
      if (dueSessions.rows.length === 0) {
        await client.query("COMMIT");
        return [];
      }

      const dispatchedSessions: Session[] = [];
      for (const session of dueSessions.rows) {
        const callId = session.call_id ?? `CA_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
        const dedupeKey = `twilio:worker_dispatch:${session.id}:${callId}`;
        const updateResult = await client.query<DbSessionRow>(
          `
            UPDATE sessions
            SET
              status = 'dialing',
              call_id = $2,
              updated_at = NOW()
            WHERE id = $1
              AND status = 'scheduled'
            RETURNING *
          `,
          [session.id, callId]
        );
        if (updateResult.rows.length === 0) {
          continue;
        }
        const updated = updateResult.rows[0];
        const user = await client.query<DbUserRow>(
          "SELECT * FROM users WHERE id = $1 FOR UPDATE",
          [updated.user_id]
        );
        if (user.rows.length === 0) {
          await this.writeWebhookEvent(
            client,
            "twilio",
            dedupeKey,
            {
              sessionId: updated.id,
              callId: updated.call_id,
              reason: "user not found"
            },
            "worker_call_dispatch"
          );
          continue;
        }

        const to = this.resolveToNumber(user.rows[0]);
        const from = this.resolveFromNumber(options.from);
        if (!to) {
          const terminalSession = await this.applySessionTerminalTransition(
            client,
            updated,
            "provider_error",
            "provider_error"
          );
          await this.writeWebhookEvent(
            client,
            "twilio",
            dedupeKey,
            {
              sessionId: terminalSession.id,
              userId: terminalSession.user_id,
              reason: "destination phone number is required"
            },
            "worker_call_dispatch"
          );
          continue;
        }
        if (!from) {
          const terminalSession = await this.applySessionTerminalTransition(
            client,
            updated,
            "provider_error",
            "provider_error"
          );
          await this.writeWebhookEvent(
            client,
            "twilio",
            dedupeKey,
            {
              sessionId: terminalSession.id,
              userId: terminalSession.user_id,
              reason: "provider from-phone is required"
            },
            "worker_call_dispatch"
          );
          continue;
        }

        const twimlUrl = this.resolveTwimlUrl(updated.call_id ?? callId, options.twimlUrl);
        const outboundResult = await createOutboundCall({
          sessionId: updated.id,
          to,
          from,
          callSid: updated.call_id ?? callId,
          twimlUrl: twimlUrl || "",
          statusCallbackUrl: this.resolveStatusCallbackUrl(options.statusCallbackUrl),
          statusCallbackEvents: ["initiated", "ringing", "answered", "completed"],
          timeoutSeconds: options.timeoutSeconds
        });
        if (outboundResult.status === "failed") {
          const terminalSession = await this.applySessionTerminalTransition(
            client,
            updated,
            "provider_error",
            "provider_error",
            {
              providerCallSid: outboundResult.providerCallSid
            }
          );
          await this.writeWebhookEvent(
            client,
            "twilio",
            dedupeKey,
            {
              sessionId: terminalSession.id,
              userId: terminalSession.user_id,
              reason: outboundResult.reason ?? "provider error",
              provider: outboundResult.provider,
              status: outboundResult.status,
              providerCallSid: outboundResult.providerCallSid
            },
            "worker_call_dispatch"
          );
          continue;
        }

        if (outboundResult.providerCallSid) {
          const updatedSid = await client.query<DbSessionRow>(
            "UPDATE sessions SET provider_call_sid = COALESCE(provider_call_sid, $1), updated_at = NOW() WHERE id = $2 RETURNING *",
            [outboundResult.providerCallSid, updated.id]
          );
          if (updatedSid.rows.length > 0) {
            Object.assign(updated, updatedSid.rows[0]);
          }
        }
        await this.writeWebhookEvent(
          client,
          "twilio",
          dedupeKey,
          {
            sessionId: updated.id,
            userId: updated.user_id,
            reason: "dispatched",
            status: outboundResult.status,
            provider: outboundResult.provider,
            providerCallSid: outboundResult.providerCallSid,
            callId: updated.call_id
          },
          "worker_call_dispatch"
        );
        dispatchedSessions.push(this.mapSession(updated));
      }

      await client.query("COMMIT");
      return dispatchedSessions;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed to dispatch due scheduled sessions");
    } finally {
      client.release();
    }
  }

  async sendDueReminders(limit = 20): Promise<{ sent: number; sessionIds: string[] }> {
    const now = nowIso();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const due = await client.query<{ id: string; userId: string; publicId: string }>(
        `
          WITH due AS (
            SELECT id, user_id AS "userId", public_id AS "publicId"
            FROM sessions
            WHERE status = 'scheduled'
              AND reminder_at_utc <= $1
              AND reminder_sent = false
            ORDER BY reminder_at_utc ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $2
          )
          SELECT id, "userId", "publicId"
          FROM due
        `,
        [now, limit]
      );

      const sentIds: string[] = [];
      for (const reminder of due.rows) {
        const providers = this.resolveNotificationProviders();
        const notifyAttempts = await Promise.all(
          providers.map((provider) => this.sendReminderNotificationByProvider({
            sessionId: reminder.id,
            sessionPublicId: reminder.publicId,
            userId: reminder.userId,
            scheduledAt: now
          }, provider))
        );
        const summary = this.aggregateNotificationSummary(notifyAttempts);

        const updated = await client.query<{ id: string }>(
          `
            UPDATE sessions
            SET
              reminder_sent = true,
              reminder_sent_at = NOW(),
              updated_at = NOW()
            WHERE id = $1 AND reminder_sent = false
            RETURNING id
          `,
          [reminder.id]
        );
        if (updated.rows.length === 0) {
          continue;
        }

        for (const notifyResult of notifyAttempts) {
          await this.writeWebhookEvent(
            client,
            notifyResult.provider,
            this.getWebhookDedupeKey(notifyResult.provider, "reminder", `${reminder.id}:${notifyResult.provider}`),
            {
              event: "scheduled_reminder_dispatch",
              sessionId: reminder.id,
              sessionPublicId: reminder.publicId,
              userId: reminder.userId,
              scheduledAt: now,
              provider: notifyResult.provider,
              status: notifyResult.status,
              messageId: notifyResult.messageId,
              reason: notifyResult.reason ?? null,
              summaryStatus: summary.status,
              summaryOk: summary.ok,
              messageIds: summary.messageIds,
              attempts: this.getNotificationEventPayloadSummary(notifyAttempts)
            },
            `${notifyResult.provider}_reminder`
          );
        }
        sentIds.push(updated.rows[0].id);
      }

      await client.query("COMMIT");
      return { sent: sentIds.length, sessionIds: sentIds };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed to send reminders");
    } finally {
      client.release();
    }
  }

  async sendReportReadyNotifications(limit = 20): Promise<{ notified: number; reportIds: string[] }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const due = await client.query<{
        reportId: string;
        sessionId: string;
        publicReportId: string;
        userId: string;
        errorCode: string | null;
      }>(
        `
          SELECT
            r.id AS "reportId",
            r.session_id AS "sessionId",
            r.public_id AS "publicReportId",
            s.user_id AS "userId",
            r.error_code AS "errorCode"
          FROM reports r
          INNER JOIN sessions s ON s.id = r.session_id
          WHERE r.status = 'ready'
            AND (
              r.kakao_status IS NULL
              OR r.kakao_status NOT IN ('accepted', 'sent')
              OR (
                r.kakao_status = 'failed'
                AND (r.error_code IS NULL OR r.error_code NOT LIKE 'retry_5%')
              )
            )
          ORDER BY r.created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        `,
        [limit]
      );

      const notifiedIds: string[] = [];
      const parseRetryCount = (errorCode: string | null) => {
        const matched = /^retry_(\d+)_/i.exec(errorCode ?? "");
        if (!matched) {
          return 0;
        }
        const value = Number.parseInt(matched[1], 10);
        return Number.isNaN(value) ? 0 : value;
      };

      for (const report of due.rows) {
        const providers = this.resolveNotificationProviders();
        const notifyAttempts = await Promise.all(
          providers.map((provider) => this.sendReportNotificationByProvider({
            reportId: report.reportId,
            sessionId: report.sessionId,
            publicReportId: report.publicReportId,
            userId: report.userId,
            publicSummaryUrl: buildPublicSummaryUrl(report.publicReportId)
          }, provider))
        );
        const summary = this.aggregateNotificationSummary(notifyAttempts);
        const currentRetryCount = parseRetryCount(report.errorCode);
        const nextRetryCount = currentRetryCount + 1;
        const canRetry = !summary.ok && nextRetryCount <= 5;
        const kakaoStatus = summary.ok
          ? summary.status === "accepted"
            ? "accepted"
            : "sent"
          : canRetry
            ? "retrying"
            : "failed";
        const normalizedFailureReason = summary.reason ?? "notification_delivery_error";
        const nextErrorCode = canRetry
          ? `retry_${nextRetryCount}_${normalizedFailureReason}`
          : summary.ok
            ? ""
            : normalizedFailureReason;

        const updated = await client.query<{ id: string }>(
          `
            UPDATE reports
            SET kakao_status = $2,
              kakao_sent_at = CASE WHEN $2 IN ('sent', 'accepted') THEN COALESCE(kakao_sent_at, NOW()) ELSE kakao_sent_at END,
              error_code = CASE
                WHEN $2 IN ('failed', 'retrying') AND $3::text <> '' THEN $3::text
                WHEN $2 IN ('sent', 'accepted') THEN NULL
                ELSE error_code
              END
            WHERE id = $1
              AND (kakao_status IS NULL OR kakao_status NOT IN ('accepted', 'sent'))
            RETURNING id
          `,
            [report.reportId, kakaoStatus, nextErrorCode]
        );
        if (updated.rows.length === 0) {
          continue;
        }

        const nextStatus = kakaoStatus;

        for (const attempt of notifyAttempts) {
          await this.writeWebhookEvent(
            client,
            attempt.provider,
            this.getWebhookDedupeKey(attempt.provider, "report_ready", `${report.reportId}:${attempt.provider}`),
            {
              event: "report_ready_delivery",
              reportId: report.reportId,
              sessionId: report.sessionId,
              publicReportId: report.publicReportId,
              userId: report.userId,
              provider: attempt.provider,
              status: attempt.status,
              messageId: attempt.messageId,
              reason: attempt.reason ?? null,
              nextStatus: kakaoStatus,
              aggregateStatus: summary.status,
              attempts: this.getNotificationEventPayloadSummary(notifyAttempts)
            },
            `${attempt.provider}_report_ready`
          );
        }

        await this.writeWebhookEvent(
          client,
          "payments",
          this.getWebhookDedupeKey("payments", "report_ready_summary", report.reportId),
          {
            event: "report_ready_delivery_summary",
            reportId: report.reportId,
            sessionId: report.sessionId,
            publicReportId: report.publicReportId,
            userId: report.userId,
            status: nextStatus,
            reason: normalizedFailureReason,
            nextStatus: kakaoStatus,
            attempts: this.getNotificationEventPayloadSummary(notifyAttempts)
          },
          "report_delivery"
        );
        notifiedIds.push(updated.rows[0].id);
      }

      await client.query("COMMIT");
      return { notified: notifiedIds.length, reportIds: notifiedIds };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      console.error("[sendReportReadyNotifications] unexpected error", describeErrorForLog(error));
      throw new AppError("internal_error", "failed to send report notifications");
    } finally {
      client.release();
    }
  }

  async markMissedScheduledSessions(limit = 20): Promise<{ marked: number; sessionIds: string[] }> {
    const now = nowIso();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<DbSessionRow>(
        `
          WITH due AS (
            SELECT *
            FROM sessions
            WHERE status = 'scheduled'
              AND dispatch_deadline_at_utc <= $1
            ORDER BY scheduled_for_at_utc ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $2
          )
          UPDATE sessions s
          SET
            status = 'schedule_missed',
            reserved_trial_call = false,
            reserved_minutes = 0,
            failure_reason = NULL,
            updated_at = NOW()
          FROM due
          WHERE s.id = due.id
          RETURNING s.*
        `,
        [now, limit]
      );

      for (const session of result.rows) {
        if (session.reserved_trial_call || session.reserved_minutes > 0) {
          await this.releaseScheduledAllowance(
            client,
            session.user_id,
            session,
            "scheduled session missed dispatch deadline"
          );
        }
        const dedupeKey = `twilio:schedule_missed:${session.id}`;
        await client.query(
          `
            INSERT INTO webhook_events (provider, event_type, dedupe_key, payload, processed, created_at)
            VALUES ('twilio', 'schedule_missed', $1, $2::jsonb, true, NOW())
            ON CONFLICT (dedupe_key) DO NOTHING
          `,
          [dedupeKey, JSON.stringify({ sessionId: session.id })]
        );
      }

      await client.query("COMMIT");
      return {
        marked: result.rows.length,
        sessionIds: result.rows.map((row) => row.id)
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_mark_missed_scheduled_sessions");
    } finally {
      client.release();
    }
  }

  async startCall(
    sessionId: string,
    clerkUserId: ClerkUserId,
    idempotencyKey: string,
    options: OutboundCallOptions = {}
  ): Promise<StartCallResponse | Pick<StartCallResponse, "sessionId" | "callId" | "status">> {
    const idempotency = idempotencyKey || randomUUID();
    const session = await this.getSession(clerkUserId, sessionId);

    if (session.status !== "ready" && session.status !== "scheduled") {
      throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "invalid session state for call initiation");
    }

    const dedupeKey = `twilio:status:${session.callId ?? session.id}:${idempotency}`;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const lockedSession = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [session.id, session.userId]
      );
      if (lockedSession.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }
      const sessionRow = lockedSession.rows[0];
      if (sessionRow.status !== "ready" && sessionRow.status !== "scheduled") {
        throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "session state changed before call initiation");
      }

      const userRow = await client.query<DbUserRow>(
        "SELECT * FROM users WHERE id = $1 FOR UPDATE",
        [sessionRow.user_id]
      );
      if (userRow.rows.length === 0) {
        throw new AppError(DB_ERROR.USER_NOT_FOUND, "user not found");
      }

      let reservedTrialCall = sessionRow.reserved_trial_call;
      let reservedMinutes = sessionRow.reserved_minutes;

      if (!reservedTrialCall && reservedMinutes === 0 && sessionRow.status === "ready") {
        if (userRow.rows[0].trial_calls_remaining > 0) {
          reservedTrialCall = true;
          await client.query(
            "UPDATE users SET trial_calls_remaining = trial_calls_remaining - 1, updated_at = NOW() WHERE id = $1",
            [sessionRow.user_id]
          );
          await this.writeLedger(
            client,
            sessionRow.user_id,
            "trial_call",
            "reserve",
            -1,
            sessionRow.id,
            "immediate call reservation from trial"
          );
        } else if (userRow.rows[0].paid_minutes_balance >= sessionRow.duration_target_minutes) {
          reservedMinutes = sessionRow.duration_target_minutes;
          await client.query(
            "UPDATE users SET paid_minutes_balance = paid_minutes_balance - $2, updated_at = NOW() WHERE id = $1",
            [sessionRow.user_id, sessionRow.duration_target_minutes]
          );
          await this.writeLedger(
            client,
            sessionRow.user_id,
            "paid_minute",
            "reserve",
            -sessionRow.duration_target_minutes,
            sessionRow.id,
            "immediate call reservation from paid minutes"
          );
        } else {
          throw new AppError(DB_ERROR.INSUFFICIENT_ALLOWANCE, "insufficient allowance for immediate call");
        }
      }

      const existing = await client.query<DbSessionQueryResult>(
        "SELECT payload FROM webhook_events WHERE dedupe_key = $1 LIMIT 1",
        [dedupeKey]
      );
      if (existing.rows.length > 0 && existing.rows[0].payload?.callId) {
        const status = existing.rows[0].payload?.status === "failed" ? "provider_error" : "dialing";
        await client.query("COMMIT");
        return {
          sessionId: session.id,
          callId: existing.rows[0].payload.callId,
          status: status as SessionStatus
        };
      }

      const callId = sessionRow.call_id ?? `CA_${randomUUID().replace(/-/g, "").slice(0, 18)}`;

      const updateResult = await client.query(
        `
          UPDATE sessions
          SET call_id = $1,
              status = 'dialing',
              reserved_trial_call = $2,
              reserved_minutes = $3,
              updated_at = NOW()
          WHERE id = $4 AND user_id = $5 AND (status = 'ready' OR status = 'scheduled')
        `,
        [callId, reservedTrialCall, reservedMinutes, session.id, session.userId]
      );
      if ((updateResult.rowCount ?? 0) === 0) {
        throw new AppError(DB_ERROR.INVALID_SESSION_STATE, "session state changed before call initiation");
      }
      const updatedSession = updateResult.rows[0];

      const to = this.resolveToNumber(userRow.rows[0]);
      const from = this.resolveFromNumber(options.from);
      if (!to) {
        const terminalSession = await this.applySessionTerminalTransition(
          client,
          updatedSession,
          "provider_error",
          "provider_error"
        );
        await this.writeWebhookEvent(
          client,
          "twilio",
          dedupeKey,
          {
            sessionId: terminalSession.id,
            userId: terminalSession.user_id,
            callId,
            idempotencyKey: idempotency,
            status: "failed",
            reason: "destination phone number is required"
          },
          "call_initiate"
        );
        await client.query("COMMIT");
        throw new AppError("validation_error", "destination phone number is required");
      }
      if (!from) {
        const terminalSession = await this.applySessionTerminalTransition(
          client,
          updatedSession,
          "provider_error",
          "provider_error"
        );
        await this.writeWebhookEvent(
          client,
          "twilio",
          dedupeKey,
          {
            sessionId: terminalSession.id,
            userId: terminalSession.user_id,
            callId,
            idempotencyKey: idempotency,
            status: "failed",
            reason: "provider from-phone is required"
          },
          "call_initiate"
        );
        await client.query("COMMIT");
        throw new AppError("validation_error", "provider from-phone is required");
      }

      const twimlUrl = this.resolveTwimlUrl(callId, options.twimlUrl);
      const outboundResult = await createOutboundCall({
        sessionId: updatedSession.id,
        to,
        from,
        callSid: callId,
        twimlUrl: twimlUrl || "",
        statusCallbackUrl: this.resolveStatusCallbackUrl(options.statusCallbackUrl),
        statusCallbackEvents: ["initiated", "ringing", "answered", "completed"],
        timeoutSeconds: options.timeoutSeconds
      });

      if (outboundResult.status === "failed") {
        const terminalSession = await this.applySessionTerminalTransition(
          client,
          updatedSession,
          "provider_error",
          "provider_error",
          {
            providerCallSid: outboundResult.providerCallSid
          }
        );
        await this.writeWebhookEvent(
          client,
          "twilio",
          dedupeKey,
          {
            sessionId: terminalSession.id,
            userId: terminalSession.user_id,
            callId,
            idempotencyKey: idempotency,
            provider: outboundResult.provider,
            status: "failed",
            providerCallSid: outboundResult.providerCallSid,
            reason: outboundResult.reason
          },
          "call_initiate"
        );
        await client.query("COMMIT");
        throw new AppError(
          "validation_error",
          `failed to initiate outbound call: ${outboundResult.reason ?? "provider error"}`
        );
      }

      let finalSession = updatedSession;
      if (outboundResult.providerCallSid) {
        const providerUpdated = await client.query<DbSessionRow>(
          "UPDATE sessions SET provider_call_sid = COALESCE(provider_call_sid, $1), updated_at = NOW() WHERE id = $2 RETURNING *",
          [outboundResult.providerCallSid, updatedSession.id]
        );
        if (providerUpdated.rows.length > 0) {
          finalSession = providerUpdated.rows[0];
        }
      }

      await client.query(
        `INSERT INTO webhook_events (provider, event_type, dedupe_key, payload, processed, created_at)
         VALUES ('twilio', 'call_initiate', $1, $2::jsonb, true, NOW())`,
        [
          dedupeKey,
          JSON.stringify({
            sessionId: finalSession.id,
            userId: finalSession.user_id,
            callId,
            idempotencyKey: idempotency,
            provider: outboundResult.provider,
            status: outboundResult.status,
            providerCallSid: outboundResult.providerCallSid
          })
        ]
      );

      await client.query("COMMIT");
      return {
        sessionId: finalSession.id,
        callId,
        status: finalSession.status
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed to initiate call");
    } finally {
      client.release();
    }
  }

  private async applySessionTerminalTransition(
    client: PoolClient,
    session: DbSessionRow,
    status: Exclude<SessionStatus, "ready" | "scheduled" | "dialing" | "ringing" | "in_progress" | "ending">,
    reason?: FailureReason,
    options?: {
      providerCallSid?: string;
      sequenceNumber?: number;
      answeredAt?: boolean;
    }
  ): Promise<DbSessionRow> {
    const shouldReleaseAllowance = ["no_answer", "busy", "provider_error", "voicemail", "schedule_missed"].includes(status);
    const shouldRefundOnPlatformFault = status === "provider_error" && reason === "platform_fault";

    if (shouldRefundOnPlatformFault && (session.reserved_trial_call || session.reserved_minutes > 0)) {
      await this.refundScheduledAllowance(
        client,
        session.user_id,
        session,
        reason
          ? `scheduled terminal refund: ${reason}`
          : "scheduled terminal refund"
      );
    } else if (shouldReleaseAllowance && (session.reserved_trial_call || session.reserved_minutes > 0)) {
      await this.releaseScheduledAllowance(
        client,
        session.user_id,
        session,
        reason
          ? `scheduled terminal update: ${reason}`
          : "scheduled terminal update"
      );
    }

    const setClauses = [
      "status = $1",
      "failure_reason = $2",
      "reserved_trial_call = false",
      "reserved_minutes = 0",
      "updated_at = NOW()"
    ];
    const params: Array<string | number | null> = [status, reason ?? null];
    let nextParam = 3;

    if (options?.providerCallSid !== undefined) {
      setClauses.push(`provider_call_sid = COALESCE(provider_call_sid, $${nextParam})`);
      params.push(options.providerCallSid);
      nextParam += 1;
    }

    if (options?.sequenceNumber !== undefined) {
      setClauses.push(`last_provider_sequence_number = $${nextParam}`);
      params.push(options.sequenceNumber);
      nextParam += 1;
    }

    if (options?.answeredAt) {
      setClauses.push("answered_at = COALESCE(answered_at, NOW())");
    }

    params.push(session.id);

    const updated = await client.query<DbSessionRow>(
      `
        UPDATE sessions
        SET ${setClauses.join(", ")}
        WHERE id = $${nextParam}
        RETURNING *
      `,
      params
    );

    if (updated.rows.length === 0) {
      throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
    }

    return updated.rows[0];
  }

  async markSessionTerminal(
    sessionId: string,
    status: Exclude<SessionStatus, "ready" | "scheduled" | "dialing" | "ringing" | "in_progress" | "ending">,
    reason?: FailureReason
  ): Promise<Session> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 FOR UPDATE",
        [sessionId]
      );
      if (target.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }

      const session = target.rows[0];
      const updated = await this.applySessionTerminalTransition(client, session, status, reason);

      await client.query("COMMIT");
      return this.mapSession(updated);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_mark_terminal_session");
    } finally {
      client.release();
    }
  }

  async handleTwilioStatusCallback(payload: {
    callSid: string;
    status: string;
    sequenceNumber?: number | string | null;
    sipResponseCode?: number | string | null;
    callDuration?: number | string | null;
    errorCode?: number | string | null;
    answeredBy?: string | null;
  }): Promise<Session> {
    const callSid = payload.callSid?.trim();
    const rawStatus = (payload.status ?? "").toLowerCase();
    const sequenceNumber = payload.sequenceNumber === undefined || payload.sequenceNumber === null
      ? 0
      : Number(payload.sequenceNumber);
    const sipResponseCode = payload.sipResponseCode ? String(payload.sipResponseCode) : undefined;
    const callDurationSeconds = payload.callDuration === undefined || payload.callDuration === null
      ? undefined
      : Number(payload.callDuration);
    const errorCode = payload.errorCode ? String(payload.errorCode) : undefined;
    const answeredBy = payload.answeredBy;

    if (!callSid) {
      throw new AppError("validation_error", "callSid is required");
    }
    if (Number.isNaN(sequenceNumber)) {
      throw new AppError("validation_error", "invalid sequenceNumber");
    }
    if (callDurationSeconds !== undefined && Number.isNaN(callDurationSeconds)) {
      throw new AppError("validation_error", "invalid callDuration");
    }

    const dedupeKey = this.getWebhookDedupeKey("twilio", "status", `${callSid}:${sequenceNumber}`);
    const eventPayload = {
      callSid,
      status: rawStatus,
      sequenceNumber,
      sipResponseCode,
      callDuration: callDurationSeconds,
      errorCode,
      answeredBy: answeredBy ?? null,
      receivedAt: nowIso()
    };

    const client = await this.pool.connect();
    const normalizeDuration = (value: string | number | null | undefined): number | undefined => {
      if (value === null || value === undefined) {
        return undefined;
      }
      const duration = Number.parseInt(String(value), 10);
      return Number.isNaN(duration) ? undefined : duration;
    };
    const normalizeCallbackStatus = (status: string): string => {
      return status.trim().toLowerCase().replace(/_/g, "-");
    };
    const normalizedStatus = normalizeCallbackStatus(rawStatus);
    try {
      await client.query("BEGIN");

      const target = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE call_id = $1 OR provider_call_sid = $1 ORDER BY created_at DESC LIMIT 1",
        [callSid]
      );
      if (target.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }
      const latestSession = target.rows[0];

      const existing = await client.query<{ id: string }>(
        "SELECT id FROM webhook_events WHERE dedupe_key = $1 LIMIT 1",
        [dedupeKey]
      );
      if (existing.rows.length > 0) {
        await client.query("COMMIT");
        return this.mapSession(latestSession);
      }

      const locked = await client.query<DbSessionRow>(
        "SELECT * FROM sessions WHERE id = $1 FOR UPDATE",
        [latestSession.id]
      );
      const session = locked.rows[0];
      if (!session) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }

      const previousSequence = session.last_provider_sequence_number ?? -1;
      if (sequenceNumber <= previousSequence) {
        await client.query(
          `INSERT INTO webhook_events (provider, event_type, dedupe_key, payload, processed, created_at)
           VALUES ('twilio', 'status_callback', $1, $2::jsonb, true, NOW())
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [dedupeKey, JSON.stringify({ ...eventPayload, skipped: true })]
        );
        await client.query("COMMIT");
        return this.mapSession(session);
      }

      let nextStatus: SessionStatus;
      let failureReason: FailureReason | undefined;
      let shouldSetAnsweredAt = false;
      let isTerminal = false;

      switch (normalizedStatus) {
        case "initiated":
          nextStatus = "dialing";
          break;
        case "ringing":
          nextStatus = "ringing";
          break;
        case "in-progress":
        case "answered":
          nextStatus = "in_progress";
          shouldSetAnsweredAt = true;
          break;
        case "completed":
          nextStatus = "completed";
          if (isTwilioCompletedPlatformFault(normalizeDuration(callDurationSeconds), sipResponseCode, errorCode)) {
            failureReason = "platform_fault";
          }
          break;
        case "no-answer":
          nextStatus = "no_answer";
          failureReason = classifyTwilioFailureReason("no-answer", sipResponseCode, errorCode, answeredBy);
          isTerminal = true;
          break;
        case "busy":
          nextStatus = "busy";
          failureReason = classifyTwilioFailureReason("busy", sipResponseCode, errorCode, answeredBy);
          isTerminal = true;
          break;
        case "failed":
          nextStatus = "provider_error";
          failureReason = classifyTwilioFailureReason("failed", sipResponseCode, errorCode, answeredBy);
          isTerminal = true;
          break;
        case "voicemail":
          nextStatus = "voicemail";
          failureReason = classifyTwilioFailureReason("voicemail", sipResponseCode, errorCode, answeredBy);
          isTerminal = true;
          break;
        case "canceled":
        case "cancelled":
        case "error":
          nextStatus = "provider_error";
          failureReason = "provider_error";
          isTerminal = true;
          break;
        default:
          await client.query(
            `INSERT INTO webhook_events (provider, event_type, dedupe_key, payload, processed, created_at)
             VALUES ('twilio', 'status_callback', $1, $2::jsonb, true, NOW())
             ON CONFLICT (dedupe_key) DO NOTHING`,
            [dedupeKey, JSON.stringify({ ...eventPayload, skipped: true })]
          );
          await client.query("COMMIT");
          return this.mapSession(session);
      }

      if (isTerminal) {
        const terminalSession = await this.applySessionTerminalTransition(
          client,
          session,
          nextStatus as Exclude<SessionStatus, "ready" | "scheduled" | "dialing" | "ringing" | "in_progress" | "ending">,
          failureReason,
          {
            providerCallSid: callSid,
            sequenceNumber
          }
        );

        await client.query(
          `INSERT INTO webhook_events (provider, event_type, dedupe_key, payload, processed, created_at)
           VALUES ('twilio', 'status_callback', $1, $2::jsonb, true, NOW())
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [dedupeKey, JSON.stringify(eventPayload)]
        );
        await client.query("COMMIT");
        return this.mapSession(terminalSession);
      }

      const isComplete = nextStatus === "completed";
      const shouldAutoGenerateReport = isComplete && session.status !== "completed";
      if (isComplete && (session.reserved_trial_call || session.reserved_minutes > 0)) {
        if (failureReason === "platform_fault") {
          await this.refundScheduledAllowance(
            client,
            session.user_id,
            session,
            "call completed under platform fault threshold"
          );
        } else {
          await this.commitScheduledAllowance(
            client,
            session.user_id,
            session,
            failureReason
              ? `call completed: ${failureReason}`
              : "call completed"
          );
        }
      }
      if (shouldAutoGenerateReport) {
        await client.query("UPDATE sessions SET report_status = 'pending' WHERE id = $1", [session.id]);
      }

      const setClauses = [
        "provider_call_sid = COALESCE(provider_call_sid, $1)",
        "status = $2",
        "failure_reason = $3",
        "last_provider_sequence_number = $4",
        "updated_at = NOW()"
      ];
      if (shouldSetAnsweredAt) {
        setClauses.push("answered_at = NOW()");
      }
      if (isComplete) {
        setClauses.push("completed_at = COALESCE(completed_at, NOW())");
        setClauses.push("reserved_trial_call = false");
        setClauses.push("reserved_minutes = 0");
      }

      const updateResult = await client.query<DbSessionRow>(
        `
          UPDATE sessions
          SET ${setClauses.join(", ")}
          WHERE id = $5
          RETURNING *
        `,
        [callSid, nextStatus, failureReason ?? null, sequenceNumber, session.id]
      );

      await client.query(
        `INSERT INTO webhook_events (provider, event_type, dedupe_key, payload, processed, created_at)
         VALUES ('twilio', 'status_callback', $1, $2::jsonb, true, NOW())
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [dedupeKey, JSON.stringify(eventPayload)]
      );

      await client.query("COMMIT");
      if (updateResult.rows.length === 0) {
        throw new AppError(DB_ERROR.SESSION_NOT_FOUND, "session not found");
      }
      return this.mapSession(updateResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("internal_error", "failed_to_handle_twilio_status_callback");
    } finally {
      client.release();
    }
  }

  getWebhookDedupeKey(provider: "twilio" | "kakao" | "telegram" | "payments" | "media" | "media_stream", eventType: string, providerEventId: string) {
    if (provider === "twilio") return `twilio:${eventType}:${providerEventId}`;
    if (provider === "kakao") return `kakao:${eventType}:${providerEventId}`;
    if (provider === "telegram") return `telegram:${eventType}:${providerEventId}`;
    if (provider === "media") return `media:${eventType}:${providerEventId}`;
    if (provider === "media_stream") return `media_stream:${eventType}:${providerEventId}`;
    return `payments:${eventType}:${providerEventId}`;
  }
}

export { AppError, InMemoryStore };
export const store = new InMemoryStore();
export { MAX_SESSION_MINUTES };


