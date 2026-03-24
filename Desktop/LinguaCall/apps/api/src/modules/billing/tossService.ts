import { AppError } from "../../storage/inMemoryStore";

export const TOSS_PROVIDER = "toss" as const;

export const assertTossOnlyProvider = (provider?: string) => {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) {
    return;
  }
  if (normalized !== TOSS_PROVIDER) {
    throw new AppError("validation_error", "only toss is supported");
  }
};

export const normalizeTossProvider = () => TOSS_PROVIDER;
