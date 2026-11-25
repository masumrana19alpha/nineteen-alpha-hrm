import { query } from '../../db/pool.js';
import { createNotification, logAudit } from '../../utils/audit.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const ALLOWED_STATUSES = new Set(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']);
const ALLOWED_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export async function listTasks({
  projectId = '',
  assigneeId = '',
  status = '',
  priority = '',
  search = '',
} = {}) {
  const conditions = [];
  const params = [];

  if (projectId) {
    params.push(Number(projectId));
    conditions.push(`t.project_id = $${params.length}`);
  }
  if (assigneeId) {
    params.push(Number(assigneeId));
    conditions.push(`t.assignee_id = $${params.length}`);
  }
  if (status) {
    const s = String(status).trim().toUpperCase();
    if (!ALLOWED_STATUSES.has(s)) {
      throw new ValidationError(`Invalid task status: ${status}`);
    }
    params.push(s);
    conditions.push(`t.status = $${params.length}`);
  }
  if (priority) {
    const p = String(priority).trim().toUpperCase();
    if (!ALLOWED_PRIORITIES.has(p)) {
      throw new ValidationError(`Invalid task priority: ${priority}`);
    }
    params.push(p);
    conditions.push(`t.priority = $${params.length}`);
  }
  if (search) {
    params.push(`%${String(search).trim()}%`);
    conditions.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       t.*,
       p.project_code,
       p.name AS project_name,
       p.vertical AS project_vertical,
       e_ass.full_name AS assignee_name,
       e_ass.employee_code AS assignee_code,
       e_rep.full_name AS reporter_name
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN employees e_ass ON e_ass.id = t.assignee_id
     LEFT JOIN employees e_rep ON e_rep.id = t.reporter_id
     ${whereSql}
     ORDER BY
       CASE t.priority
         WHEN 'URGENT' THEN 1
         WHEN 'HIGH' THEN 2
         WHEN 'MEDIUM' THEN 3
         ELSE 4
       END,
       t.due_date ASC NULLS LAST,
       t.id DESC`,
    params
  );

  return res.rows;
}

export async function createTask({ payload, actor, ipAddress = null }) {
  if (!payload.title) {
    throw new ValidationError('Task title is required');
  }

  const status = String(payload.status || 'TODO').toUpperCase();
  if (!ALLOWED_STATUSES.has(status)) {
    throw new ValidationError(`Invalid task status: ${status}`);
  }

  const priority = String(payload.priority || 'MEDIUM').toUpperCase();
  if (!ALLOWED_PRIORITIES.has(priority)) {
    throw new ValidationError(`Invalid task priority: ${priority}`);
  }

  const assigneeId = payload.assignee_id ? Number(payload.assignee_id) : null;
  const reporterId = payload.reporter_id ? Number(payload.reporter_id) : actor.employee_id || null;
  const projectId = payload.project_id ? Number(payload.project_id) : null;

  const res = await query(
    `INSERT INTO tasks (
       project_id, title, description, assignee_id, reporter_id,
       priority, status, due_date, estimated_hours, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      projectId,
      String(payload.title).trim(),
      payload.description || null,
      assigneeId,
      reporterId,
      priority,
      status,
      payload.due_date || null,
      Number(payload.estimated_hours || 0),
      actor.id,
    ]
  );

  const task = res.rows[0];

  if (assigneeId) {
    const empUserRes = await query('SELECT id FROM users WHERE employee_id = $1 AND is_active = TRUE', [
      assigneeId,
    ]);
    const targetUserId = empUserRes.rows[0]?.id || null;
    await createNotification(query, {
      userId: targetUserId,
      moduleKey: 'tasks',
      title: `New Task Assigned: ${task.title}`,
      message: `Priority: ${task.priority} | Due: ${task.due_date || 'Not set'}`,
    });
  }

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'tasks',
    action: 'TASK_CREATED',
    entityType: 'task',
    entityId: task.id,
    details: { title: task.title, project_id: task.project_id, assignee_id: task.assignee_id },
    ipAddress,
  });

  return task;
}

export async function updateTask({ taskId, payload, actor, ipAddress = null }) {
  const existingRes = await query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  const current = existingRes.rows[0];
  if (!current) {
    throw new NotFoundError('Task not found');
  }

  const nextStatus = payload.status ? String(payload.status).toUpperCase() : current.status;
  if (!ALLOWED_STATUSES.has(nextStatus)) {
    throw new ValidationError(`Invalid task status: ${nextStatus}`);
  }

  const nextPriority = payload.priority ? String(payload.priority).toUpperCase() : current.priority;
  if (!ALLOWED_PRIORITIES.has(nextPriority)) {
    throw new ValidationError(`Invalid task priority: ${nextPriority}`);
  }

  const completedAt =
    nextStatus === 'DONE' && !current.completed_at
      ? new Date().toISOString()
      : nextStatus !== 'DONE'
        ? null
        : current.completed_at;

  const res = await query(
    `UPDATE tasks SET
       project_id = $1,
       title = $2,
       description = $3,
       assignee_id = $4,
       priority = $5,
       status = $6,
       due_date = $7,
       estimated_hours = $8,
       actual_hours = $9,
       completed_at = $10,
       updated_at = NOW()
     WHERE id = $11
     RETURNING *`,
    [
      payload.project_id !== undefined ? payload.project_id : current.project_id,
      payload.title ?? current.title,
      payload.description !== undefined ? payload.description : current.description,
      payload.assignee_id !== undefined ? payload.assignee_id : current.assignee_id,
      nextPriority,
      nextStatus,
      payload.due_date !== undefined ? payload.due_date : current.due_date,
      payload.estimated_hours !== undefined
        ? Number(payload.estimated_hours)
        : current.estimated_hours,
      payload.actual_hours !== undefined ? Number(payload.actual_hours) : current.actual_hours,
      completedAt,
      taskId,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'tasks',
    action: 'TASK_UPDATED',
    entityType: 'task',
    entityId: taskId,
    details: { status: nextStatus, priority: nextPriority },
    ipAddress,
  });

  return res.rows[0];
}

export async function deleteTask({ taskId, actor, ipAddress = null }) {
  const existing = await query('SELECT id, title FROM tasks WHERE id = $1', [taskId]);
  if (!existing.rows[0]) {
    throw new NotFoundError('Task not found');
  }

  await query('DELETE FROM tasks WHERE id = $1', [taskId]);

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'tasks',
    action: 'TASK_DELETED',
    entityType: 'task',
    entityId: taskId,
    details: { title: existing.rows[0].title },
    ipAddress,
  });

  return { deleted: true, id: taskId };
}
