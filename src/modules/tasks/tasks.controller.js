import { asyncHandler } from '../../utils/errors.js';
import { createTask, deleteTask, listTasks, updateTask } from './tasks.service.js';

export const getTasks = asyncHandler(async (req, res) => {
  const { project_id, assignee_id, status, priority, search } = req.query;
  const rows = await listTasks({
    projectId: project_id,
    assigneeId: assignee_id,
    status,
    priority,
    search,
  });
  res.json({ success: true, data: rows });
});

export const postTask = asyncHandler(async (req, res) => {
  const created = await createTask({
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const patchTask = asyncHandler(async (req, res) => {
  const updated = await updateTask({
    taskId: Number(req.params.id),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: updated });
});

export const removeTask = asyncHandler(async (req, res) => {
  const result = await deleteTask({
    taskId: Number(req.params.id),
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: result });
});
