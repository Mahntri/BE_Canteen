import { Router } from "express";
import DriverController from "../controller/driver.controller.js";
import { authGuard, requireRole } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js"; // Giả sử đã có middleware này
import { createDriverSchema, updateDriverSchema, ratingSchema } from "../validation/driver.validation.js";

const router = Router();

router.use(authGuard);

router.get("/reports/performance", requireRole("ADMIN", "SUPERVISOR"), DriverController.getPerformanceReport);

router.post("/ratings", validate(ratingSchema), DriverController.createRating); // User đánh giá

router.get("/", requireRole("ADMIN", "SUPERVISOR", "DISPATCHER","EMPLOYEE","CANTEEN","DRIVER"), DriverController.list);
router.post("/", requireRole("ADMIN"), validate(createDriverSchema), DriverController.create);

router.get("/:id", requireRole("ADMIN", "SUPERVISOR", "DISPATCHER"), DriverController.getDetail);
router.put("/:id", requireRole("ADMIN"), validate(updateDriverSchema), DriverController.update);
router.delete("/:id", requireRole("ADMIN"), DriverController.delete);

router.get("/:id/ratings", requireRole("ADMIN", "SUPERVISOR"), DriverController.getDriverRatings);
router.get("/:id/rating-summary", requireRole("ADMIN", "SUPERVISOR"), DriverController.getRatingSummary);

export default router;