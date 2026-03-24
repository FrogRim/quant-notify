import type { Pool } from "pg";
import type {
  BillingCheckoutSession,
  BillingPlan,
  BillingWebhookPayload,
  CreateCheckoutSessionPayload,
  UserSubscription
} from "@lingua/shared";
import { store } from "../../storage/inMemoryStore";

type Queryable = Pick<Pool, "query">;

type DbPlanRow = {
  id: string;
  code: string;
  display_name: string;
  price_krw: number;
  included_minutes: number;
  trial_calls: number;
  max_session_minutes: number;
  entitlements: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

type DbUserRow = {
  id: string;
};

type DbSubscriptionRow = {
  id: string;
  provider: string;
  provider_subscription_id: string;
  plan_code: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

const mapPlan = (row: DbPlanRow): BillingPlan => {
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
};

const mapSubscription = (row: DbSubscriptionRow, userId: string): UserSubscription => {
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
};

export const createBillingRepository = (db: Queryable) => ({
  async listPlans(): Promise<BillingPlan[]> {
    const result = await db.query<DbPlanRow>(
      `
        SELECT id, code, display_name, price_krw, included_minutes, trial_calls, max_session_minutes, entitlements, active, created_at, updated_at
        FROM plans
        WHERE active = true
        ORDER BY price_krw ASC, code ASC
      `
    );
    return result.rows.map(mapPlan);
  },

  async getSubscription(clerkUserId: string): Promise<UserSubscription | null> {
    const userResult = await db.query<DbUserRow>(
      "SELECT id FROM users WHERE clerk_user_id = $1 LIMIT 1",
      [clerkUserId]
    );
    if (userResult.rows.length === 0) {
      return null;
    }
    const userId = userResult.rows[0].id;
    const result = await db.query<DbSubscriptionRow>(
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
      [userId]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return mapSubscription(result.rows[0], userId);
  },

  createCheckoutSession(
    clerkUserId: string,
    payload: CreateCheckoutSessionPayload
  ): Promise<BillingCheckoutSession> {
    return store.createCheckoutSession(clerkUserId, payload);
  },

  handleWebhook(payload: BillingWebhookPayload): Promise<UserSubscription> {
    return store.handlePaymentWebhook(payload);
  }
});

export const billingRepository = createBillingRepository(store.getPool());
