import { asyncHandler } from '../../utils/errors.js';
import {
  addLeadFollowUp,
  createLead,
  getLeadById,
  listLeads,
  updateLead,
} from './crm.service.js';

export const getLeads = asyncHandler(async (req, res) => {
  const { stage, vertical, search } = req.query;
  const rows = await listLeads({ stage, vertical, search });
  res.json({ success: true, data: rows });
});

export const getLead = asyncHandler(async (req, res) => {
  const row = await getLeadById(Number(req.params.id));
  res.json({ success: true, data: row });
});

export const postLead = asyncHandler(async (req, res) => {
  const created = await createLead({
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const patchLead = asyncHandler(async (req, res) => {
  const updated = await updateLead({
    leadId: Number(req.params.id),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: updated });
});

export const postLeadFollowUp = asyncHandler(async (req, res) => {
  const created = await addLeadFollowUp({
    leadId: Number(req.params.id),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});
