import { beforeEach, describe, expect, it, vi } from "vitest";

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
          query: vi.fn()
        };
      }
    }
  };
});

import { createUsersRepository } from "../modules/users/repository";

describe("usersRepository", () => {
  const query = vi.fn();
  const repository = createUsersRepository({
    query: query as never
  });

  beforeEach(() => {
    query.mockReset();
  });

  it("loads a user through the users repository", async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: "user-1",
          clerk_user_id: "local:user-1",
          name: "Test User",
          email: "test@example.com",
          phone_last4: "5678",
          phone_verified: true,
          phone_verified_at: "2026-03-23T00:00:00.000Z",
          trial_calls_remaining: 1,
          paid_minutes_balance: 20,
          plan_code: "basic",
          ui_language: "ko",
          created_at: "2026-03-23T00:00:00.000Z",
          updated_at: "2026-03-23T00:00:00.000Z"
        }
      ]
    });

    const user = await repository.getByClerkUserId("local:user-1");

    expect(user?.id).toBe("user-1");
    expect(user?.clerkUserId).toBe("local:user-1");
    expect(user?.uiLanguage).toBe("ko");
  });
});
