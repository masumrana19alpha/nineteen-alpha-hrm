import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { vaultUpload } from '../../middleware/upload.js';
import {
  getAttendance,
  getAttendancePdf,
  getBiometric,
  getEmployee,
  getEmployees,
  getHolidays,
  getPayroll,
  getPayslipPdf,
  patchBiometric,
  patchEmployee,
  postAttendance,
  postEmployee,
  postEmployeeDocument,
  postGeneratePayroll,
  postHoliday,
  postMarkPayrollPaid,
} from './hr.controller.js';

const router = Router();

router.use(authenticate);

// Employees & Document Vault
router.get('/employees', requirePermission('hr', 'view'), getEmployees);
router.get('/employees/:id', requirePermission('hr', 'view'), getEmployee);
router.post('/employees', requirePermission('hr', 'create'), postEmployee);
router.patch('/employees/:id', requirePermission('hr', 'edit'), patchEmployee);
router.post(
  '/employees/:id/documents',
  requirePermission('hr', 'create'),
  vaultUpload.single('document'),
  postEmployeeDocument
);

// Biometric Toggle & Attendance
router.get('/biometric', requirePermission('hr', 'view'), getBiometric);
router.patch('/biometric', requirePermission('hr', 'edit'), patchBiometric);
router.post('/attendance', requirePermission('hr', 'create'), postAttendance);
router.get('/attendance', requirePermission('hr', 'view'), getAttendance);
router.get('/attendance/pdf', requirePermission('hr', 'export'), getAttendancePdf);

// Holidays
router.get('/holidays', requirePermission('hr', 'view'), getHolidays);
router.post('/holidays', requirePermission('hr', 'create'), postHoliday);

// Payroll & PDF Payslips
router.post('/payroll/generate', requirePermission('hr', 'create'), postGeneratePayroll);
router.get('/payroll', requirePermission('hr', 'view'), getPayroll);
router.post('/payroll/:id/pay', requirePermission('hr', 'approve'), postMarkPayrollPaid);
router.get('/payroll/:id/pdf', requirePermission('hr', 'export'), getPayslipPdf);

export default router;
