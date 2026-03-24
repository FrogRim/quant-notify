import type { BillingCheckoutSession } from "@lingua/shared";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { createTossPaymentRequest } from "./checkout";

const TOSS_CLIENT_KEY =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_TOSS_CLIENT_KEY ?? "";

const requireString = (value: string | undefined, field: string) => {
  if (!value || !value.trim()) {
    throw new Error(`missing toss checkout field: ${field}`);
  }
  return value;
};

const requireAmount = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("missing toss checkout field: amount");
  }
  return value;
};

export async function startTossCheckout(checkout: BillingCheckoutSession) {
  if (!TOSS_CLIENT_KEY) {
    throw new Error("toss client key is not configured");
  }

  const customerKey = requireString(checkout.customerKey, "customerKey");
  const orderId = requireString(checkout.orderId, "orderId");
  const orderName = requireString(checkout.orderName, "orderName");
  const successUrl = requireString(checkout.successUrl, "successUrl");
  const failUrl = requireString(checkout.failUrl, "failUrl");
  const amount = requireAmount(checkout.amount);

  const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
  const payment = tossPayments.payment({ customerKey });

  await payment.requestPayment(
    createTossPaymentRequest({
      planCode: checkout.planCode,
      orderId,
      orderName,
      amount,
      successUrl,
      failUrl,
      customerEmail: checkout.customerEmail,
      customerName: checkout.customerName
    })
  );
}
