import { query } from '../../db/pool.js';

export async function getExecutiveDashboard() {
  const [
    hrRes,
    projRes,
    taskRes,
    crmRes,
    invRes,
    finRes,
    rndRes,
    recentAuditRes,
    notificationsRes,
  ] = await Promise.all([
    query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_employees,
        COUNT(*) FILTER (WHERE status <> 'ACTIVE')::int AS inactive_employees,
        COALESCE(SUM(base_salary) FILTER (WHERE status = 'ACTIVE'), 0)::numeric(14,2) AS monthly_base_payroll
      FROM employees
    `),
    query(`
      SELECT
        COUNT(*)::int AS total_projects,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS active_projects,
        COUNT(*) FILTER (WHERE is_defence_project = TRUE)::int AS defence_projects,
        COALESCE(SUM(budget_amount), 0)::numeric(14,2) AS total_budget,
        COALESCE(SUM(spent_amount), 0)::numeric(14,2) AS total_spent
      FROM projects
    `),
    query(`
      SELECT
        COUNT(*)::int AS total_tasks,
        COUNT(*) FILTER (WHERE status = 'TODO')::int AS todo_tasks,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress_tasks,
        COUNT(*) FILTER (WHERE status = 'REVIEW')::int AS review_tasks,
        COUNT(*) FILTER (WHERE status = 'DONE')::int AS done_tasks
      FROM tasks
    `),
    query(`
      SELECT
        COUNT(*)::int AS total_leads,
        COUNT(*) FILTER (WHERE stage NOT IN ('WON', 'LOST'))::int AS open_leads,
        COUNT(*) FILTER (WHERE stage = 'WON')::int AS won_leads,
        COALESCE(SUM(estimated_value) FILTER (WHERE stage NOT IN ('WON', 'LOST')), 0)::numeric(14,2) AS open_pipeline_value,
        COALESCE(SUM(estimated_value) FILTER (WHERE stage = 'WON'), 0)::numeric(14,2) AS won_value
      FROM crm_leads
    `),
    query(`
      SELECT
        COUNT(*)::int AS total_skus,
        COUNT(*) FILTER (WHERE current_stock <= reorder_level)::int AS low_stock_items,
        COALESCE(SUM(current_stock * unit_cost), 0)::numeric(14,2) AS inventory_valuation
      FROM inventory_items
      WHERE is_active = TRUE
    `),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS pending_vouchers,
        COUNT(*) FILTER (WHERE status = 'POSTED')::int AS posted_vouchers,
        COALESCE(SUM(total_debit) FILTER (WHERE status = 'POSTED'), 0)::numeric(14,2) AS posted_volume
      FROM accounting_vouchers
    `),
    query(`
      SELECT
        COUNT(*)::int AS total_initiatives,
        COUNT(*) FILTER (WHERE stage NOT IN ('COMMERCIALIZED', 'ARCHIVED'))::int AS active_initiatives,
        COALESCE(SUM(budget_allocated), 0)::numeric(14,2) AS total_rnd_budget
      FROM rnd_initiatives
    `),
    query(`
      SELECT id, actor_username, module_key, action, entity_type, entity_id, created_at
      FROM audit_logs
      ORDER BY created_at DESC, id DESC
      LIMIT 15
    `),
    query(`
      SELECT id, module_key, title, message, is_read, created_at
      FROM notifications
      ORDER BY created_at DESC, id DESC
      LIMIT 15
    `),
  ]);

  return {
    hr: hrRes.rows[0],
    projects: projRes.rows[0],
    tasks: taskRes.rows[0],
    crm: crmRes.rows[0],
    inventory: invRes.rows[0],
    finance: finRes.rows[0],
    rnd: rndRes.rows[0],
    recent_audit: recentAuditRes.rows,
    notifications: notificationsRes.rows,
  };
}

export async function getProjectFinancialReport(projectId) {
  const projRes = await query(
    `SELECT p.*, e.full_name AS manager_name
     FROM projects p
     LEFT JOIN employees e ON e.id = p.manager_employee_id
     WHERE p.id = $1`,
    [projectId]
  );
  if (!projRes.rows[0]) {
    return null;
  }

  const movementsRes = await query(
    `SELECT sm.*, i.sku, i.name AS item_name, i.unit
     FROM stock_movements sm
     JOIN inventory_items i ON i.id = sm.item_id
     WHERE sm.project_id = $1
     ORDER BY sm.created_at DESC`,
    [projectId]
  );

  const vouchersRes = await query(
    `SELECT *
     FROM accounting_vouchers
     WHERE project_id = $1
     ORDER BY voucher_date DESC, id DESC`,
    [projectId]
  );

  return {
    project: projRes.rows[0],
    stock_movements: movementsRes.rows,
    vouchers: vouchersRes.rows,
  };
}
