import { Router } from "express";
import { authGuard } from "../middleware/auth.middleware.js";
import { checkPermission, requireAnyRole } from "../middleware/rbac.js"; 
import { validate } from "../middleware/validate.middleware.js";
import { createWarehouseSchema, updateWarehouseSchema } from "../validation/warehouse.validation.js";
import WarehouseController from "../controller/warehouse.controller.js";

const router = Router();

router.get("/", authGuard, checkPermission("INVENTORY"), WarehouseController.listWarehouses);

router.get("/:id/stocks", authGuard, checkPermission("INVENTORY"), WarehouseController.getWarehouseStocks);

router.post("/", authGuard, checkPermission("INVENTORY"), validate(createWarehouseSchema), WarehouseController.createWarehouse);

router.put("/:id", authGuard, checkPermission("INVENTORY"), validate(updateWarehouseSchema), WarehouseController.updateWarehouse);

router.delete("/:id", authGuard, requireAnyRole("ADMIN"), WarehouseController.deleteWarehouse);

export default router;