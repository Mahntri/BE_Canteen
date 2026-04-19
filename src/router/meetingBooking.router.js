import { Router } from "express";
import MeetingBookingController from "../controller/meetingBooking.controller.js";
import { authGuard, requireRole } from "../middleware/auth.middleware.js"; 

const router = Router();

router.use(authGuard);

router.post("/check-conflict", MeetingBookingController.checkConflict);
router.get("/pending-approvals", requireRole("ADMIN", "SUPERVISOR"), MeetingBookingController.getPendingApprovals);

router.get("/", MeetingBookingController.list);
router.post("/", MeetingBookingController.create);

router.get("/:id", MeetingBookingController.getDetail);
router.put("/:id", MeetingBookingController.update);
// router.delete("/:id", MeetingBookingController.delete);
router.post('/:id/cancel', MeetingBookingController.cancel);
router.post("/:id/cancel", MeetingBookingController.cancel);
router.post("/:id/approve", requireRole("ADMIN", "SUPERVISOR"), MeetingBookingController.approve);
router.post("/:id/reject", requireRole("ADMIN", "SUPERVISOR"), MeetingBookingController.reject);
router.get("/:id/logs", requireRole("ADMIN", "SUPERVISOR"), MeetingBookingController.getBookingLogs);

router.get("/policies/all", requireRole("ADMIN"), MeetingBookingController.getBookingPolicies);
router.put("/policies/:id", requireRole("ADMIN"), MeetingBookingController.updateBookingPolicy);

export default router;