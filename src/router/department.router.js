import { Router } from "express";
import { authGuard } from "../middleware/auth.middleware.js";
import { checkPermission, requireAnyRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.middleware.js";
import { createDepartmentSchema, updateDepartmentSchema } from "../validation/department.validation.js";

import { 
    getDepartmentsTree, 
    getUnassignedMembers, 
    getDepartmentMembers, 
    listDepartments, 
    getDepartment, 
    createDepartment, 
    updateDepartment, 
    deleteDepartment 
} from "../controller/department.controller.js";

const router = Router();
router.use(authGuard);

router.get("/tree", checkPermission('SYSTEM_ADMIN'), getDepartmentsTree);
router.get("/unassigned/members", checkPermission('SYSTEM_ADMIN'), getUnassignedMembers);
router.get("/:id/members", checkPermission('SYSTEM_ADMIN'), getDepartmentMembers);
router.get("/", checkPermission('SYSTEM_ADMIN'), listDepartments);
router.get("/:id", checkPermission('SYSTEM_ADMIN'), getDepartment);

router.post("/", requireAnyRole("ADMIN"), validate(createDepartmentSchema), createDepartment);
router.put("/:id", requireAnyRole("ADMIN"), validate(updateDepartmentSchema), updateDepartment);
router.delete("/:id", requireAnyRole("ADMIN"), deleteDepartment);

export default router;