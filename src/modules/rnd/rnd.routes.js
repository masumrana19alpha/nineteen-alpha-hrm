import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import {
  getRndInitiatives,
  patchRndInitiative,
  postRndInitiative,
} from './rnd.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('rnd', 'view'), getRndInitiatives);
router.post('/', requirePermission('rnd', 'create'), postRndInitiative);
router.patch('/:id', requirePermission('rnd', 'edit'), patchRndInitiative);

export default router;
