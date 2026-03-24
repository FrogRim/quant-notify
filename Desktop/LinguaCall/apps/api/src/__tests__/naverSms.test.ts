import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNaverSmsSender,
  createNaverSignature
} from "../modules/auth/naverSms";

describe("createNaverSignature", () => {
  it("creates a base64 HMAC signature from method, url, timestamp, and access key", () => {
    const signature = createNaverSignature({
      method: "POST",
      urlPath: "/sms/v2/services/test-service/messages",
      timestamp: "1700000000000",
      accessKey: "test-access-key",
      secretKey: "test-secret-key"
    });

    expect(signature).toBeTruthy();
    expect(typeof signature).toBe("string");
  });
});

describe("createNaverSmsSender.sendOtp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a signed SMS request to Naver Cloud SENS", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ statusCode: "202", statusName: "success" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const sender = createNaverSmsSender({
      serviceId: "ncp:sms:kr:123456789:test",
      accessKey: "ncp_iam_access_key",
      secretKey: "secret-key",
      from: "01012345678",
      now: () => 1700000000000
    });

    await sender.sendOtp({
      to: "+821012345678",
      message: "[LinguaCall] Your verification code is 123456"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://sens.apigw.ntruss.com/sms/v2/services/ncp:sms:kr:123456789:test/messages"
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-ncp-apigw-timestamp": "1700000000000",
      "x-ncp-iam-access-key": "ncp_iam_access_key"
    });
    expect(JSON.parse(String(init.body))).toEqual({
      type: "SMS",
      contentType: "COMM",
      countryCode: "82",
      from: "01012345678",
      content: "[LinguaCall] Your verification code is 123456",
      messages: [
        {
          to: "01012345678",
          content: "[LinguaCall] Your verification code is 123456"
        }
      ]
    });
  });
});
