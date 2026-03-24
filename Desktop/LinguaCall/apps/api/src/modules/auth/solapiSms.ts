import { createHmac, randomUUID } from "node:crypto";
import type { OtpSmsSender } from "./service";

type CreateSolapiAuthorizationInput = {
  apiKey: string;
  apiSecret: string;
  date: string;
  salt: string;
};

type CreateSolapiSmsSenderOptions = {
  apiKey: string;
  apiSecret: string;
  from: string;
  now?: () => Date;
  generateSalt?: () => string;
};

const normalizeKoreanMobile = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("82")) {
    return `0${digits.slice(2)}`;
  }
  return digits;
};

export const createSolapiAuthorization = ({
  apiKey,
  apiSecret,
  date,
  salt
}: CreateSolapiAuthorizationInput) => {
  const signature = createHmac("sha256", apiSecret).update(`${date}${salt}`).digest("hex");
  return `HMAC-SHA256 apiKey="${apiKey}", date="${date}", salt="${salt}", signature="${signature}"`;
};

export const createSolapiSmsSender = ({
  apiKey,
  apiSecret,
  from,
  now = () => new Date(),
  generateSalt = () => randomUUID()
}: CreateSolapiSmsSenderOptions): OtpSmsSender => {
  return {
    async sendOtp(payload) {
      const date = now().toISOString();
      const salt = generateSalt();
      const authorization = createSolapiAuthorization({
        apiKey,
        apiSecret,
        date,
        salt
      });

      const response = await fetch("https://api.solapi.com/messages/v4/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization
        },
        body: JSON.stringify({
          message: {
            to: normalizeKoreanMobile(payload.to),
            from: normalizeKoreanMobile(from),
            text: payload.message
          }
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
