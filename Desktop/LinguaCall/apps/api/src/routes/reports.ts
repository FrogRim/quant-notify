import { Response, Router } from "express";
import { ApiResponse, ApiError, Report } from "@lingua/shared";
import { AppError } from "../storage/inMemoryStore";
import { requireAuthenticatedUser, AuthenticatedRequest } from "../middleware/auth";
import { reportsRepository } from "../modules/reports/repository";

const router = Router();

const withError = (res: Response<ApiResponse<unknown>>, message = "request_failed", code: ApiError["code"] = "validation_error") => {
  res.status(400).json({ ok: false, error: { code, message } });
};

router.get("/:id", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Report>>) => {
  const { id } = req.params;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "report id required" } });
    return;
  }

  try {
    const report = await reportsRepository.getByPublicId(req.clerkUserId, id);
    res.json({ ok: true, data: report });
  } catch (err) {
    if (err instanceof AppError && err.code === "REPORT_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    withError(res, "failed_to_fetch_report");
  }
});

export default router;
