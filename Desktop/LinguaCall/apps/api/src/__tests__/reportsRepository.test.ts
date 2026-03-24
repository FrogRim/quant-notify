import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  return {
    getReportByPublicId: vi.fn()
  };
});

vi.mock("../storage/inMemoryStore", () => {
  return {
    store: {
      getReportByPublicId: mocked.getReportByPublicId
    }
  };
});

import { reportsRepository } from "../modules/reports/repository";

describe("reportsRepository", () => {
  beforeEach(() => {
    mocked.getReportByPublicId.mockReset();
  });

  it("loads a report through the reports repository", async () => {
    mocked.getReportByPublicId.mockResolvedValue({
      id: "report-1",
      publicId: "RG_1",
      sessionId: "session-1",
      status: "ready",
      recommendations: [],
      attemptCount: 1,
      createdAt: "2026-03-23T00:00:00.000Z"
    });

    const report = await reportsRepository.getByPublicId("local:user-1", "RG_1");

    expect(report?.id).toBe("report-1");
    expect(mocked.getReportByPublicId).toHaveBeenCalledWith("local:user-1", "RG_1");
  });
});
