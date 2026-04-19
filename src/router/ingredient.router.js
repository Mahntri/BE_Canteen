import { Router } from "express";
import { authGuard } from "../middleware/auth.middleware.js";
import { checkPermission, requireAnyRole } from "../middleware/rbac.js"; 
import { listIngredients, getIngredient, createIngredient, updateIngredient, deleteIngredient } from "../controller/ingredient.controller.js";

const router = Router();
router.use(authGuard);

router.get("/", checkPermission("INGREDIENTS"), listIngredients);
router.get("/:id", checkPermission("INGREDIENTS"), getIngredient);

router.post("/", requireAnyRole("ADMIN"), createIngredient);
router.put("/:id", requireAnyRole("ADMIN"), updateIngredient);
router.delete("/:id", requireAnyRole("ADMIN"), deleteIngredient);

export default router;