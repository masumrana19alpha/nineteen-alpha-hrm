import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { getTasks, postTask, patchTask, removeTask } from './tasks.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('tasks', 'view'), getTasks);
router.post('/', requirePermission('tasks', 'create'), postTask);
router.patch('/:id', requirePermission('tasks', 'edit'), patchTask);
router.delete('/:id', requirePermission('tasks', 'delete'), removeTask);

export default router;
