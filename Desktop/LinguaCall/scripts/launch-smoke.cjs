function buildSmokeRequests({ apiBaseUrl, workerSharedSecret }) {
  const normalizedBase = String(apiBaseUrl || "").replace(/\/+$/u, "");

  return [
    {
      name: "healthz",
      url: `${normalizedBase}/healthz`,
      options: {
        method: "GET",
        headers: {}
      }
    },
    {
      name: "workers-run",
      url: `${normalizedBase}/workers/run`,
      options: {
        method: "POST",
        headers: {
          "x-worker-token": workerSharedSecret
        }
      }
    }
  ];
}

async function runSmoke({ apiBaseUrl, workerSharedSecret }) {
  const checks = buildSmokeRequests({ apiBaseUrl, workerSharedSecret });
  const results = [];

  for (const check of checks) {
    try {
      const response = await fetch(check.url, check.options);
      const text = await response.text();
      results.push({
        name: check.name,
        ok: response.ok,
        status: response.status,
        body: text
      });
    } catch (error) {
      results.push({
        name: check.name,
        ok: false,
        status: 0,
        body: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}

function formatFailureDetail(result) {
  return `[launch-smoke] ${result.name} failed with status ${result.status}`;
}

async function main() {
  const apiBaseUrl = process.env.API_BASE_URL;
  const workerSharedSecret = process.env.WORKER_SHARED_SECRET;

  if (!apiBaseUrl || !workerSharedSecret) {
    console.error("[launch-smoke] API_BASE_URL and WORKER_SHARED_SECRET are required");
    process.exitCode = 1;
    return;
  }

  const results = await runSmoke({ apiBaseUrl, workerSharedSecret });

  let failed = false;
  for (const result of results) {
    const status = result.ok ? "ok" : "fail";
    console.log(`[launch-smoke] ${status} ${result.name} ${result.status}`);
    if (!result.ok) {
      failed = true;
      console.log(formatFailureDetail(result));
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSmokeRequests,
  formatFailureDetail,
  runSmoke
};
