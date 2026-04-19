import { Router } from "express";
import { authGuard } from "../middleware/auth.middleware.js";
import { requireAnyRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.middleware.js"; // Import middleware chung
import { createEventSchema, respondEventSchema } from "../validation/event.validation.js"; // Import schema
import EventController from "../controller/event.controller.js";

const router = Router();

router.use(authGuard);

router.post("/", 
    requireAnyRole("ADMIN", "SUPERVISOR", "MANAGER"), 
    validate(createEventSchema),
    EventController.create
);

router.get("/", EventController.list);

router.put("/:id/respond", 
    validate(respondEventSchema),
    EventController.respond
);

router.get("/:id/stats", 
    requireAnyRole("ADMIN", "CANTEEN", "SUPERVISOR"), 
    EventController.stats
);

export default router;