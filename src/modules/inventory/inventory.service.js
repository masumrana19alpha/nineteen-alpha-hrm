import { query, withTransaction } from '../../db/pool.js';
import { createNotification, logAudit } from '../../utils/audit.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

export async function listItems({ itemType = '', category = '', search = '', lowStockOnly = false } = {}) {
  const conditions = [];
  const params = [];

  if (itemType) {
    params.push(String(itemType).trim().toUpperCase());
    conditions.push(`i.item_type = $${params.length}`);
  }
  if (category) {
    params.push(String(category).trim());
    conditions.push(`i.category = $${params.length}`);
  }
  if (search) {
    params.push(`%${String(search).trim()}%`);
    conditions.push(`(i.sku ILIKE $${params.length} OR i.name ILIKE $${params.length})`);
  }
  if (lowStockOnly) {
    conditions.push(`i.current_stock <= i.reorder_level`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       i.*,
       (i.current_stock <= i.reorder_level) AS is_low_stock
     FROM inventory_items i
     ${whereSql}
     ORDER BY i.name ASC, i.id ASC`,
    params
  );

  return res.rows;
}

export async function createItem({ payload, actor, ipAddress = null }) {
  if (!payload.sku || !payload.name) {
    throw new ValidationError('sku and name are required');
  }

  const itemType = String(payload.item_type || 'CONSUMABLE').toUpperCase();
  if (!['CONSUMABLE', 'FIXED_ASSET'].includes(itemType)) {
    throw new ValidationError('item_type must be CONSUMABLE or FIXED_ASSET');
  }

  const initialStock = Number(payload.current_stock || 0);
  const unitCost = Number(payload.unit_cost || 0);

  return withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO inventory_items (
         sku, name, item_type, category, unit, current_stock,
         reorder_level, unit_cost, location, is_active, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
       RETURNING *`,
      [
        String(payload.sku).trim().toUpperCase(),
        String(payload.name).trim(),
        itemType,
        payload.category || 'General',
        payload.unit || 'PCS',
        initialStock,
        Number(payload.reorder_level || 5),
        unitCost,
        payload.location || 'Main Store',
        actor.id,
      ]
    );

    const item = res.rows[0];

    if (initialStock > 0) {
      await client.query(
        `INSERT INTO stock_movements (
           item_id, movement_type, quantity, unit_cost, total_cost,
           project_id, reference_no, notes, created_by
         ) VALUES ($1, 'STOCK_IN', $2, $3, $4, $5, $6, $7, $8)`,
        [
          item.id,
          initialStock,
          unitCost,
          Number((initialStock * unitCost).toFixed(2)),
          payload.project_id ? Number(payload.project_id) : null,
          payload.reference_no || 'INIT-STOCK',
          'Initial stock on item creation',
          actor.id,
        ]
      );
    }

    await logAudit(client, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      moduleKey: 'inventory',
      action: 'INVENTORY_ITEM_CREATED',
      entityType: 'inventory_item',
      entityId: item.id,
      details: { sku: item.sku, name: item.name, item_type: item.item_type },
      ipAddress,
    });

    return item;
  });
}

export async function recordStockMovement({ payload, actor, ipAddress = null }) {
  const itemId = Number(payload.item_id);
  const movementType = String(payload.movement_type || '').toUpperCase();
  const quantity = Number(payload.quantity || 0);

  if (!itemId || !['STOCK_IN', 'STOCK_OUT', 'ASSET_ASSIGN', 'ASSET_RETURN'].includes(movementType)) {
    throw new ValidationError(
      'Valid item_id and movement_type (STOCK_IN, STOCK_OUT, ASSET_ASSIGN, ASSET_RETURN) are required'
    );
  }
  if (!quantity || quantity <= 0) {
    throw new ValidationError('quantity must be greater than 0');
  }

  return withTransaction(async (client) => {
    const itemRes = await client.query('SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE', [
      itemId,
    ]);
    const item = itemRes.rows[0];
    if (!item) {
      throw new NotFoundError('Inventory item not found');
    }

    const currentStock = Number(item.current_stock || 0);
    const isOutgoing = movementType === 'STOCK_OUT' || movementType === 'ASSET_ASSIGN';
    const nextStock = isOutgoing ? currentStock - quantity : currentStock + quantity;

    if (nextStock < 0) {
      throw new ValidationError(
        `Insufficient stock for "${item.name}" (${item.sku}). Available: ${currentStock}, requested: ${quantity}`
      );
    }

    const unitCost =
      payload.unit_cost !== undefined ? Number(payload.unit_cost) : Number(item.unit_cost || 0);
    const totalCost = Number((quantity * unitCost).toFixed(2));

    const movRes = await client.query(
      `INSERT INTO stock_movements (
         item_id, movement_type, quantity, unit_cost, total_cost,
         project_id, employee_id, reference_no, notes, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        itemId,
        movementType,
        quantity,
        unitCost,
        totalCost,
        payload.project_id ? Number(payload.project_id) : null,
        payload.employee_id ? Number(payload.employee_id) : null,
        payload.reference_no || null,
        payload.notes || null,
        actor.id,
      ]
    );

    const nextUnitCost = movementType === 'STOCK_IN' && payload.unit_cost !== undefined ? unitCost : item.unit_cost;

    await client.query(
      `UPDATE inventory_items
       SET current_stock = $1, unit_cost = $2, updated_at = NOW()
       WHERE id = $3`,
      [nextStock, nextUnitCost, itemId]
    );

    if (nextStock <= Number(item.reorder_level || 0)) {
      await createNotification(client, {
        userId: null,
        moduleKey: 'inventory',
        title: `Low Stock Alert: ${item.sku}`,
        message: `"${item.name}" stock dropped to ${nextStock} ${item.unit} (reorder level: ${item.reorder_level}).`,
      });
    }

    await logAudit(client, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      moduleKey: 'inventory',
      action: 'STOCK_MOVEMENT_RECORDED',
      entityType: 'stock_movement',
      entityId: movRes.rows[0].id,
      details: {
        sku: item.sku,
        movement_type: movementType,
        quantity,
        previous_stock: currentStock,
        new_stock: nextStock,
      },
      ipAddress,
    });

    return {
      movement: movRes.rows[0],
      previous_stock: currentStock,
      new_stock: nextStock,
    };
  });
}

export async function listMovements({ itemId = '', projectId = '' } = {}) {
  const conditions = [];
  const params = [];

  if (itemId) {
    params.push(Number(itemId));
    conditions.push(`sm.item_id = $${params.length}`);
  }
  if (projectId) {
    params.push(Number(projectId));
    conditions.push(`sm.project_id = $${params.length}`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       sm.*,
       i.sku,
       i.name AS item_name,
       i.unit,
       p.project_code,
       p.name AS project_name,
       e.full_name AS employee_name
     FROM stock_movements sm
     JOIN inventory_items i ON i.id = sm.item_id
     LEFT JOIN projects p ON p.id = sm.project_id
     LEFT JOIN employees e ON e.id = sm.employee_id
     ${whereSql}
     ORDER BY sm.created_at DESC, sm.id DESC`,
    params
  );

  return res.rows;
}
