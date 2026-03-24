import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  return {
    createCheckoutSessionMock: vi.fn(),
    handlePaymentWebhookMock: vi.fn()
  };
});

vi.mock("../middleware/auth", () => {
  return {
    requireAuthenticatedUser: (
      req: express.Request & { clerkUserId?: string; userId?: string },
      _res: express.Response,
      next: express.NextFunction
    ) => {
      req.clerkUserId = "local:user-1";
      req.userId = "user-1";
      next();
    }
  };
});

vi.mock("../storage/inMemoryStore", () => {
  class AppError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    AppError,
    store: {
      getPool() {
        return {
          query: vi.fn(async () => ({ rows: [] }))
        };
      },
      listBillingPlans: vi.fn(async () => []),
      getUserActiveSubscription: vi.fn(async () => null),
      createCheckoutSession: mocked.createCheckoutSessionMock,
      handlePaymentWebhook: mocked.handlePaymentWebhookMock
    }
  };
});

import billingRouter from "../routes/billing";

describe("billing toss-only flow", () => {
  beforeEach(() => {
    mocked.createCheckoutSessionMock.mockReset();
    mocked.handlePaymentWebhookMock.mockReset();
  });

  it("rejects non-toss provider checkout requests", async () => {
    mocked.createCheckoutSessionMock.mockResolvedValue({
      provider: "stripe",
      checkoutSessionId: "cs_123",
      checkoutUrl: "https://checkout.example/stripe",
      planCode: "basic"
    });

    const app = express();
    app.use(express.json());
    app.use("/billing", billingRouter);

    const response = await request(app)
      .post("/billing/checkout")
      .send({ planCode: "basic", provider: "stripe" });

    expect(response.status).toBe(422);
    expect(mocked.createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("returns Toss widget checkout data for the billing screen", async () => {
    mocked.createCheckoutSessionMock.mockResolvedValue({
      provider: "toss",
      checkoutSessionId: "order_basic_123",
      checkoutUrl: "https://checkout.example/toss",
      planCode: "basic",
      orderId: "order_basic_123",
      orderName: "Basic Plan",
      amount: 9900,
      successUrl: "https://linguacall.app/#/billing?checkout=success&plan=basic",
      failUrl: "https://linguacall.app/#/billing?checkout=cancel&plan=basic",
      customerEmail: "user@example.com",
      customerName: "Lingua User"
    });

    const app = express();
    app.use(express.json());
    app.use("/billing", billingRouter);

    const response = await request(app)
      .post("/billing/checkout")
      .send({
        planCode: "basic",
        returnUrl: "https://linguacall.app/#/billing?checkout=success&plan=basic",
        cancelUrl: "https://linguacall.app/#/billing?checkout=cancel&plan=basic"
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      provider: "toss",
      orderId: "order_basic_123",
      orderName: "Basic Plan",
      amount: 9900,
      successUrl: "https://linguacall.app/#/billing?checkout=success&plan=basic",
      failUrl: "https://linguacall.app/#/billing?checkout=cancel&plan=basic"
    });
  });
});
