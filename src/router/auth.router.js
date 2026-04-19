import express from 'express';
import AuthController from '../controller/auth.controller.js';
import { authGuard, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/login', AuthController.login);
router.get('/me', authGuard, AuthController.getMe);
router.get('/admin', authGuard, requireRole('ADMIN'), (req, res) => {
    res.json({msg: "Admin Area"});
});

export default router;