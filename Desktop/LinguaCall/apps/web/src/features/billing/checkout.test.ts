import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBillingReturnUrl,
  createCheckoutPayload,
  createTossPaymentRequest,
  readTossRedirectParams
} from "./checkout";

test("buildBillingReturnUrl omits provider query params for toss-only flow", () => {
  const url = buildBillingReturnUrl(
    "https://linguacall.app/",
    "success",
    "basic"
  );

  assert.equal(
    url,
    "https://linguacall.app/#/billing?checkout=success&plan=basic"
  );
});

test("createCheckoutPayload sends a provider-free billing checkout request", () => {
  const payload = createCheckoutPayload(
    "https://linguacall.app/",
    "pro"
  );

  assert.deepEqual(payload, {
    planCode: "pro",
    returnUrl: "https://linguacall.app/#/billing?checkout=success&plan=pro",
    cancelUrl: "https://linguacall.app/#/billing?checkout=cancel&plan=pro"
  });
  assert.equal("provider" in payload, false);
});

test("readTossRedirectParams extracts Toss success query params from the URL search", () => {
  const redirect = readTossRedirectParams(
    "https://linguacall.app/?paymentKey=pay_123&orderId=order_456&amount=9900#/billing?checkout=success&plan=basic"
  );

  assert.deepEqual(redirect, {
    paymentKey: "pay_123",
    orderId: "order_456",
    amount: 9900
  });
});

test("createTossPaymentRequest builds a redirect-based card payment request", () => {
  const request = createTossPaymentRequest({
    planCode: "basic",
    orderId: "order_123",
    orderName: "Basic Plan",
    amount: 9900,
    successUrl: "https://linguacall.app/#/billing?checkout=success&plan=basic",
    failUrl: "https://linguacall.app/#/billing?checkout=cancel&plan=basic",
    customerEmail: "user@example.com",
    customerName: "Lingua User"
  });

  assert.deepEqual(request, {
    method: "CARD",
    amount: {
      currency: "KRW",
      value: 9900
    },
    orderId: "order_123",
    orderName: "Basic Plan",
    successUrl: "https://linguacall.app/#/billing?checkout=success&plan=basic",
    failUrl: "https://linguacall.app/#/billing?checkout=cancel&plan=basic",
    customerEmail: "user@example.com",
    customerName: "Lingua User",
    metadata: {
      planCode: "basic"
    }
  });
});
