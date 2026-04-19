import express from 'express';
import DishController from '../controller/dish.controller.js';
import { authGuard } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.js';

const router = express.Router();

// Cho phép tất cả user đã đăng nhập xem được món ăn (để đặt món)
router.get('/', authGuard, DishController.getAll);

router.post('/', authGuard, checkPermission('DISHES'), DishController.create);
router.put('/:id', authGuard, checkPermission('DISHES'), DishController.update);
router.delete('/:id', authGuard, checkPermission('DISHES'), DishController.delete);

export default router;