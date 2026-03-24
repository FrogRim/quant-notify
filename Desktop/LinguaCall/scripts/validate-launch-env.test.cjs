const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseEnvFile,
  validateLaunchEnv
} = require("./validate-launch-env.cjs");

test("parseEnvFile reads simple KEY=value lines", () => {
  const parsed = parseEnvFile([
    "APP_BASE_URL=https://app.example.com",
    "API_BASE_URL=https://api.example.com",
    "# comment",
    ""
  ].join("\n"));

  assert.deepEqual(parsed, {
    APP_BASE_URL: "https://app.example.com",
    API_BASE_URL: "https://api.example.com"
  });
});

test("validateLaunchEnv reports missing required values", () => {
  const result = validateLaunchEnv({
    APP_BASE_URL: "https://app.example.com"
  });

  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("API_BASE_URL"));
  assert.ok(result.missing.includes("DATABASE_URL"));
});

test("validateLaunchEnv rejects non-https public URLs", () => {
  const result = validateLaunchEnv({
    APP_DOMAIN: "app.example.com",
    API_DOMAIN: "api.example.com",
    APP_BASE_URL: "http://app.example.com",
    API_BASE_URL: "https://api.example.com",
    ALLOWED_ORIGINS: "https://app.example.com",
    VITE_API_BASE_URL: "https://api.example.com",
    VITE_TOSS_CLIENT_KEY: "test_ck_key",
    DATABASE_URL: "postgresql://db.example",
    OPENAI_API_KEY: "sk-test",
    OPENAI_REALTIME_MODEL: "gpt-realtime-mini",
    OPENAI_REALTIME_VOICE: "marin",
    OPENAI_REALTIME_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
    OPENAI_EVAL_MODEL: "gpt-4.1-mini",
    TOSS_CLIENT_KEY: "test_ck_key",
    TOSS_SECRET_KEY: "test_sk_key",
    SOLAPI_API_KEY: "api-key",
    SOLAPI_API_SECRET: "api-secret",
    SOLAPI_FROM: "01012345678",
    SESSION_COOKIE_SECRET: "secret-secret-secret",
    WORKER_SHARED_SECRET: "worker-secret",
    WORKER_BATCH_INTERVAL_MS: "30000",
    WORKER_BATCH_LIMIT: "20"
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.invalid.some((entry) => entry.includes("APP_BASE_URL"))
  );
});

test("validateLaunchEnv accepts a complete launch env shape", () => {
  const result = validateLaunchEnv({
    APP_DOMAIN: "app.example.com",
    API_DOMAIN: "api.example.com",
    APP_BASE_URL: "https://app.example.com",
    API_BASE_URL: "https://api.example.com",
    ALLOWED_ORIGINS: "https://app.example.com",
    VITE_API_BASE_URL: "https://api.example.com",
    VITE_TOSS_CLIENT_KEY: "test_ck_key",
    DATABASE_URL: "postgresql://db.example",
    OPENAI_API_KEY: "sk-test",
    OPENAI_REALTIME_MODEL: "gpt-realtime-mini",
    OPENAI_REALTIME_VOICE: "marin",
    OPENAI_REALTIME_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
    OPENAI_EVAL_MODEL: "gpt-4.1-mini",
    TOSS_CLIENT_KEY: "test_ck_key",
    TOSS_SECRET_KEY: "test_sk_key",
    SOLAPI_API_KEY: "api-key",
    SOLAPI_API_SECRET: "api-secret",
    SOLAPI_FROM: "01012345678",
    SESSION_COOKIE_SECRET: "secret-secret-secret",
    WORKER_SHARED_SECRET: "worker-secret",
    WORKER_BATCH_INTERVAL_MS: "30000",
    WORKER_BATCH_LIMIT: "20"
  });

  assert.deepEqual(result, {
    ok: true,
    missing: [],
    invalid: []
  });
});
