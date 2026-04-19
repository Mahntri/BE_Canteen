import { Router } from "express";
import CarBookingController from "../controller/carBooking.controller.js";
import { authGuard, requireRole } from "../middleware/auth.middleware.js";

const router = Router();
router.use(authGuard);

router.get("/my/export", CarBookingController.exportMyHistory);
router.get("/my", CarBookingController.getBookings);
router.get("/my", CarBookingController.getMyBookings);

router.get("/reports/summary", requireRole("ADMIN", "SUPERVISOR"), CarBookingController.getReports);
router.get("/available-resources", CarBookingController.getAvailableResources);

router.get("/vehicles/:id/schedule", CarBookingController.getVehicleSchedule);
router.get("/drivers/:id/schedule", CarBookingController.getDriverSchedule);

router.post("/", CarBookingController.createBooking);
router.get("/", requireRole("ADMIN", "SUPERVISOR"), CarBookingController.getBookings);

router.get("/:id", CarBookingController.getBookingDetail);
router.patch("/:id", CarBookingController.updateBooking);

router.patch("/:id/cancel", CarBookingController.cancelBooking);
router.patch("/:id/complete", CarBookingController.completeBooking);

router.patch("/:id/approve", requireRole("ADMIN", "SUPERVISOR"), CarBookingController.approveBooking);
router.patch("/:id/reject", requireRole("ADMIN", "SUPERVISOR"), CarBookingController.rejectBooking);
router.patch("/:id/assign", requireRole("ADMIN", "SUPERVISOR"), CarBookingController.assignResources);
router.patch("/:id/incident", requireRole("ADMIN", "SUPERVISOR"), CarBookingController.reportIncident); // [ĐÃ BỔ SUNG] Báo cáo sự cố

export default router;