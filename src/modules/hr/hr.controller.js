import { asyncHandler } from '../../utils/errors.js';
import {
  addEmployeeDocument,
  createEmployee,
  createHoliday,
  generateAttendancePdf,
  generateMonthlyPayroll,
  generatePayslipPdfById,
  getBiometricSetting,
  getEmployeeById,
  listAttendanceLogs,
  listEmployees,
  listHolidays,
  listPayrollRecords,
  logAttendance,
  markPayrollPaid,
  toggleBiometricSetting,
  updateEmployee,
} from './hr.service.js';

export const getEmployees = asyncHandler(async (req, res) => {
  const { search, department, status } = req.query;
  const rows = await listEmployees({ search, department, status });
  res.json({ success: true, data: rows });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const row = await getEmployeeById(Number(req.params.id));
  res.json({ success: true, data: row });
});

export const postEmployee = asyncHandler(async (req, res) => {
  const created = await createEmployee({
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const patchEmployee = asyncHandler(async (req, res) => {
  const updated = await updateEmployee({
    employeeId: Number(req.params.id),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: updated });
});

export const postEmployeeDocument = asyncHandler(async (req, res) => {
  const doc = await addEmployeeDocument({
    employeeId: Number(req.params.id),
    docType: req.body?.doc_type,
    docTitle: req.body?.doc_title,
    file: req.file,
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: doc });
});

export const getBiometric = asyncHandler(async (_req, res) => {
  const cfg = await getBiometricSetting();
  res.json({ success: true, data: cfg });
});

export const patchBiometric = asyncHandler(async (req, res) => {
  const cfg = await toggleBiometricSetting({
    enabled: req.body?.enabled,
    deviceMode: req.body?.device_mode,
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: cfg });
});

export const postAttendance = asyncHandler(async (req, res) => {
  const log = await logAttendance({
    employeeId: req.body?.employee_id || req.user?.employee_id,
    action: req.body?.action || 'CHECK_IN',
    source: req.body?.source || 'MANUAL',
    deviceRef: req.body?.device_ref || null,
    remarks: req.body?.remarks || null,
    logDate: req.body?.log_date || null,
    logTime: req.body?.log_time || null,
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: log });
});

export const getAttendance = asyncHandler(async (req, res) => {
  const { employee_id, start_date, end_date } = req.query;
  const rows = await listAttendanceLogs({
    employeeId: employee_id,
    startDate: start_date,
    endDate: end_date,
  });
  res.json({ success: true, data: rows });
});

export const getAttendancePdf = asyncHandler(async (req, res) => {
  const { employee_id, start_date, end_date } = req.query;
  const pdfBuffer = await generateAttendancePdf({
    employeeId: employee_id,
    startDate: start_date,
    endDate: end_date,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.pdf"');
  res.send(pdfBuffer);
});

export const getHolidays = asyncHandler(async (_req, res) => {
  const rows = await listHolidays();
  res.json({ success: true, data: rows });
});

export const postHoliday = asyncHandler(async (req, res) => {
  const created = await createHoliday({
    holidayDate: req.body?.holiday_date,
    title: req.body?.title,
    holidayType: req.body?.holiday_type,
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const postGeneratePayroll = asyncHandler(async (req, res) => {
  const rows = await generateMonthlyPayroll({
    payMonth: req.body?.pay_month,
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: rows });
});

export const getPayroll = asyncHandler(async (req, res) => {
  const rows = await listPayrollRecords({ payMonth: req.query?.pay_month });
  res.json({ success: true, data: rows });
});

export const postMarkPayrollPaid = asyncHandler(async (req, res) => {
  const updated = await markPayrollPaid({
    payrollId: Number(req.params.id),
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: updated });
});

export const getPayslipPdf = asyncHandler(async (req, res) => {
  const pdfBuffer = await generatePayslipPdfById(Number(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${req.params.id}.pdf"`);
  res.send(pdfBuffer);
});
