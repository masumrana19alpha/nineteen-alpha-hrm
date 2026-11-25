import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import {
  getLead,
  getLeads,
  patchLead,
  postLead,
  postLeadFollowUp,
} from './crm.controller.js';

const router = Router();

router.use(authenticate);

router.get('/leads', requirePermission('crm', 'view'), getLeads);
router.get('/leads/:id', requirePermission('crm', 'view'), getLead);
router.post('/leads', requirePermission('crm', 'create'), postLead);
router.patch('/leads/:id', requirePermission('crm', 'edit'), patchLead);
router.post('/leads/:id/follow-ups', requirePermission('crm', 'edit'), postLeadFollowUp);

export default router;
