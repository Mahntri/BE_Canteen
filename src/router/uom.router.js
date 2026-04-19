import { Router } from "express";
import { authGuard } from "../middleware/auth.middleware.js";
import { checkPermission, requireAnyRole } from "../middleware/rbac.js";
import { listUoms, getUom, createUom, updateUom, deleteUom } from "../controller/uom.controller.js";

const router = Router();

router.get("/", authGuard, checkPermission("INGREDIENTS"), listUoms);
router.get("/:id", authGuard, checkPermission("INGREDIENTS"), getUom);

router.post("/", authGuard, requireAnyRole("ADMIN"), createUom);
router.put("/:id", authGuard, requireAnyRole("ADMIN"), updateUom);
router.delete("/:id", authGuard, requireAnyRole("ADMIN"), deleteUom);

export default router;