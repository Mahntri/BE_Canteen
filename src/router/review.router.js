import express from 'express';
import ReviewController from '../controller/review.controller.js';
import { authGuard } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.js';

const router = express.Router();

router.post('/', authGuard, ReviewController.create);
router.get('/status', authGuard, ReviewController.checkStatus);
router.get('/stats', authGuard, checkPermission('REGISTRATION'), ReviewController.getStats);
router.get('/:id', authGuard, checkPermission('REGISTRATION'), ReviewController.getDetail);

export default router;