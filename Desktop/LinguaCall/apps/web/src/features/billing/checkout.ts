export type BillingCheckoutResult = "success" | "cancel";

export interface BillingCheckoutPayload {
  planCode: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface TossRedirectParams {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface TossCheckoutRequest {
  method: "CARD";
  amount: {
    currency: "KRW";
    value: number;
  };
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: {
    planCode: string;
  };
}

export const buildBillingReturnUrl = (
  originUrl: string,
  result: BillingCheckoutResult,
  planCode: string
) => {
  const base = originUrl.split("#")[0];
  return `${base}#/billing?checkout=${encodeURIComponent(result)}&plan=${encodeURIComponent(planCode)}`;
};

export const createCheckoutPayload = (
  originUrl: string,
  planCode: string
): BillingCheckoutPayload => {
  return {
    planCode,
    returnUrl: buildBillingReturnUrl(originUrl, "success", planCode),
    cancelUrl: buildBillingReturnUrl(originUrl, "cancel", planCode)
  };
};

export const readTossRedirectParams = (
  currentUrl: string
): TossRedirectParams | null => {
  const url = new URL(currentUrl);
  const paymentKey = url.searchParams.get("paymentKey");
  const orderId = url.searchParams.get("orderId");
  const amount = url.searchParams.get("amount");

  if (!paymentKey || !orderId || !amount) {
    return null;
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount)) {
    return null;
  }

  return {
    paymentKey,
    orderId,
    amount: parsedAmount
  };
};

export const createTossPaymentRequest = (checkout: {
  planCode: string;
  orderId: string;
  orderName: string;
  amount: number;
  successUrl: string;
  failUrl: string;
  customerEmail?: string;
  customerName?: string;
}): TossCheckoutRequest => {
  return {
    method: "CARD",
    amount: {
      currency: "KRW",
      value: checkout.amount
    },
    orderId: checkout.orderId,
    orderName: checkout.orderName,
    successUrl: checkout.successUrl,
    failUrl: checkout.failUrl,
    ...(checkout.customerEmail ? { customerEmail: checkout.customerEmail } : {}),
    ...(checkout.customerName ? { customerName: checkout.customerName } : {}),
    metadata: {
      planCode: checkout.planCode
    }
  };
};
