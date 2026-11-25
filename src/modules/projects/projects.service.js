import path from 'node:path';
import { env } from '../../config/env.js';
import { query, withTransaction } from '../../db/pool.js';
import { createNotification, logAudit } from '../../utils/audit.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const ALLOWED_VERTICALS = new Set(['DEFENCE', 'PRIVATE', 'SOFTWARE', 'CONSULTANCY', 'CONSTRUCTION']);

function normalizeVertical(val) {
  const v = String(val || 'PRIVATE').trim().toUpperCase();
  if (!ALLOWED_VERTICALS.has(v)) {
    throw new ValidationError(
      `Invalid vertical "${val}". Allowed: DEFENCE, PRIVATE, SOFTWARE, CONSULTANCY, CONSTRUCTION`
    );
  }
  return v;
}

export async function listProjects({ vertical = '', status = '', search = '', actor = null } = {}) {
  const conditions = [];
  const params = [];

  if (vertical) {
    params.push(normalizeVertical(vertical));
    conditions.push(`p.vertical = $${params.length}`);
  }
  if (status) {
    params.push(String(status).trim());
    conditions.push(`p.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${String(search).trim()}%`);
    conditions.push(
      `(p.project_code ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.client_name ILIKE $${params.length})`
    );
  }

  // Defence project clearance guard for non-privileged staff
  if (actor && actor.role_code !== 'SUPER_ADMIN' && actor.role_code !== 'ADMIN') {
    const uacl = actor.uacl?.projects;
    if (!uacl?.can_approve && !uacl?.can_edit) {
      conditions.push(`p.is_defence_classified = FALSE`);
    }
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       p.*,
       e.full_name AS project_manager_name,
       e.employee_code AS project_manager_code,
       COALESCE(m_stats.total_milestones, 0)::int AS total_milestones,
       COALESCE(m_stats.completed_milestones, 0)::int AS completed_milestones,
       COALESCE(t_stats.total_tasks, 0)::int AS total_tasks,
       COALESCE(t_stats.done_tasks, 0)::int AS done_tasks
     FROM projects p
     LEFT JOIN employees e ON e.id = p.project_manager_id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) AS total_milestones,
         COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_milestones
       FROM project_milestones
       WHERE project_id = p.id
     ) m_stats ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) AS total_tasks,
         COUNT(*) FILTER (WHERE status = 'DONE') AS done_tasks
       FROM tasks
       WHERE project_id = p.id
     ) t_stats ON TRUE
     ${whereSql}
     ORDER BY p.created_at DESC, p.id DESC`,
    params
  );

  return res.rows;
}

export async function getProjectById(projectId) {
  const res = await query(
    `SELECT
       p.*,
       e.full_name AS project_manager_name,
       e.employee_code AS project_manager_code
     FROM projects p
     LEFT JOIN employees e ON e.id = p.project_manager_id
     WHERE p.id = $1`,
    [projectId]
  );

  if (!res.rows[0]) {
    throw new NotFoundError('Project not found');
  }

  const milestonesRes = await query(
    `SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY due_date ASC NULLS LAST, id ASC`,
    [projectId]
  );

  const membersRes = await query(
    `SELECT
       pm.*,
       e.full_name,
       e.employee_code,
       e.designation,
       e.department
     FROM project_members pm
     JOIN employees e ON e.id = pm.employee_id
     WHERE pm.project_id = $1
     ORDER BY pm.id ASC`,
    [projectId]
  );

  const docsRes = await query(
    `SELECT
       d.*,
       u.username AS uploaded_by_username
     FROM project_documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.project_id = $1
     ORDER BY d.uploaded_at DESC`,
    [projectId]
  );

  const expensesRes = await query(
    `SELECT
       pe.*,
       e.full_name AS logged_by_name,
       v.voucher_no,
       v.status AS voucher_status
     FROM project_expenses pe
     LEFT JOIN employees e ON e.id = pe.logged_by
     LEFT JOIN accounting_vouchers v ON v.id = pe.voucher_id
     WHERE pe.project_id = $1
     ORDER BY pe.expense_date DESC, pe.id DESC`,
    [projectId]
  );

  return {
    ...res.rows[0],
    milestones: milestonesRes.rows,
    members: membersRes.rows,
    documents: docsRes.rows,
    expenses: expensesRes.rows,
  };
}

export async function createProject({ payload, actor, ipAddress = null }) {
  if (!payload.project_code || !payload.name) {
    throw new ValidationError('project_code and name are required');
  }

  const vertical = normalizeVertical(payload.vertical);
  const isDefence = vertical === 'DEFENCE' || Boolean(payload.is_defence_classified);
  const contractValue = Number(payload.contract_value || 0);
  const budgetLimit = Number(payload.budget_limit || contractValue || 0);

  return withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO projects (
         project_code, name, vertical, is_defence_classified, clearance_level,
         client_name, client_contact, project_manager_id, contract_value, budget_limit,
         spent_amount, progress_pct, status, start_date, target_end_date, description, created_by
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         0, 0, $11, $12, $13, $14, $15
       )
       RETURNING *`,
      [
        String(payload.project_code).trim(),
        String(payload.name).trim(),
        vertical,
        isDefence,
        isDefence ? payload.clearance_level || 'RESTRICTED' : 'STANDARD',
        payload.client_name || null,
        payload.client_contact || null,
        payload.project_manager_id ? Number(payload.project_manager_id) : null,
        contractValue,
        budgetLimit,
        payload.status || 'PLANNING',
        payload.start_date || null,
        payload.target_end_date || null,
        payload.description || null,
        actor.id,
      ]
    );

    const project = res.rows[0];

    if (project.project_manager_id) {
      await client.query(
        `INSERT INTO project_members (project_id, employee_id, role_in_project, allocation_pct)
         VALUES ($1, $2, 'Project Manager', 100)
         ON CONFLICT (project_id, employee_id) DO NOTHING`,
        [project.id, project.project_manager_id]
      );
    }

    await logAudit(client, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      moduleKey: 'projects',
      action: 'PROJECT_CREATED',
      entityType: 'project',
      entityId: project.id,
      details: {
        project_code: project.project_code,
        vertical: project.vertical,
        is_defence_classified: project.is_defence_classified,
      },
      ipAddress,
    });

    return project;
  });
}

export async function updateProject({ projectId, payload, actor, ipAddress = null }) {
  const existing = await query('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!existing.rows[0]) {
    throw new NotFoundError('Project not found');
  }
  const current = existing.rows[0];

  const nextVertical = payload.vertical ? normalizeVertical(payload.vertical) : current.vertical;
  const nextIsDefence =
    nextVertical === 'DEFENCE' ||
    (payload.is_defence_classified !== undefined
      ? Boolean(payload.is_defence_classified)
      : current.is_defence_classified);

  const nextProgress =
    payload.progress_pct !== undefined
      ? Math.max(0, Math.min(100, Number(payload.progress_pct)))
      : current.progress_pct;

  const updatedRes = await query(
    `UPDATE projects SET
       name = $1,
       vertical = $2,
       is_defence_classified = $3,
       clearance_level = $4,
       client_name = $5,
       client_contact = $6,
       project_manager_id = $7,
       contract_value = $8,
       budget_limit = $9,
       progress_pct = $10,
       status = $11,
       start_date = $12,
       target_end_date = $13,
       description = $14,
       updated_at = NOW()
     WHERE id = $15
     RETURNING *`,
    [
      payload.name ?? current.name,
      nextVertical,
      nextIsDefence,
      nextIsDefence ? payload.clearance_level || current.clearance_level : 'STANDARD',
      payload.client_name !== undefined ? payload.client_name : current.client_name,
      payload.client_contact !== undefined ? payload.client_contact : current.client_contact,
      payload.project_manager_id !== undefined
        ? payload.project_manager_id
        : current.project_manager_id,
      payload.contract_value !== undefined
        ? Number(payload.contract_value)
        : current.contract_value,
      payload.budget_limit !== undefined ? Number(payload.budget_limit) : current.budget_limit,
      nextProgress,
      payload.status || current.status,
      payload.start_date !== undefined ? payload.start_date : current.start_date,
      payload.target_end_date !== undefined ? payload.target_end_date : current.target_end_date,
      payload.description !== undefined ? payload.description : current.description,
      projectId,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'projects',
    action: 'PROJECT_UPDATED',
    entityType: 'project',
    entityId: projectId,
    details: { project_code: current.project_code, status: updatedRes.rows[0].status },
    ipAddress,
  });

  return updatedRes.rows[0];
}

export async function addProjectMilestone({ projectId, payload, actor, ipAddress = null }) {
  if (!payload.title) {
    throw new ValidationError('Milestone title is required');
  }

  const proj = await query('SELECT id, project_code FROM projects WHERE id = $1', [projectId]);
  if (!proj.rows[0]) {
    throw new NotFoundError('Project not found');
  }

  const res = await query(
    `INSERT INTO project_milestones (
       project_id, title, due_date, weight_pct, status, notes
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      projectId,
      String(payload.title).trim(),
      payload.due_date || null,
      Number(payload.weight_pct || 0),
      payload.status || 'PENDING',
      payload.notes || null,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'projects',
    action: 'MILESTONE_CREATED',
    entityType: 'project_milestone',
    entityId: res.rows[0].id,
    details: { project_id: projectId, title: payload.title },
    ipAddress,
  });

  return res.rows[0];
}

export async function updateProjectMilestone({ milestoneId, payload, actor, ipAddress = null }) {
  const existing = await query('SELECT * FROM project_milestones WHERE id = $1', [milestoneId]);
  if (!existing.rows[0]) {
    throw new NotFoundError('Milestone not found');
  }
  const current = existing.rows[0];
  const nextStatus = payload.status || current.status;
  const completedAt =
    nextStatus === 'COMPLETED' && !current.completed_at
      ? new Date().toISOString()
      : nextStatus !== 'COMPLETED'
        ? null
        : current.completed_at;

  const res = await query(
    `UPDATE project_milestones
     SET title = $1, due_date = $2, weight_pct = $3, status = $4, completed_at = $5, notes = $6
     WHERE id = $7
     RETURNING *`,
    [
      payload.title ?? current.title,
      payload.due_date !== undefined ? payload.due_date : current.due_date,
      payload.weight_pct !== undefined ? Number(payload.weight_pct) : current.weight_pct,
      nextStatus,
      completedAt,
      payload.notes !== undefined ? payload.notes : current.notes,
      milestoneId,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'projects',
    action: 'MILESTONE_UPDATED',
    entityType: 'project_milestone',
    entityId: milestoneId,
    details: { status: nextStatus },
    ipAddress,
  });

  return res.rows[0];
}

export async function assignProjectMember({ projectId, payload, actor, ipAddress = null }) {
  if (!payload.employee_id) {
    throw new ValidationError('employee_id is required');
  }

  const proj = await query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!proj.rows[0]) {
    throw new NotFoundError('Project not found');
  }

  const emp = await query('SELECT id FROM employees WHERE id = $1', [Number(payload.employee_id)]);
  if (!emp.rows[0]) {
    throw new NotFoundError('Employee not found');
  }

  const res = await query(
    `INSERT INTO project_members (project_id, employee_id, role_in_project, allocation_pct)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, employee_id)
     DO UPDATE SET role_in_project = EXCLUDED.role_in_project, allocation_pct = EXCLUDED.allocation_pct
     RETURNING *`,
    [
      projectId,
      Number(payload.employee_id),
      payload.role_in_project || 'Team Member',
      Number(payload.allocation_pct || 100),
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'projects',
    action: 'PROJECT_MEMBER_ASSIGNED',
    entityType: 'project_member',
    entityId: res.rows[0].id,
    details: { project_id: projectId, employee_id: payload.employee_id },
    ipAddress,
  });

  return res.rows[0];
}

export async function addProjectDocument({
  projectId,
  docCategory = 'General',
  docTitle,
  file,
  actor,
  ipAddress = null,
}) {
  if (!file) {
    throw new ValidationError('Document file is required');
  }
  if (!docTitle) {
    throw new ValidationError('doc_title is required');
  }

  const proj = await query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!proj.rows[0]) {
    throw new NotFoundError('Project not found');
  }

  const storedPath = path.relative(path.resolve(env.upload.dir), file.path).replaceAll('\\', '/');
  const res = await query(
    `INSERT INTO project_documents (
       project_id, doc_category, doc_title, file_name, file_path, mime_type, file_size_bytes, uploaded_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      projectId,
      docCategory.trim(),
      docTitle.trim(),
      file.originalname,
      storedPath,
      file.mimetype,
      file.size,
      actor.id,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'projects',
    action: 'PROJECT_DOCUMENT_UPLOADED',
    entityType: 'project_document',
    entityId: res.rows[0].id,
    details: { project_id: projectId, doc_title: docTitle, file_name: file.originalname },
    ipAddress,
  });

  return res.rows[0];
}

export async function logProjectExpense({ projectId, payload, actor, ipAddress = null }) {
  const amount = Number(payload.amount || 0);
  if (!amount || amount <= 0) {
    throw new ValidationError('Expense amount must be greater than 0');
  }

  return withTransaction(async (client) => {
    const projRes = await client.query('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [
      projectId,
    ]);
    const project = projRes.rows[0];
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const nextSpent = Number(project.spent_amount || 0) + amount;
    const budgetLimit = Number(project.budget_limit || 0);
    const exceedsBudget = budgetLimit > 0 && nextSpent > budgetLimit;

    const expRes = await client.query(
      `INSERT INTO project_expenses (
         project_id, expense_date, category, description, amount,
         voucher_id, logged_by, exceeds_budget
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        projectId,
        payload.expense_date || new Date().toISOString().slice(0, 10),
        payload.category || 'Operational',
        payload.description || null,
        amount,
        payload.voucher_id ? Number(payload.voucher_id) : null,
        actor.employee_id || null,
        exceedsBudget,
      ]
    );

    await client.query(
      `UPDATE projects SET spent_amount = $1, updated_at = NOW() WHERE id = $2`,
      [nextSpent, projectId]
    );

    if (exceedsBudget) {
      await createNotification(client, {
        userId: null,
        moduleKey: 'projects',
        title: `Budget Alert: ${project.project_code}`,
        message: `Project "${project.name}" spent amount (${nextSpent.toFixed(2)} BDT) exceeded budget limit (${budgetLimit.toFixed(2)} BDT).`,
      });
    }

    await logAudit(client, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      moduleKey: 'projects',
      action: 'PROJECT_EXPENSE_LOGGED',
      entityType: 'project_expense',
      entityId: expRes.rows[0].id,
      details: {
        project_id: projectId,
        amount,
        new_spent_amount: nextSpent,
        exceeds_budget: exceedsBudget,
      },
      ipAddress,
    });

    return {
      expense: expRes.rows[0],
      project_spent_amount: nextSpent,
      budget_limit: budgetLimit,
      exceeds_budget: exceedsBudget,
    };
  });
}
