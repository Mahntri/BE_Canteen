import express from 'express';
import userController from '../controller/user.controller.js';
import { authGuard } from '../middleware/auth.middleware.js';
import { checkPermission, requireAnyRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.middleware.js';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from '../validation/user.validation.js';

const router = express.Router();
router.use(authGuard);

router.get('/', requireAnyRole('ADMIN', 'SUPERVISOR', 'MANAGER'), userController.getAllUsers);
router.get('/roles', checkPermission('SYSTEM_ADMIN'), userController.getRoles);
router.get('/roles/:id/permissions', checkPermission('SYSTEM_ADMIN'), userController.getRolePermissions);
router.get('/departments', checkPermission('SYSTEM_ADMIN'), userController.getDepartments);
router.get('/permissions-tree', checkPermission('SYSTEM_ADMIN'), userController.getPermissionsTree);
router.get('/:id', checkPermission('SYSTEM_ADMIN'), userController.getUserDetail);
router.get('/:id/permissions', checkPermission('SYSTEM_ADMIN'), userController.getUserPermissions);

router.post('/', requireAnyRole('ADMIN'), validate(createUserSchema), userController.createUser);
router.post('/import', requireAnyRole('ADMIN'), userController.importUsers);
router.post('/bulk-action', requireAnyRole('ADMIN'), userController.bulkAction);
router.put('/:id/lock', requireAnyRole('ADMIN'), userController.toggleLockAccount);
router.put('/:id/permissions', requireAnyRole('ADMIN'), userController.updateUserPermissions);
router.put('/:id/reset-password', requireAnyRole('ADMIN'), validate(resetPasswordSchema), userController.resetPassword);
router.put('/:id/department', requireAnyRole('ADMIN'), userController.moveUserDepartment);
router.delete('/:id/department', requireAnyRole('ADMIN'), userController.removeFromDepartment);
router.put('/:id', requireAnyRole('ADMIN'), validate(updateUserSchema), userController.updateUser);
router.delete('/:id', requireAnyRole('ADMIN'), userController.deleteUser);

export default router;