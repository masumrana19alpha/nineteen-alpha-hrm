import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { getItems, getMovements, postItem, postMovement } from './inventory.controller.js';

const router = Router();

router.use(authenticate);

router.get('/items', requirePermission('inventory', 'view'), getItems);
router.post('/items', requirePermission('inventory', 'create'), postItem);
router.post('/movements', requirePermission('inventory', 'edit'), postMovement);
router.get('/movements', requirePermission('inventory', 'view'), getMovements);

export default router;
