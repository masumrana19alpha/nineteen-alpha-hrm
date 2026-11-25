import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';
import { logAudit } from '../../utils/audit.js';
import { UnauthorizedError, ValidationError } from '../../utils/errors.js';

export async function loginUser({ identifier, password, ipAddress = null }) {
  const cleanIdentifier = String(identifier || '').trim().toLowerCase();
  if (!cleanIdentifier || !password) {
    throw new ValidationError('Username/email and password are required');
  }

  const userRes = await query(
    `SELECT
       u.id,
       u.employee_id,
       u.username,
       u.email,
       u.password_hash,
       u.is_active,
       r.code AS role_code,
       r.name AS role_name,
       e.full_name,
       e.employee_code,
       e.designation,
       e.department
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN employees e ON e.id = u.employee_id
     WHERE LOWER(u.username) = $1 OR LOWER(u.email) = $1
     LIMIT 1`,
    [cleanIdentifier]
  );

  const user = userRes.rows[0];
  if (!user || !user.is_active) {
    throw new UnauthorizedError('Invalid credentials or inactive account');
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new UnauthorizedError('Invalid credentials or inactive account');
  }

  await query('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [
    user.id,
  ]);

  const uaclRes = await query(
    `SELECT
       module_key,
       can_view,
       can_create,
       can_edit,
       can_delete,
       can_approve,
       can_export
     FROM user_access_controls
     WHERE user_id = $1`,
    [user.id]
  );

  const uacl = {};
  for (const row of uaclRes.rows) {
    uacl[row.module_key] = row;
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role_code,
      username: user.username,
    },
    env.auth.jwtSecret,
    { expiresIn: env.auth.jwtExpiresIn }
  );

  await logAudit(query, {
    actorUserId: user.id,
    actorUsername: user.username,
    moduleKey: 'auth',
    action: 'LOGIN',
    entityType: 'user',
    entityId: user.id,
    details: { role: user.role_code },
    ipAddress,
  });

  return {
    token,
    expiresIn: env.auth.jwtExpiresIn,
    user: {
      id: user.id,
      employeeId: user.employee_id,
      employeeCode: user.employee_code,
      fullName: user.full_name || user.username,
      designation: user.designation || user.role_name,
      department: user.department || 'General',
      username: user.username,
      email: user.email,
      roleCode: user.role_code,
      roleName: user.role_name,
      uacl,
    },
  };
}

export async function getCurrentUserProfile(userId) {
  const userRes = await query(
    `SELECT
       u.id,
       u.employee_id,
       u.username,
       u.email,
       u.last_login_at,
       r.code AS role_code,
       r.name AS role_name,
       e.employee_code,
       e.full_name,
       e.designation,
       e.department,
       e.office_phone,
       e.personal_phone
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN employees e ON e.id = u.employee_id
     WHERE u.id = $1`,
    [userId]
  );

  const user = userRes.rows[0];
  if (!user) {
    throw new UnauthorizedError('User profile not found');
  }

  const uaclRes = await query(
    `SELECT
       module_key,
       can_view,
       can_create,
       can_edit,
       can_delete,
       can_approve,
       can_export
     FROM user_access_controls
     WHERE user_id = $1`,
    [userId]
  );

  const uacl = {};
  for (const row of uaclRes.rows) {
    uacl[row.module_key] = row;
  }

  return {
    ...user,
    uacl,
  };
}

export async function changeUserPassword({
  userId,
  username,
  currentPassword,
  newPassword,
  ipAddress = null,
}) {
  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    throw new ValidationError('New password must be at least 8 characters long');
  }

  const res = await query('SELECT id, password_hash FROM users WHERE id = $1', [userId]);
  const user = res.rows[0];
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  const newHash = await bcrypt.hash(newPassword, env.auth.bcryptRounds);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
    newHash,
    userId,
  ]);

  await logAudit(query, {
    actorUserId: userId,
    actorUsername: username,
    moduleKey: 'auth',
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: userId,
    ipAddress,
  });

  return { changed: true };
}
