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
