import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { changePassword, login, logout, me } from './auth.controller.js';

const router = Router();

router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);
router.post('/change-password', authenticate, changePassword);

export default router;
