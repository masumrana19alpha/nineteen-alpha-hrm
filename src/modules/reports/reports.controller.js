import { asyncHandler, NotFoundError } from '../../utils/errors.js';
import { getExecutiveDashboard, getProjectFinancialReport } from './reports.service.js';

export const getDashboard = asyncHandler(async (_req, res) => {
  const data = await getExecutiveDashboard();
  res.json({ success: true, data });
});

export const getProjectReport = asyncHandler(async (req, res) => {
  const report = await getProjectFinancialReport(Number(req.params.id));
  if (!report) {
    throw new NotFoundError('Project not found');
  }
  res.json({ success: true, data: report });
});
