import express from "express";
import { authGuard } from "../middleware/auth.middleware.js";
import checkDebtLock from "../middleware/checkDebt.js"; 

import {
  bulkCreateBookings,
  updateBooking,
  cancelBooking,
  getMyBookingHistory,
} from "../controller/booking.controller.js";

const router = express.Router();

router.use(authGuard);

router.post("/bulk", checkDebtLock, bulkCreateBookings);
router.patch("/:id", checkDebtLock, updateBooking);

router.get("/history", getMyBookingHistory);
router.patch("/:id/cancel", cancelBooking);

export default router;