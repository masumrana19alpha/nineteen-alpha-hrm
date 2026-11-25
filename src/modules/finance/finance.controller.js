import { asyncHandler } from '../../utils/errors.js';
import {
  approveAndPostVoucher,
  createAccount,
  createVoucher,
  generateVoucherPdfById,
  getFinanceSummary,
  getVoucherById,
  listAccounts,
  listVouchers,
} from './finance.service.js';

export const getAccounts = asyncHandler(async (_req, res) => {
  const rows = await listAccounts();
  res.json({ success: true, data: rows });
});

export const postAccount = asyncHandler(async (req, res) => {
  const created = await createAccount({
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const getVouchers = asyncHandler(async (req, res) => {
  const { status, voucher_type, project_id } = req.query;
  const rows = await listVouchers({
    status,
    voucherType: voucher_type,
    projectId: project_id,
  });
  res.json({ success: true, data: rows });
});

export const getVoucher = asyncHandler(async (req, res) => {
  const voucher = await getVoucherById(Number(req.params.id));
  res.json({ success: true, data: voucher });
});

export const postVoucher = asyncHandler(async (req, res) => {
  const created = await createVoucher({
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const postApproveVoucher = asyncHandler(async (req, res) => {
  const updated = await approveAndPostVoucher({
    voucherId: Number(req.params.id),
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: updated });
});

export const getVoucherPdf = asyncHandler(async (req, res) => {
  const pdfBuffer = await generateVoucherPdfById(Number(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="voucher-${req.params.id}.pdf"`);
  res.send(pdfBuffer);
});

export const getSummary = asyncHandler(async (_req, res) => {
  const summary = await getFinanceSummary();
  res.json({ success: true, data: summary });
});
