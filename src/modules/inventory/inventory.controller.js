import { asyncHandler } from '../../utils/errors.js';
import {
  createItem,
  listItems,
  listMovements,
  recordStockMovement,
} from './inventory.service.js';

export const getItems = asyncHandler(async (req, res) => {
  const { item_type, category, search, low_stock } = req.query;
  const rows = await listItems({
    itemType: item_type,
    category,
    search,
    lowStockOnly: low_stock === 'true' || low_stock === '1',
  });
  res.json({ success: true, data: rows });
});

export const postItem = asyncHandler(async (req, res) => {
  const created = await createItem({
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const postMovement = asyncHandler(async (req, res) => {
  const result = await recordStockMovement({
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: result });
});

export const getMovements = asyncHandler(async (req, res) => {
  const { item_id, project_id } = req.query;
  const rows = await listMovements({
    itemId: item_id,
    projectId: project_id,
  });
  res.json({ success: true, data: rows });
});
