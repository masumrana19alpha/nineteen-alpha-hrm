import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { getDashboard, getProjectReport } from './reports.controller.js';

const router = Router();

router.use(authenticate);

router.get('/dashboard', requirePermission('reports', 'view'), getDashboard);
router.get('/projects/:id/financials', requirePermission('reports', 'view'), getProjectReport);

export default router;
