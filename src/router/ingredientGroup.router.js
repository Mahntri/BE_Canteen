import { Router } from "express";
import { authGuard } from "../middleware/auth.middleware.js";
import { checkPermission, requireAnyRole } from "../middleware/rbac.js"; 
import {
    listIngredientGroups,
    getIngredientGroup,
    createIngredientGroup,
    updateIngredientGroup,
    deleteIngredientGroup,
} from "../controller/ingredientGroup.controller.js";

const router = Router();
router.use(authGuard); 

router.get("/", checkPermission("INGREDIENTS"), listIngredientGroups);
router.get("/:id", checkPermission("INGREDIENTS"), getIngredientGroup);

router.post("/", requireAnyRole("ADMIN"), createIngredientGroup);
router.put("/:id", requireAnyRole("ADMIN"), updateIngredientGroup);
router.delete("/:id", requireAnyRole("ADMIN"), deleteIngredientGroup);

export default router;