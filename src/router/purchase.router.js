import express from 'express';
import purchaseController from '../controller/purchase.controller.js';
import { authGuard } from '../middleware/auth.middleware.js';
import { checkPermission, requireAnyRole } from '../middleware/rbac.js';

const router = express.Router();

router.get('/', authGuard, checkPermission('PURCHASING'), purchaseController.getAll);

router.post('/', authGuard, checkPermission('PURCHASING'), purchaseController.create);

router.put('/:id', authGuard, checkPermission('PURCHASING'), purchaseController.update);

router.delete('/:id', authGuard, requireAnyRole('ADMIN'), purchaseController.delete);

export default router;