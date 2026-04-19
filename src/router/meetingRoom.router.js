import { Router } from "express";
import MeetingRoomController from "../controller/meetingRoom.controller.js";
import { authGuard, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authGuard);

router.get("/", MeetingRoomController.getRooms);
router.get("/:id", MeetingRoomController.getRoomDetail);

router.post("/", requireRole("ADMIN", "SUPERVISOR"), MeetingRoomController.createRoom);
router.patch("/:id", requireRole("ADMIN", "SUPERVISOR"), MeetingRoomController.updateRoom);
router.patch("/:id/toggle-active", requireRole("ADMIN", "SUPERVISOR"), MeetingRoomController.toggleActive);
router.delete("/:id", requireRole("ADMIN", "SUPERVISOR"), MeetingRoomController.deleteRoom);

export default router;