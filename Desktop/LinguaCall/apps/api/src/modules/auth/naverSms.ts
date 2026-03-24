import { createHmac } from "node:crypto";
import type { OtpSmsSender } from "./service";

type CreateNaverSignatureInput = {
  method: string;
  urlPath: string;
  timestamp: string;
  accessKey: string;
  secretKey: string;
};

type CreateNaverSmsSenderOptions = {
  serviceId: string;
  accessKey: string;
  secretKey: string;
  from: string;
  now?: () => number;
};

const normalizeKoreanMobile = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("82")) {
    return `0${digits.slice(2)}`;
  }
  return digits;
};

export const createNaverSignature = ({
  method,
  urlPath,
  timestamp,
  accessKey,
  secretKey
}: CreateNaverSignatureInput) => {
  const space = " ";
  const newLine = "\n";
  const message = `${method}${space}${urlPath}${newLine}${timestamp}${newLine}${accessKey}`;
  return createHmac("sha256", secretKey).update(message).digest("base64");
};

export const createNaverSmsSender = ({
  serviceId,
  accessKey,
  secretKey,
  from,
  now = () => Date.now()
}: CreateNaverSmsSenderOptions): OtpSmsSender => {
  return {
    async sendOtp(payload) {
      const timestamp = String(now());
      const urlPath = `/sms/v2/services/${serviceId}/messages`;
      const signature = createNaverSignature({
        method: "POST",
        urlPath,
        timestamp,
        accessKey,
        secretKey
      });

      const response = await fetch(`https://sens.apigw.ntruss.com${urlPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ncp-apigw-timestamp": timestamp,
          "x-ncp-iam-access-key": accessKey,
          "x-ncp-apigw-signature-v2": signature
        },
        body: JSON.stringify({
          type: "SMS",
          contentType: "COMM",
          countryCode: "82",
          from: normalizeKoreanMobile(from),
          content: payload.message,
          messages: [
            {
              to: normalizeKoreanMobile(payload.to),
              content: payload.message
            }
          ]
        })
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(
          `failed_to_send_sms: ${response.status} ${response.statusText} ${message}`.trim()
        );
      }
    }
  };
};
