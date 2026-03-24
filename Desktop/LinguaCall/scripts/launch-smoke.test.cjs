const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSmokeRequests
} = require("./launch-smoke.cjs");

test("buildSmokeRequests returns health and worker checks", () => {
  const checks = buildSmokeRequests({
    apiBaseUrl: "https://api.example.com",
    workerSharedSecret: "worker-secret"
  });

  assert.deepEqual(checks, [
    {
      name: "healthz",
      url: "https://api.example.com/healthz",
      options: { method: "GET", headers: {} }
    },
    {
      name: "workers-run",
      url: "https://api.example.com/workers/run",
      options: {
        method: "POST",
        headers: {
          "x-worker-token": "worker-secret"
        }
      }
    }
  ]);
});
