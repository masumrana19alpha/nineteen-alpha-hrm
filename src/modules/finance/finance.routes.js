import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import {
  getAccounts,
  getSummary,
  getVoucher,
  getVoucherPdf,
  getVouchers,
  postAccount,
  postApproveVoucher,
  postVoucher,
} from './finance.controller.js';

const router = Router();

router.use(authenticate);

// Chart of Accounts
router.get('/accounts', requirePermission('finance', 'view'), getAccounts);
router.post('/accounts', requirePermission('finance', 'create'), postAccount);

// Vouchers & Double-Entry Posting
router.get('/vouchers', requirePermission('finance', 'view'), getVouchers);
router.get('/vouchers/:id', requirePermission('finance', 'view'), getVoucher);
router.post('/vouchers', requirePermission('finance', 'create'), postVoucher);
router.post('/vouchers/:id/approve', requirePermission('finance', 'approve'), postApproveVoucher);
router.get('/vouchers/:id/pdf', requirePermission('finance', 'export'), getVoucherPdf);

// Financial Summary
router.get('/summary', requirePermission('finance', 'view'), getSummary);

export default router;
