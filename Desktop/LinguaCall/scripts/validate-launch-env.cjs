const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_KEYS = [
  "APP_DOMAIN",
  "API_DOMAIN",
  "APP_BASE_URL",
  "API_BASE_URL",
  "ALLOWED_ORIGINS",
  "VITE_API_BASE_URL",
  "VITE_TOSS_CLIENT_KEY",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_REALTIME_MODEL",
  "OPENAI_REALTIME_VOICE",
  "OPENAI_REALTIME_TRANSCRIPTION_MODEL",
  "OPENAI_EVAL_MODEL",
  "TOSS_CLIENT_KEY",
  "TOSS_SECRET_KEY",
  "NAVER_SMS_SERVICE_ID",
  "NAVER_SMS_ACCESS_KEY",
  "NAVER_SMS_SECRET_KEY",
  "NAVER_SMS_FROM",
  "SESSION_COOKIE_SECRET",
  "WORKER_SHARED_SECRET",
  "WORKER_BATCH_INTERVAL_MS",
  "WORKER_BATCH_LIMIT"
];

function parseEnvFile(contents) {
  const parsed = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    parsed[key] = value.replace(/^['"]|['"]$/gu, "");
  }

  return parsed;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateLaunchEnv(env) {
  const missing = REQUIRED_KEYS.filter((key) => {
    return !env[key] || String(env[key]).trim().length === 0;
  });

  const invalid = [];

  for (const key of ["APP_BASE_URL", "API_BASE_URL", "VITE_API_BASE_URL"]) {
    if (env[key] && !isHttpsUrl(env[key])) {
      invalid.push(`${key} must be an https URL`);
    }
  }

  if (env.ALLOWED_ORIGINS) {
    const invalidOrigin = String(env.ALLOWED_ORIGINS)
      .split(",")
      .map((entry) => entry.trim())
      .find((entry) => entry && !isHttpsUrl(entry));
    if (invalidOrigin) {
      invalid.push(`ALLOWED_ORIGINS contains a non-https URL: ${invalidOrigin}`);
    }
  }

  if (env.DATABASE_URL && !/^postgres(ql)?:\/\//u.test(String(env.DATABASE_URL))) {
    invalid.push("DATABASE_URL must start with postgres:// or postgresql://");
  }

  if (env.OPENAI_API_KEY && !String(env.OPENAI_API_KEY).startsWith("sk-")) {
    invalid.push("OPENAI_API_KEY must start with sk-");
  }

  for (const key of ["WORKER_BATCH_INTERVAL_MS", "WORKER_BATCH_LIMIT"]) {
    if (env[key] && !/^\d+$/u.test(String(env[key]))) {
      invalid.push(`${key} must be a positive integer`);
    }
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid
  };
}

function main() {
  const inputPath = process.argv[2] || path.join(process.cwd(), "infra", ".env.production");
  if (!fs.existsSync(inputPath)) {
    console.error(`[launch-env] file not found: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const parsed = parseEnvFile(fs.readFileSync(inputPath, "utf8"));
  const result = validateLaunchEnv(parsed);

  if (result.ok) {
    console.log("[launch-env] ok");
    return;
  }

  if (result.missing.length > 0) {
    console.error("[launch-env] missing");
    for (const key of result.missing) {
      console.error(`- ${key}`);
    }
  }

  if (result.invalid.length > 0) {
    console.error("[launch-env] invalid");
    for (const item of result.invalid) {
      console.error(`- ${item}`);
    }
  }

  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  parseEnvFile,
  validateLaunchEnv
};
