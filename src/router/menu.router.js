import express from 'express';
import MenuController from '../controller/menu.controller.js';
import { authGuard } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.js';

const router = express.Router();

router.get('/dates', authGuard, checkPermission('MENU'), MenuController.getDatesWithMenus);
router.get('/', authGuard, checkPermission('MENU'), MenuController.getMenus);

router.post('/', authGuard, checkPermission('MENU'), MenuController.upsertMenu);
router.put('/:id', authGuard, checkPermission('MENU'), MenuController.upsertMenu);

router.delete('/:id', authGuard, checkPermission('MENU'), MenuController.delete);

export default router;