import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import hrRoutes from '../modules/hr/hr.routes.js';
import projectsRoutes from '../modules/projects/projects.routes.js';
import tasksRoutes from '../modules/tasks/tasks.routes.js';
import crmRoutes from '../modules/crm/crm.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import financeRoutes from '../modules/finance/finance.routes.js';
import rndRoutes from '../modules/rnd/rnd.routes.js';
import reportsRoutes from '../modules/reports/reports.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/hr', hrRoutes);
router.use('/projects', projectsRoutes);
router.use('/tasks', tasksRoutes);
router.use('/crm', crmRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/finance', financeRoutes);
router.use('/rnd', rndRoutes);
router.use('/reports', reportsRoutes);

export default router;
