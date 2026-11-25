import { asyncHandler } from '../../utils/errors.js';
import {
  addProjectDocument,
  addProjectMilestone,
  assignProjectMember,
  createProject,
  getProjectById,
  listProjects,
  logProjectExpense,
  updateProject,
  updateProjectMilestone,
} from './projects.service.js';

export const getProjects = asyncHandler(async (req, res) => {
  const { vertical, status, search } = req.query;
  const rows = await listProjects({
    vertical,
    status,
    search,
    actor: req.user,
  });
  res.json({ success: true, data: rows });
});

export const getProject = asyncHandler(async (req, res) => {
  const project = await getProjectById(Number(req.params.id));
  res.json({ success: true, data: project });
});

export const postProject = asyncHandler(async (req, res) => {
  const created = await createProject({
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const patchProject = asyncHandler(async (req, res) => {
  const updated = await updateProject({
    projectId: Number(req.params.id),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: updated });
});

export const postMilestone = asyncHandler(async (req, res) => {
  const created = await addProjectMilestone({
    projectId: Number(req.params.id),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: created });
});

export const patchMilestone = asyncHandler(async (req, res) => {
  const updated = await updateProjectMilestone({
    milestoneId: Number(req.params.milestoneId),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: updated });
});

export const postMember = asyncHandler(async (req, res) => {
  const assigned = await assignProjectMember({
    projectId: Number(req.params.id),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: assigned });
});

export const postProjectDocument = asyncHandler(async (req, res) => {
  const doc = await addProjectDocument({
    projectId: Number(req.params.id),
    docCategory: req.body?.doc_category,
    docTitle: req.body?.doc_title,
    file: req.file,
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: doc });
});

export const postProjectExpense = asyncHandler(async (req, res) => {
  const result = await logProjectExpense({
    projectId: Number(req.params.id),
    payload: req.body || {},
    actor: req.user,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: result });
});
