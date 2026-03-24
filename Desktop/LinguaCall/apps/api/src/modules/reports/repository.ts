import type { Report } from "@lingua/shared";
import { store } from "../../storage/inMemoryStore";

export const reportsRepository = {
  getByPublicId(clerkUserId: string, publicId: string): Promise<Report> {
    return store.getReportByPublicId(clerkUserId, publicId);
  }
};
