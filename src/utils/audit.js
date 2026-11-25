import { query } from '../db/pool.js';

export async function logAudit(
  dbOrQuery,
  {
    actorUserId = null,
    actorUsername = null,
    moduleKey,
    action,
    entityType,
    entityId = null,
    details = {},
    ipAddress = null,
  }
) {
  const exec = typeof dbOrQuery?.query === 'function' ? dbOrQuery.query.bind(dbOrQuery) : query;

  await exec(
    `INSERT INTO audit_logs (
       actor_user_id,
       actor_username,
       module_key,
       action,
       entity_type,
       entity_id,
       details,
       ip_address
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      actorUserId,
      actorUsername,
      moduleKey,
      action,
      entityType,
      entityId ? String(entityId) : null,
      JSON.stringify(details || {}),
      ipAddress,
    ]
  );
}

export async function createNotification(
  dbOrQuery,
  { userId = null, moduleKey, title, message }
) {
  const exec = typeof dbOrQuery?.query === 'function' ? dbOrQuery.query.bind(dbOrQuery) : query;

  const result = await exec(
    `INSERT INTO notifications (user_id, module_key, title, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, moduleKey, title, message]
  );
  return result.rows[0];
}
