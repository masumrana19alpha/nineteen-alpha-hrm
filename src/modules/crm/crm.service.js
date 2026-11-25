import { query } from '../../db/pool.js';
import { logAudit } from '../../utils/audit.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const ALLOWED_LEAD_STAGES = new Set([
  'NEW',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
]);

export async function listLeads({ stage = '', vertical = '', search = '' } = {}) {
  const conditions = [];
  const params = [];

  if (stage) {
    const st = String(stage).trim().toUpperCase();
    if (!ALLOWED_LEAD_STAGES.has(st)) {
      throw new ValidationError(`Invalid lead stage: ${stage}`);
    }
    params.push(st);
    conditions.push(`l.stage = $${params.length}`);
  }
  if (vertical) {
    params.push(String(vertical).trim().toUpperCase());
    conditions.push(`l.vertical = $${params.length}`);
  }
  if (search) {
    params.push(`%${String(search).trim()}%`);
    conditions.push(
      `(l.lead_code ILIKE $${params.length} OR l.company_name ILIKE $${params.length} OR l.contact_name ILIKE $${params.length})`
    );
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       l.*,
       e.full_name AS owner_name,
       e.employee_code AS owner_code,
       COALESCE(f.follow_up_count, 0)::int AS follow_up_count
     FROM crm_leads l
     LEFT JOIN employees e ON e.id = l.owner_employee_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS follow_up_count
       FROM crm_follow_ups
       WHERE lead_id = l.id
     ) f ON TRUE
     ${whereSql}
     ORDER BY l.updated_at DESC, l.id DESC`,
    params
  );

  return res.rows;
}

export async function getLeadById(leadId) {
  const leadRes = await query(
    `SELECT
       l.*,
       e.full_name AS owner_name,
       e.employee_code AS owner_code
     FROM crm_leads l
     LEFT JOIN employees e ON e.id = l.owner_employee_id
     WHERE l.id = $1`,
    [leadId]
  );

  if (!leadRes.rows[0]) {
    throw new NotFoundError('CRM lead not found');
  }

  const followUpsRes = await query(
    `SELECT
       fu.*,
       e.full_name AS created_by_name
     FROM crm_follow_ups fu
     LEFT JOIN employees e ON e.id = fu.created_by_employee_id
     WHERE fu.lead_id = $1
     ORDER BY fu.created_at DESC, fu.id DESC`,
    [leadId]
  );

  return {
    ...leadRes.rows[0],
    follow_ups: followUpsRes.rows,
  };
}

export async function createLead({ payload, actor, ipAddress = null }) {
  if (!payload.lead_code || !payload.company_name) {
    throw new ValidationError('lead_code and company_name are required');
  }

  const stage = String(payload.stage || 'NEW').toUpperCase();
  if (!ALLOWED_LEAD_STAGES.has(stage)) {
    throw new ValidationError(`Invalid lead stage: ${stage}`);
  }

  const res = await query(
    `INSERT INTO crm_leads (
       lead_code, company_name, contact_name, contact_email, contact_phone,
       vertical, source_channel, estimated_value, stage, probability_pct,
       owner_employee_id, expected_close_date, notes, created_by
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, $14
     )
     RETURNING *`,
    [
      String(payload.lead_code).trim(),
      String(payload.company_name).trim(),
      payload.contact_name || null,
      payload.contact_email || null,
      payload.contact_phone || null,
      String(payload.vertical || 'PRIVATE').toUpperCase(),
      payload.source_channel || 'Direct',
      Number(payload.estimated_value || 0),
      stage,
      Number(payload.probability_pct || 20),
      payload.owner_employee_id ? Number(payload.owner_employee_id) : actor.employee_id || null,
      payload.expected_close_date || null,
      payload.notes || null,
      actor.id,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'crm',
    action: 'CRM_LEAD_CREATED',
    entityType: 'crm_lead',
    entityId: res.rows[0].id,
    details: { lead_code: res.rows[0].lead_code, company_name: res.rows[0].company_name },
    ipAddress,
  });

  return res.rows[0];
}

export async function updateLead({ leadId, payload, actor, ipAddress = null }) {
  const existingRes = await query('SELECT * FROM crm_leads WHERE id = $1', [leadId]);
  const current = existingRes.rows[0];
  if (!current) {
    throw new NotFoundError('CRM lead not found');
  }

  const nextStage = payload.stage ? String(payload.stage).toUpperCase() : current.stage;
  if (!ALLOWED_LEAD_STAGES.has(nextStage)) {
    throw new ValidationError(`Invalid lead stage: ${nextStage}`);
  }

  const res = await query(
    `UPDATE crm_leads SET
       company_name = $1,
       contact_name = $2,
       contact_email = $3,
       contact_phone = $4,
       vertical = $5,
       source_channel = $6,
       estimated_value = $7,
       stage = $8,
       probability_pct = $9,
       owner_employee_id = $10,
       expected_close_date = $11,
       notes = $12,
       updated_at = NOW()
     WHERE id = $13
     RETURNING *`,
    [
      payload.company_name ?? current.company_name,
      payload.contact_name !== undefined ? payload.contact_name : current.contact_name,
      payload.contact_email !== undefined ? payload.contact_email : current.contact_email,
      payload.contact_phone !== undefined ? payload.contact_phone : current.contact_phone,
      payload.vertical ? String(payload.vertical).toUpperCase() : current.vertical,
      payload.source_channel !== undefined ? payload.source_channel : current.source_channel,
      payload.estimated_value !== undefined
        ? Number(payload.estimated_value)
        : current.estimated_value,
      nextStage,
      payload.probability_pct !== undefined
        ? Number(payload.probability_pct)
        : current.probability_pct,
      payload.owner_employee_id !== undefined
        ? payload.owner_employee_id
        : current.owner_employee_id,
      payload.expected_close_date !== undefined
        ? payload.expected_close_date
        : current.expected_close_date,
      payload.notes !== undefined ? payload.notes : current.notes,
      leadId,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'crm',
    action: 'CRM_LEAD_UPDATED',
    entityType: 'crm_lead',
    entityId: leadId,
    details: { stage: nextStage, estimated_value: res.rows[0].estimated_value },
    ipAddress,
  });

  return res.rows[0];
}

export async function addLeadFollowUp({ leadId, payload, actor, ipAddress = null }) {
  if (!payload.summary) {
    throw new ValidationError('Follow-up summary is required');
  }

  const leadRes = await query('SELECT id, lead_code FROM crm_leads WHERE id = $1', [leadId]);
  if (!leadRes.rows[0]) {
    throw new NotFoundError('CRM lead not found');
  }

  const res = await query(
    `INSERT INTO crm_follow_ups (
       lead_id, interaction_type, summary, next_action_date, created_by_employee_id
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      leadId,
      String(payload.interaction_type || 'MEETING').toUpperCase(),
      String(payload.summary).trim(),
      payload.next_action_date || null,
      actor.employee_id || null,
    ]
  );

  await query('UPDATE crm_leads SET updated_at = NOW() WHERE id = $1', [leadId]);

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'crm',
    action: 'CRM_FOLLOWUP_ADDED',
    entityType: 'crm_follow_up',
    entityId: res.rows[0].id,
    details: { lead_id: leadId, interaction_type: res.rows[0].interaction_type },
    ipAddress,
  });

  return res.rows[0];
}
