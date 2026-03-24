import { z } from "zod";

export const StartOtpSchema = z.object({
  phone: z.string().min(8)
});

export const VerifyOtpSchema = z.object({
  phone: z.string().min(8),
  code: z.string().length(6)
});
