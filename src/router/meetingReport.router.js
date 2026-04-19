import { Router } from "express";
import { authGuard } from "../middleware/auth.middleware.js";
import { checkPermission } from "../middleware/rbac.js";
import {
  getBookingHistory,
  getMeetingRoomUsageReport,
  getMeetingRoomUtilizationReport,
  getMeetingRoomIncidentsReport,
} from "../controller/meetingReport.controller.js";

const router = Router();

router.use(authGuard);

router.get("/history", checkPermission("SYSTEM_ADMIN"), getBookingHistory);
router.get("/usage", checkPermission("SYSTEM_ADMIN"), getMeetingRoomUsageReport);
router.get("/utilization", checkPermission("SYSTEM_ADMIN"), getMeetingRoomUtilizationReport);
router.get("/incidents", checkPermission("SYSTEM_ADMIN"), getMeetingRoomIncidentsReport);

export default router;