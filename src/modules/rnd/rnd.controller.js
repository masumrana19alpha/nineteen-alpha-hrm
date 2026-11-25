import { asyncHandler } from '../../utils/errors.js';
import {
  createRndInitiative,
  listRndInitiatives,
  updateRndInitiative,
} from './rnd.service.js';

export const getRndInitiatives = asyncHandler(async (req, res) => {
  const { stage, search } = req.query;
  const rows = await listRndInitiatives({ stage, search });
  res.json({ success: true, data: rows });
});

export const postRndInitiative = asyncHandler(async (req, res) => {
  const created = await createRndInitiative({
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const patchRndInitiative = asyncHandler(async (req, res) => {
  const updated = await updateRndInitiative({
    initiativeId: Number(req.params.id),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: updated });
});
