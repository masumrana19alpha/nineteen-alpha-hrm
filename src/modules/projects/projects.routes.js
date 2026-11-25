import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { vaultUpload } from '../../middleware/upload.js';
import {
  getProject,
  getProjects,
  patchMilestone,
  patchProject,
  postMember,
  postMilestone,
  postProject,
  postProjectDocument,
  postProjectExpense,
} from './projects.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('projects', 'view'), getProjects);
router.get('/:id', requirePermission('projects', 'view'), getProject);
router.post('/', requirePermission('projects', 'create'), postProject);
router.patch('/:id', requirePermission('projects', 'edit'), patchProject);

router.post('/:id/milestones', requirePermission('projects', 'edit'), postMilestone);
router.patch('/milestones/:milestoneId', requirePermission('projects', 'edit'), patchMilestone);

router.post('/:id/members', requirePermission('projects', 'edit'), postMember);
router.post(
  '/:id/documents',
  requirePermission('projects', 'create'),
  vaultUpload.single('document'),
  postProjectDocument
);
router.post('/:id/expenses', requirePermission('projects', 'edit'), postProjectExpense);

export default router;
