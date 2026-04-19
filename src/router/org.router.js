import { Router } from "express";
import OrgController from '../controller/org.controller.js';
import { authGuard } from '../middleware/auth.middleware.js';
import { checkPermission, requireAnyRole } from '../middleware/rbac.js';

const router = Router();

router.get('/', authGuard, checkPermission('CONFIG'), OrgController.getAllOrgs);
router.get('/me', authGuard, checkPermission('CONFIG'), OrgController.getMyOrg);

router.get('/:id/settings', authGuard, OrgController.getSettings); 

router.put('/:id/settings', authGuard, requireAnyRole('ADMIN'), OrgController.updateSettings);

router.get('/:id/shifts', authGuard, checkPermission('CONFIG'), OrgController.getShifts);

router.put('/:id/shifts', authGuard, requireAnyRole('ADMIN'), OrgController.updateShifts);

export default router;