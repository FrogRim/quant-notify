import { createHmac, timingSafeEqual } from "node:crypto";
import { Request, Response, Router } from "express";
import {
  ApiResponse,
  BillingCheckoutSession,
  BillingPlan,
  BillingWebhookPayload,
  CreateCheckoutSessionPayload,
  UserSubscription
} from "@lingua/shared";
import { AppError } from "../storage/inMemoryStore";
import { requireAuthenticatedUser, AuthenticatedRequest } from "../middleware/auth";
import { billingRepository } from "../modules/billing/repository";
import { assertTossOnlyProvider, normalizeTossProvider, TOSS_PROVIDER } from "../modules/billing/tossService";

const router = Router();

type WebhookBody = Record<string, unknown>;
type WebhookObject = Record<string, unknown>;
type BillingWebhookRequest = Request & { rawBody?: string };

const pickFirstString = (...values: Array<unknown>): string | undefined => {
  return values.find((entry) => {
    return typeof entry === "string" && entry.trim().length > 0;
  }) as string | undefined;
};

const asObject = (value: unknown): WebhookObject | undefined => {
  return typeof value === "object" && value !== null ? value as WebhookObject : undefined;
};

const extractWebhookSignature = (req: BillingWebhookRequest): string | undefined => {
  const raw = req.header("x-signature") ||
    req.header("x-payment-signature") ||
    req.header("x-webhook-signature") ||
    req.header("payment-signature") ||
    req.header("stripe-signature");

  if (!raw) {
    return undefined;
  }

  const candidates = raw.split(",").map((entry) => entry.trim());
  for (const candidate of candidates) {
    if (candidate.startsWith("v1=")) {
      return candidate.slice(3);
    }
    if (candidate.startsWith("sha256=")) {
      return candidate.slice(7);
    }
    if (candidate.startsWith("sha1=")) {
      return candidate.slice(5);
    }
    if (!candidate.includes("=")) {
      return candidate;
    }
  }
  return undefined;
};

const equalSignature = (expected: string, actual: string): boolean => {
  if (!expected || !actual || expected.length !== actual.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
};

const resolveBillingWebhookSecret = (provider?: string): string | undefined => {
  const normalizedProvider = (provider ?? "").trim().toLowerCase();
  if (!normalizedProvider) {
    return process.env.BILLING_WEBHOOK_SECRET?.trim();
  }

  const providerSecret = process.env[`BILLING_WEBHOOK_SECRET_${normalizedProvider.toUpperCase()}`]?.trim();
  return providerSecret || process.env.BILLING_WEBHOOK_SECRET?.trim();
};

const verifyBillingWebhookSignatureWithProvider = (
  req: BillingWebhookRequest,
  providerHint?: string
): boolean => {
  const secret = resolveBillingWebhookSecret(providerHint)?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const signature = extractWebhookSignature(req);
  if (!signature) {
    return false;
  }

  const payloadText = req.rawBody?.trim().length
    ? req.rawBody
    : JSON.stringify(req.body as Record<string, unknown> ?? {});
  const expectedHex = createHmac("sha256", secret).update(payloadText).digest("hex");
  const expectedBase64 = createHmac("sha256", secret).update(payloadText).digest("base64");
  return equalSignature(signature, expectedHex) || equalSignature(signature, expectedBase64);
};

const readWebhookStatus = (body: WebhookBody, eventType: string | undefined): string | undefined => {
  const raw = pickFirstString(
    body.status,
    body.current_status,
    (asObject(body.data)?.status),
    (asObject(body.data)?.current_status),
    (asObject(body.data)?.object as WebhookObject)?.status,
    (asObject(body.data)?.object as WebhookObject)?.payment_status,
    (asObject(body.data)?.object as WebhookObject)?.subscription_status,
    asObject(body.object)?.status,
    asObject(body.object)?.current_status,
    asObject(body.object)?.payment_status,
    asObject(body.object)?.subscription_status
  );
  const normalized = raw?.trim().toLowerCase();
  if (normalized) {
    if (["active", "trialing"].includes(normalized)) {
      return normalized;
    }
    if (["paid", "complete", "completed", "succeeded"].includes(normalized)) {
      return "active";
    }
    if (["failed", "canceled", "cancelled", "unpaid", "past_due", "payment_failed", "requires_payment_method", "incomplete", "incomplete_expired"].includes(normalized)) {
      return normalized === "requires_payment_method" || normalized === "incomplete" || normalized === "incomplete_expired"
        ? "payment_failed"
        : normalized;
    }
    return normalized;
  }
  const normalizedEventType = (eventType ?? "").toLowerCase();
  if (normalizedEventType.includes("deleted") || normalizedEventType.includes("canceled") || normalizedEventType.includes("cancelled")) {
    return "canceled";
  }
  if (normalizedEventType.includes("expired")) {
    return "canceled";
  }
  if (normalizedEventType.includes("unpaid") || normalizedEventType.includes("incomplete_expired")) {
    return "unpaid";
  }
  if (normalizedEventType.includes("past_due")) {
    return "past_due";
  }
  if (normalizedEventType.includes("payment_failed") || normalizedEventType.includes("requires_payment_method")) {
    return "payment_failed";
  }
  if (normalizedEventType.includes("updated") || normalizedEventType.includes("created") || normalizedEventType.includes("succeeded") || normalizedEventType.includes("paid") || normalizedEventType.includes("completed")) {
    return "active";
  }
  return undefined;
};

const readPlanFromItems = (container: unknown): string | undefined => {
  const readPlanId = (value: unknown): string | undefined => {
    if (typeof value === "string") {
      return value.trim().length > 0 ? value : undefined;
    }
    const objectValue = asObject(value);
    if (!objectValue) {
      return undefined;
    }
    return pickFirstString(
      objectValue.planCode,
      objectValue.plan_code,
      objectValue.code,
      objectValue.id,
      objectValue.price_id,
      asObject(objectValue.price)?.id,
      objectValue.name,
      objectValue.nickname
    );
  };

  const object = asObject(container);
  if (!object) {
    return undefined;
  }

  const maybeItems = object.items;
  if (!Array.isArray(maybeItems)) {
      const itemsPayload = asObject(maybeItems);
      if (!itemsPayload || !Array.isArray(itemsPayload.data)) {
        return undefined;
      }
      const firstItem = itemsPayload.data[0];
      return pickFirstString(
        asObject(firstItem)?.planCode,
        asObject(firstItem)?.plan_code,
        readPlanId(asObject(firstItem)?.plan),
        readPlanId(asObject(firstItem)?.plan_id),
        readPlanId(asObject(firstItem)?.planCode),
        readPlanId(asObject(firstItem)?.plan_code)
      );
    }
    if (maybeItems.length === 0) {
      return undefined;
    }
    const firstItem = maybeItems[0];
    return pickFirstString(
      asObject(firstItem)?.planCode,
      asObject(firstItem)?.plan_code,
      readPlanId(asObject(firstItem)?.plan),
      readPlanId(asObject(firstItem)?.plan_id),
      readPlanId(asObject(firstItem)?.planCode),
      readPlanId(asObject(firstItem)?.plan_code)
    );
};

const parseWebhookTimestamp = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return undefined;
    }
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const iso = new Date(value * 1000).toISOString();
    return Number.isNaN(Date.parse(iso)) ? undefined : iso;
  }
  return undefined;
};

const parseWebhookPayload = (body: WebhookBody): BillingWebhookPayload => {
  const data = asObject(body.data);
  const object = asObject(data?.object) ?? asObject(body.object) ?? {};
  const dataObject = asObject(data?.object);
  const dataObjectSubscription = asObject(dataObject?.subscription);
  const objectSubscriptionData = asObject((object as WebhookObject)?.subscription_data);
  const dataObjectSubscriptionData = asObject(dataObject?.subscription_data);
  const objectSubscriptionDetails = asObject(object.subscription_details) ?? asObject(dataObject?.subscription_details);
  const objectSubscriptionMetadata = asObject(objectSubscriptionDetails?.metadata);
  const objectLines = asObject(dataObject?.lines);
  const firstLineItem = Array.isArray(objectLines?.data) ? asObject(objectLines.data[0]) : undefined;
  const metadata = asObject(body.metadata)
    ?? asObject(object.metadata)
    ?? asObject(data?.metadata)
    ?? objectSubscriptionMetadata;
  const planFromObject = readPlanFromItems(object);
  const plan = asObject(object.plan) ?? {};
  const eventType = pickFirstString(
    body.type,
    body.eventType,
    body.event_type,
    body.event,
    body.event_name,
    asObject(data?.object)?.type,
    asObject(body.data)?.type
  );
  const clientRef = pickFirstString(
    object.client_reference_id,
    object.clientReferenceId,
    object.client_reference,
    object.clientReference,
    data?.client_reference_id,
    data?.clientReferenceId
  );
  const objectStatus = readWebhookStatus(body, eventType);

  return {
    eventType: eventType ?? "payment_event",
    provider: pickFirstString(
      body.provider,
      data?.provider,
      object.provider,
      metadata?.provider
    ),
    eventId: pickFirstString(
      body.eventId,
      body.event_id,
      body.id,
      data?.id
    ),
    clerkUserId: pickFirstString(
      body.clerkUserId,
      body.clerk_user_id,
      metadata?.clerkUserId,
      metadata?.clerk_user_id,
      metadata?.userId,
      metadata?.user_id,
      object.clerkUserId,
      object.clerk_user_id,
      object.customer,
      data?.customer,
      clientRef,
      data?.clerk_user_id,
      data?.customer as string | undefined
    ),
    planCode: pickFirstString(
      body.planCode,
      body.plan_code,
      body.plan_id,
      data ? asObject(data.object)?.plan_code : undefined,
      data?.planCode,
      data?.plan_code,
      data?.plan_id,
      metadata?.planCode,
      metadata?.plan_code,
      metadata?.priceId,
      metadata?.price_id,
      object.planCode,
      object.plan_code,
      asObject(object.plan)?.planCode,
      asObject(object.plan)?.plan_code,
      asObject(object.plan)?.id,
      asObject(object.price)?.id,
      asObject(firstLineItem?.price)?.id,
      planFromObject,
      plan.code,
      plan.nickname,
      plan.id,
      plan.code
    ),
    providerSubscriptionId: pickFirstString(
      body.providerSubscriptionId,
      body.provider_subscription_id,
      body.subscriptionId,
      body.subscription_id,
      asObject(body.data)?.subscription,
      asObject(body.object)?.subscription,
      data?.subscriptionId,
      data?.subscription_id,
      data?.subscription,
      asObject(data?.object)?.subscription,
      asObject(dataObjectSubscription)?.id,
      dataObject?.subscription_id,
      asObject(body.object)?.subscription,
      object.id,
      asObject(object.subscription)?.id,
      objectSubscriptionData?.id,
      asObject(objectSubscriptionData?.subscription)?.id,
      dataObjectSubscriptionData?.id,
      asObject(dataObjectSubscriptionData?.subscription)?.id,
      firstLineItem?.subscription
    ),
    status: objectStatus,
    currentPeriodStart: parseWebhookTimestamp(pickFirstString(
      body.currentPeriodStart,
      body.current_period_start,
      body.currentPeriod,
      data?.currentPeriodStart,
      data?.current_period_start,
      object.currentPeriodStart,
      object.current_period_start,
      asObject(object.current_period)?.start,
      object.period_start,
      firstLineItem?.period_start,
      asObject(firstLineItem?.period)?.start
    )),
    currentPeriodEnd: parseWebhookTimestamp(pickFirstString(
      body.currentPeriodEnd,
      body.current_period_end,
      data?.currentPeriodEnd,
      data?.current_period_end,
      object.currentPeriodEnd,
      object.current_period_end,
      asObject(object.current_period)?.end,
      object.period_end,
      firstLineItem?.period_end,
      asObject(firstLineItem?.period)?.end
    )),
    cancelAtPeriodEnd:
      body.cancelAtPeriodEnd === true
      || body.cancel_at_period_end === true
      || data?.cancelAtPeriodEnd === true
      || data?.cancel_at_period_end === true
      || object.cancelAtPeriodEnd === true
      || object.cancel_at_period_end === true
      || false,
    metadata,
    data
  };
};

router.get("/plans", async (_req, res: Response<ApiResponse<BillingPlan[]>>) => {
  try {
    const plans: BillingPlan[] = await billingRepository.listPlans();
    res.status(200).json({ ok: true, data: plans });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: { code: "validation_error", message: "failed_to_load_billing_plans" }
    });
  }
});

router.get(
  "/subscription",
  requireAuthenticatedUser,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<UserSubscription | null>>) => {
    try {
      const subscription = await billingRepository.getSubscription(req.clerkUserId);
      res.status(200).json({ ok: true, data: subscription });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: { code: "validation_error", message: "failed_to_load_user_subscription" }
      });
    }
  }
);

const handleCheckoutSession = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<BillingCheckoutSession>>
) => {
  const payload = req.body as Partial<CreateCheckoutSessionPayload>;
  if (!payload || typeof payload.planCode !== "string" || !payload.planCode.trim()) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "planCode is required" } });
    return;
  }

  try {
    assertTossOnlyProvider(typeof payload.provider === "string" ? payload.provider : undefined);
    const checkout = await billingRepository.createCheckoutSession(req.clerkUserId, {
      planCode: payload.planCode,
      returnUrl: typeof payload.returnUrl === "string" ? payload.returnUrl : undefined,
      cancelUrl: typeof payload.cancelUrl === "string" ? payload.cancelUrl : undefined,
      provider: normalizeTossProvider()
    });
    res.status(200).json({ ok: true, data: checkout });
  } catch (error) {
    if (error instanceof AppError && error.code === "validation_error") {
      res.status(422).json({
        ok: false,
        error: { code: "validation_error", message: error.message }
      });
      return;
    }
    res.status(500).json({
      ok: false,
      error: { code: "validation_error", message: "failed_to_create_checkout_session" }
    });
  }
};

router.post("/checkout", requireAuthenticatedUser, handleCheckoutSession);
router.post("/checkout-sessions", requireAuthenticatedUser, handleCheckoutSession);

// Toss Payments — confirm a payment and activate subscription
router.post(
  "/toss/confirm",
  requireAuthenticatedUser,
  async (req: AuthenticatedRequest, res: Response<ApiResponse<UserSubscription>>) => {
    const { paymentKey, orderId, amount } = req.body as {
      paymentKey?: string;
      orderId?: string;
      amount?: number;
    };

    if (!paymentKey || !orderId || amount == null) {
      res.status(422).json({
        ok: false,
        error: { code: "validation_error", message: "paymentKey, orderId, and amount are required" }
      });
      return;
    }

    const tossSecretKey = process.env.TOSS_SECRET_KEY;
    if (!tossSecretKey) {
      res.status(500).json({
        ok: false,
        error: { code: "validation_error", message: "toss payments not configured" }
      });
      return;
    }

    const basicAuth = Buffer.from(`${tossSecretKey}:`).toString("base64");
    let tossHttpResponse: globalThis.Response;
    try {
      tossHttpResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ paymentKey, orderId, amount })
      });
    } catch {
      res.status(502).json({
        ok: false,
        error: { code: "validation_error", message: "failed to reach toss payments api" }
      });
      return;
    }

    if (!tossHttpResponse.ok) {
      const tossError = (await tossHttpResponse.json().catch(() => ({}))) as Record<string, unknown>;
      res.status(402).json({
        ok: false,
        error: {
          code: "validation_error",
          message: (tossError.message as string) ?? "toss payment confirmation failed"
        }
      });
      return;
    }

    const tossData = (await tossHttpResponse.json()) as Record<string, unknown>;
    const metadata = tossData.metadata as Record<string, unknown> | undefined;
    const planCode =
      (metadata?.planCode as string | undefined) ??
      (tossData.orderName as string | undefined) ??
      "basic";

    try {
      const subscription = await billingRepository.handleWebhook({
        eventType: "payment.confirmed",
        provider: TOSS_PROVIDER,
        providerSubscriptionId: orderId,
        clerkUserId: req.clerkUserId,
        planCode,
        status: "active",
        metadata: { paymentKey, orderId, amount, ...metadata }
      });
      res.status(200).json({ ok: true, data: subscription });
    } catch (error) {
      if (error instanceof AppError) {
        const code = (error.code === "not_found" || error.code === "conflict" || error.code === "validation_error")
          ? error.code
          : "validation_error" as const;
        res.status(422).json({ ok: false, error: { code, message: error.message } });
        return;
      }
      res.status(500).json({
        ok: false,
        error: { code: "validation_error", message: "failed_to_activate_subscription" }
      });
    }
  }
);

const handlePaymentWebhookRequest = async (
  req: Request,
  res: Response<ApiResponse<UserSubscription>>,
  providerHint?: string
) => {
  const webhookRequest = req as BillingWebhookRequest;
  const normalizedProviderHint = providerHint?.trim().toLowerCase();
  if (!verifyBillingWebhookSignatureWithProvider(webhookRequest, normalizedProviderHint)) {
    res.status(401).json({ ok: false, error: { code: "forbidden", message: "invalid webhook signature" } });
    return;
  }

  if (!req.body || typeof req.body !== "object") {
    res.status(422).json({
      ok: false,
      error: { code: "validation_error", message: "invalid webhook payload" }
    });
    return;
  }

  let payload = parseWebhookPayload(req.body as WebhookBody);
  if (normalizedProviderHint && !payload.provider) {
    payload = { ...payload, provider: normalizedProviderHint };
  }
  if (!payload.eventType || payload.eventType === "payment_event") {
    res.status(422).json({
      ok: false,
      error: { code: "validation_error", message: "eventType is required" }
    });
    return;
  }
  if (!payload.clerkUserId || !payload.planCode || !payload.providerSubscriptionId) {
    res.status(422).json({
      ok: false,
      error: { code: "validation_error", message: "required fields missing: clerkUserId/planCode/providerSubscriptionId" }
    });
    return;
  }
  if (!payload.status && !payload.eventType.includes("updated") && !payload.eventType.includes("created")) {
    res.status(422).json({
      ok: false,
      error: { code: "validation_error", message: "status could not be derived from event payload" }
    });
    return;
  }

  try {
    const normalized = await billingRepository.handleWebhook({
      ...payload
    });
    res.status(200).json({ ok: true, data: normalized });
  } catch (error) {
    if (error instanceof AppError && error.code === "validation_error") {
      res.status(422).json({ ok: false, error: { code: "validation_error", message: error.message } });
      return;
    }
    if (error instanceof AppError && error.code === "not_found") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: error.message } });
      return;
    }
    const message = payload.eventType.includes("deleted") ? "subscription deleted" : "failed_to_process_payment_webhook";
    res.status(400).json({ ok: false, error: { code: "validation_error", message } });
  }
};

router.post("/webhooks/:provider", async (req: Request, res: Response<ApiResponse<UserSubscription>>) => {
  const provider = typeof req.params?.provider === "string" ? req.params.provider : undefined;
  if ((provider ?? "").trim().toLowerCase() !== TOSS_PROVIDER) {
    res.status(404).json({ ok: false, error: { code: "not_found", message: "not_found" } });
    return;
  }
  await handlePaymentWebhookRequest(req, res, provider);
});

export default router;
