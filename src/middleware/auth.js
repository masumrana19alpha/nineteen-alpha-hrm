import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

const ACTION_COLUMN_MAP = {
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  delete: 'can_delete',
  approve: 'can_approve',
  export: 'can_export',
};

export async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : req.cookies?.bms_token || null;

    if (!token) {
      return next(new UnauthorizedError('Authentication token is missing'));
    }

    const decoded = jwt.verify(token, env.auth.jwtSecret);

    const userRes = await query(
      `SELECT
         u.id,
         u.employee_id,
         u.username,
         u.email,
         u.is_active,
         r.code AS role_code,
         r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [decoded.sub]
    );

    const user = userRes.rows[0];
    if (!user || !user.is_active) {
      return next(new UnauthorizedError('User account is inactive or does not exist'));
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
      [user.id]
    );

    const uaclMap = {};
    for (const row of uaclRes.rows) {
      uaclMap[row.module_key] = row;
    }

    req.user = {
      ...user,
      uacl: uaclMap,
    };

    return next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Invalid or expired session token'));
    }
    return next(err);
  }
}

export function requireRole(...allowedRoles) {
  const normalized = allowedRoles.map((r) => String(r).toUpperCase());
  return (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (req.user.role_code === 'SUPER_ADMIN' || normalized.includes(req.user.role_code)) {
      return next();
    }
    return next(new ForbiddenError('Insufficient role privileges'));
  };
}

export function requirePermission(moduleKey, action = 'view') {
  const column = ACTION_COLUMN_MAP[action] || 'can_view';
  return (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (req.user.role_code === 'SUPER_ADMIN') {
      return next();
    }
    const perm = req.user.uacl?.[moduleKey];
    if (perm && perm[column] === true) {
      return next();
    }
    return next(
      new ForbiddenError(`Missing ${action.toUpperCase()} permission for module "${moduleKey}"`)
    );
  };
}
