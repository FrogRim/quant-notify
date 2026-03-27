export const describeErrorForLog = (error: unknown) => {
  if (error instanceof Error) {
    const described: { name: string; message: string; code?: string } = {
      name: error.name,
      message: error.message
    };

    const maybeCode = Reflect.get(error, "code");
    if (typeof maybeCode === "string" && maybeCode.trim()) {
      described.code = maybeCode;
    }

    return described;
  }

  return {
    message: typeof error === "string" ? error : "unknown_error"
  };
};

export const summarizeUserIdForLog = (userId?: string | null) => {
  const normalized = String(userId ?? "").trim();
  if (!normalized) {
    return undefined;
  }

  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex >= 0) {
    const provider = normalized.slice(0, separatorIndex);
    const subject = normalized.slice(separatorIndex + 1);
    return `${provider}:${subject.slice(0, 8)}...`;
  }

  return `${normalized.slice(0, 8)}...`;
};
