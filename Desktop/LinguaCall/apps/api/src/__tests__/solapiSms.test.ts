import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSolapiAuthorization,
  createSolapiSmsSender
} from "../modules/auth/solapiSms";

describe("createSolapiAuthorization", () => {
  it("creates an HMAC-SHA256 authorization header from api key, date, and salt", () => {
    const authorization = createSolapiAuthorization({
      apiKey: "test-api-key",
      apiSecret: "test-api-secret",
      date: "2024-03-23T10:00:00.000Z",
      salt: "salt-value"
    });

    expect(authorization).toContain("HMAC-SHA256");
    expect(authorization).toContain("apiKey=test-api-key");
    expect(authorization).toContain("date=2024-03-23T10:00:00.000Z");
    expect(authorization).toContain("salt=salt-value");
    expect(authorization).toContain("signature=");
  });
});

describe("createSolapiSmsSender.sendOtp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts an OTP SMS request to SOLAPI", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const sender = createSolapiSmsSender({
      apiKey: "api-key",
      apiSecret: "api-secret",
      from: "01012345678",
      now: () => new Date("2024-03-23T10:00:00.000Z"),
      generateSalt: () => "salt-value"
    });

    await sender.sendOtp({
      to: "+821012345678",
      message: "[LinguaCall] Your verification code is 123456"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.solapi.com/messages/v4/send");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json"
    });
    expect(String((init.headers as Record<string, string>).Authorization)).toContain("HMAC-SHA256");
    expect(JSON.parse(String(init.body))).toEqual({
      message: {
        to: "01012345678",
        from: "01012345678",
        text: "[LinguaCall] Your verification code is 123456"
      }
    });
  });
});
