import {
  ContactMode,
  LessonLanguage,
  ExamType,
  FailureReason,
  SessionStatus,
  ReportStatus
} from "./enums";

export type ApiErrorCode =
  | "validation_error"
  | "conflict"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "insufficient_allowance"
  | "invalid_duration_for_plan";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: ApiError;
}

export interface UserProfile {
  id: string;
  clerkUserId: string;
  name?: string;
  email?: string;
  phoneLast4?: string;
  phoneVerified: boolean;
  phoneVerifiedAt?: string;
  trialCallsRemaining: number;
  paidMinutesBalance: number;
  planCode: string;
  uiLanguage: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  publicId: string;
  userId: string;
  status: SessionStatus;
  contactMode: ContactMode;
  language: LessonLanguage;
  exam: ExamType;
  level: string;
  topic: string;
  durationMinutes: number;
  timezone: string;
  scheduledForAtUtc?: string;
  dispatchDeadlineAtUtc?: string;
  reminderAtUtc?: string;
  reminderSent: boolean;
  reminderSentAt?: string;
  promptVersion?: string;
  callId?: string;
  reportStatus: ReportStatus;
  failureReason?: FailureReason;
  accuracyPolicy?: SessionAccuracyPolicy;
  accuracyState?: SessionAccuracyState;
  reservedTrialCall?: boolean;
  reservedMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionAccuracyPolicy {
  topicLockEnabled: boolean;
  explicitTopicSwitchRequired: boolean;
  correctionMode: "light_inline";
  maxAssistantSentences: number;
  maxAssistantQuestionsPerTurn: number;
  enforceTopicRetention: boolean;
  enforceIntentAlignment: boolean;
  enforceCorrectionRelevance: boolean;
  forbiddenDomainHints: string[];
  allowedSubtopicHints: string[];
}

export interface SessionAccuracyState {
  validationVersion: string;
  driftDetected: boolean;
  intentMismatchDetected: boolean;
  correctionMismatchDetected: boolean;
  lastValidatedAt?: string;
  flags: string[];
}

export interface AccuracyValidationResult {
  ok: boolean;
  flags: string[];
  driftScore?: number;
  intentAlignmentScore?: number;
  correctionAlignmentScore?: number;
  fallbackRecommended: boolean;
}

export interface CreateSessionPayload {
  language: LessonLanguage;
  exam: ExamType;
  level: string;
  topic: string;
  durationMinutes: number;
  contactMode: ContactMode;
  scheduledForAtUtc?: string;
  timezone?: string;
}

export interface StartCallPayload {
  sessionId: string;
  idempotencyKey?: string;
}

export interface StartCallResponse {
  sessionId: string;
  callId: string;
  status: Session["status"];
  runtime: "openai_realtime";
  connectionMode: "webrtc";
  clientSecret: string;
  model: string;
  expiresAt?: string;
}

export type JoinCallResponse = StartCallResponse;

export type WebVoiceRuntimeEventType =
  | "connecting"
  | "connected"
  | "media_error"
  | "network_error"
  | "permission_denied"
  | "participant_left";

export interface WebVoiceRuntimeEventPayload {
  event: WebVoiceRuntimeEventType;
  detail?: string;
  connectionState?: string;
}

export interface WebVoiceTranscriptSegment {
  role: MessageRole;
  content: string;
  timestampMs?: number | null;
  isFinal?: boolean;
}

export interface CompleteWebVoiceCallPayload {
  endReason: string;
  startedAt?: string;
  endedAt?: string;
  failureReason?: FailureReason;
  transcript?: WebVoiceTranscriptSegment[];
  assistantTurns?: number;
  userTurns?: number;
  validationHints?: Record<string, unknown>;
  usageSummary?: Record<string, unknown>;
}

export type MessageRole = "user" | "assistant" | "system";

export interface TranscriptMessage {
  sequenceNo: number;
  role: MessageRole;
  content: string;
  timestampMs: number | null;
  isFinal: boolean;
  createdAt: string;
}

export interface SessionMessagesResponse {
  sessionId: string;
  messages: TranscriptMessage[];
}

export interface Report {
  id: string;
  publicId: string;
  sessionId: string;
  status: ReportStatus;
  summaryText?: string;
  recommendations: string[];
  evaluation?: ReportEvaluationSummary;
  storagePath?: string;
  kakaoStatus?: string;
  kakaoSentAt?: string;
  emailStatus?: string;
  emailSentAt?: string;
  readyAt?: string;
  attemptCount: number;
  errorCode?: string;
  createdAt: string;
}

export interface ReportEvaluationSummary {
  grammarScore: number;
  vocabularyScore: number;
  fluencyScore: number;
  topicScore: number;
  totalScore: number;
  levelAssessment: string;
  grammarCorrections: ReportEvaluatorGrammarCorrection[];
  vocabularyAnalysis: string[];
  fluencyMetrics: ReportEvaluatorFluencyMetrics;
  scoringVersion: string;
}

export interface ReportEvaluatorInput {
  sessionId: string;
  language: string;
  exam: string;
  level: string;
  topic: string;
  durationMinutes: number;
  accuracyState?: SessionAccuracyState;
  messages: TranscriptMessage[];
}

export interface ReportEvaluatorGrammarCorrection {
  timestamp_ms_from_call_start: number;
  issue: string;
  suggestion: string;
}

export interface ReportEvaluatorFluencyMetrics {
  avg_wpm: number;
  filler_count: number;
  pause_count: number;
}

export interface ReportEvaluatorOutput {
  grammar_score: number;
  vocabulary_score: number;
  fluency_score: number;
  topic_score: number;
  total_score: number;
  level_assessment: string;
  grammar_corrections: ReportEvaluatorGrammarCorrection[];
  vocabulary_analysis: string[];
  fluency_metrics: ReportEvaluatorFluencyMetrics;
  scoring_version: string;
  summary_text: string;
  recommendations: string[];
}

export interface BillingPlan {
  id: string;
  code: string;
  displayName: string;
  priceKrw: number;
  includedMinutes: number;
  trialCalls: number;
  maxSessionMinutes: number;
  entitlements: unknown;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSubscription {
  id: string;
  userId: string;
  provider: string;
  providerSubscriptionId: string;
  planCode: string;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCheckoutSessionPayload {
  planCode: string;
  returnUrl?: string;
  cancelUrl?: string;
  provider?: string;
}

export interface BillingCheckoutSession {
  provider: string;
  checkoutSessionId: string;
  checkoutUrl?: string;
  planCode: string;
  orderId?: string;
  orderName?: string;
  amount?: number;
  successUrl?: string;
  failUrl?: string;
  customerKey?: string;
  customerEmail?: string;
  customerName?: string;
}

export interface BillingWebhookPayload {
  eventType: string;
  provider?: string;
  eventId?: string;
  providerSubscriptionId?: string;
  clerkUserId?: string;
  planCode?: string;
  status?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface UpdateScheduledSessionPayload {
  scheduledForAtUtc?: string;
  timezone?: string;
}

export interface StartPhoneVerificationPayload {
  phone: string;
}

export interface ConfirmPhoneVerificationPayload {
  phone: string;
  code: string;
}
