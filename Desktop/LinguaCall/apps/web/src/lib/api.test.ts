import assert from "node:assert/strict";
import test from "node:test";
import { apiClient } from "./api";

test("apiClient sends credentialed requests even without a bearer token", async () => {
  let captured: RequestInit | undefined;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init;
    return {
      json: async () => ({ ok: true, data: { ok: true } })
    } as Response;
  }) as typeof fetch;

  try {
    const client = apiClient(async () => null);
    await client.get<{ ok: boolean }>("/healthz");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(captured?.credentials, "include");
  assert.deepEqual(captured?.headers, {
    "content-type": "application/json"
  });
});

test("apiClient includes bearer auth when a token is available", async () => {
  let captured: RequestInit | undefined;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init;
    return {
      json: async () => ({ ok: true, data: { ok: true } })
    } as Response;
  }) as typeof fetch;

  try {
    const client = apiClient(async () => "token-123");
    await client.post<{ ok: boolean }>("/users/me", { hello: "world" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(captured?.credentials, "include");
  assert.deepEqual(captured?.headers, {
    "content-type": "application/json",
    Authorization: "Bearer token-123"
  });
});

test("apiClient retries once after refreshing the session on 401", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  let refreshCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const url = String(input);
    if (url.endsWith("/sessions") && calls.filter((call) => String(call.input).endsWith("/sessions")).length === 1) {
      return {
        status: 401,
        json: async () => ({ ok: false, error: { code: "forbidden", message: "authentication required" } })
      } as Response;
    }
    return {
      status: 200,
      json: async () => ({ ok: true, data: [{ id: "session-1" }] })
    } as Response;
  }) as typeof fetch;

  try {
    const client = apiClient(async () => null, async () => {
      refreshCalls += 1;
    });
    const sessions = await client.get<Array<{ id: string }>>("/sessions");
    assert.equal(sessions[0]?.id, "session-1");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.filter((call) => String(call.input).endsWith("/sessions")).length, 2);
  assert.equal(refreshCalls, 1);
});

test("apiClient does not loop when refresh also fails", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  let refreshCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return {
      status: 401,
      json: async () => ({ ok: false, error: { code: "forbidden", message: "authentication required" } })
    } as Response;
  }) as typeof fetch;

  try {
    const client = apiClient(async () => null, async () => {
      refreshCalls += 1;
      throw new Error("refresh failed");
    });
    await assert.rejects(() => client.get("/sessions"));
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.filter((call) => String(call.input).endsWith("/sessions")).length, 1);
  assert.equal(refreshCalls, 1);
});

test("apiClient accepts ok responses whose data is explicitly null", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return {
      status: 200,
      json: async () => ({ ok: true, data: null })
    } as Response;
  }) as typeof fetch;

  try {
    const client = apiClient(async () => null);
    const subscription = await client.get<null>("/billing/subscription");
    assert.equal(subscription, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
