import { query } from '../../db/pool.js';
import { logAudit } from '../../utils/audit.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const ALLOWED_STAGES = new Set([
  'CONCEPT',
  'PROTOTYPE',
  'TESTING',
  'VALIDATION',
  'COMMERCIALIZED',
  'ARCHIVED',
]);

export async function listRndInitiatives({ stage = '', search = '' } = {}) {
  const conditions = [];
  const params = [];

  if (stage) {
    const st = String(stage).trim().toUpperCase();
    if (!ALLOWED_STAGES.has(st)) {
      throw new ValidationError(`Invalid R&D stage: ${stage}`);
    }
    params.push(st);
    conditions.push(`r.stage = $${params.length}`);
  }
  if (search) {
    params.push(`%${String(search).trim()}%`);
    conditions.push(
      `(r.code ILIKE $${params.length} OR r.title ILIKE $${params.length} OR r.target_domain ILIKE $${params.length})`
    );
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       r.*,
       e.full_name AS lead_researcher_name,
       e.employee_code AS lead_researcher_code,
       p.project_code AS linked_project_code,
       p.name AS linked_project_name
     FROM rnd_initiatives r
     LEFT JOIN employees e ON e.id = r.lead_researcher_id
     LEFT JOIN projects p ON p.id = r.linked_project_id
     ${whereSql}
     ORDER BY r.updated_at DESC, r.id DESC`,
    params
  );

  return res.rows;
}

export async function createRndInitiative({ payload, actor, ipAddress = null }) {
  if (!payload.code || !payload.title) {
    throw new ValidationError('code and title are required');
  }

  const stage = String(payload.stage || 'CONCEPT').toUpperCase();
  if (!ALLOWED_STAGES.has(stage)) {
    throw new ValidationError(`Invalid R&D stage: ${stage}`);
  }

  const res = await query(
    `INSERT INTO rnd_initiatives (
       code, title, target_domain, stage, lead_researcher_id,
       linked_project_id, budget_allocated, summary, findings, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      String(payload.code).trim().toUpperCase(),
      String(payload.title).trim(),
      payload.target_domain || 'Defence & Enterprise AI',
      stage,
      payload.lead_researcher_id ? Number(payload.lead_researcher_id) : actor.employee_id || null,
      payload.linked_project_id ? Number(payload.linked_project_id) : null,
      Number(payload.budget_allocated || 0),
      payload.summary || null,
      payload.findings || null,
      actor.id,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'rnd',
    action: 'RND_INITIATIVE_CREATED',
    entityType: 'rnd_initiative',
    entityId: res.rows[0].id,
    details: { code: res.rows[0].code, title: res.rows[0].title, stage },
    ipAddress,
  });

  return res.rows[0];
}

export async function updateRndInitiative({ initiativeId, payload, actor, ipAddress = null }) {
  const existingRes = await query('SELECT * FROM rnd_initiatives WHERE id = $1', [initiativeId]);
  const current = existingRes.rows[0];
  if (!current) {
    throw new NotFoundError('R&D initiative not found');
  }

  const nextStage = payload.stage ? String(payload.stage).toUpperCase() : current.stage;
  if (!ALLOWED_STAGES.has(nextStage)) {
    throw new ValidationError(`Invalid R&D stage: ${nextStage}`);
  }

  const res = await query(
    `UPDATE rnd_initiatives SET
       title = $1,
       target_domain = $2,
       stage = $3,
       lead_researcher_id = $4,
       linked_project_id = $5,
       budget_allocated = $6,
       summary = $7,
       findings = $8,
       updated_at = NOW()
     WHERE id = $9
     RETURNING *`,
    [
      payload.title ?? current.title,
      payload.target_domain !== undefined ? payload.target_domain : current.target_domain,
      nextStage,
      payload.lead_researcher_id !== undefined
        ? payload.lead_researcher_id
        : current.lead_researcher_id,
      payload.linked_project_id !== undefined
        ? payload.linked_project_id
        : current.linked_project_id,
      payload.budget_allocated !== undefined
        ? Number(payload.budget_allocated)
        : current.budget_allocated,
      payload.summary !== undefined ? payload.summary : current.summary,
      payload.findings !== undefined ? payload.findings : current.findings,
      initiativeId,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'rnd',
    action: 'RND_INITIATIVE_UPDATED',
    entityType: 'rnd_initiative',
    entityId: initiativeId,
    details: { code: current.code, stage: nextStage },
    ipAddress,
  });

  return res.rows[0];
}
