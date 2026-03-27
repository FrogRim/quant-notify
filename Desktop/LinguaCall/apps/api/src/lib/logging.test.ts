import assert from "node:assert/strict";
import test from "node:test";
import { describeErrorForLog, summarizeUserIdForLog } from "./logging";

test("describeErrorForLog removes nested token-like fields and keeps safe metadata", () => {
  const error = Object.assign(new Error("request failed"), {
    code: "E_FAIL",
    accessToken: "secret",
    phone: "+821012345678"
  });

  assert.deepEqual(describeErrorForLog(error), {
    name: "Error",
    message: "request failed",
    code: "E_FAIL"
  });
});

test("summarizeUserIdForLog shortens provider ids", () => {
  assert.equal(
    summarizeUserIdForLog("supabase:64767e2ae2f03bc005075319"),
    "supabase:64767e2a..."
  );
});

test("summarizeUserIdForLog keeps empty values out of logs", () => {
  assert.equal(summarizeUserIdForLog(""), undefined);
  assert.equal(summarizeUserIdForLog(undefined), undefined);
});
