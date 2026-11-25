import path from 'node:path';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { query, withTransaction } from '../../db/pool.js';
import { logAudit } from '../../utils/audit.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { buildAttendanceReportPdf, buildPayslipPdf } from '../../utils/pdfGenerator.js';

function dhakaDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function dhakaTimeString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

export async function listEmployees({ search = '', department = '', status = '' } = {}) {
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(
      `(e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR e.designation ILIKE $${params.length} OR e.email ILIKE $${params.length})`
    );
  }
  if (department) {
    params.push(department.trim());
    conditions.push(`e.department = $${params.length}`);
  }
  if (status) {
    params.push(status.trim());
    conditions.push(`e.status = $${params.length}`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       e.*,
       u.id AS user_id,
       u.username,
       u.is_active AS login_active,
       r.code AS role_code,
       r.name AS role_name
     FROM employees e
     LEFT JOIN users u ON u.employee_id = e.id
     LEFT JOIN roles r ON r.id = u.role_id
     ${whereSql}
     ORDER BY e.created_at DESC, e.id DESC`,
    params
  );

  return res.rows;
}

export async function getEmployeeById(employeeId) {
  const res = await query(
    `SELECT
       e.*,
       u.id AS user_id,
       u.username,
       u.is_active AS login_active,
       r.code AS role_code,
       r.name AS role_name
     FROM employees e
     LEFT JOIN users u ON u.employee_id = e.id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE e.id = $1`,
    [employeeId]
  );

  if (!res.rows[0]) {
    throw new NotFoundError('Employee record not found');
  }

  const docsRes = await query(
    `SELECT
       d.*,
       u.username AS uploaded_by_username
     FROM employee_documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.employee_id = $1
     ORDER BY d.uploaded_at DESC`,
    [employeeId]
  );

  return {
    ...res.rows[0],
    documents: docsRes.rows,
  };
}

export async function createEmployee({
  payload,
  actor,
  ipAddress = null,
}) {
  if (!payload.employee_code || !payload.full_name || !payload.designation || !payload.department || !payload.date_of_joining) {
    throw new ValidationError(
      'employee_code, full_name, designation, department, and date_of_joining are required'
    );
  }

  return withTransaction(async (client) => {
    const empRes = await client.query(
      `INSERT INTO employees (
         employee_code, full_name, designation, department, date_of_joining,
         nid, present_address, permanent_address, office_phone, emergency_phone,
         personal_phone, email, bank_name, bank_account, basic_salary,
         mobile_allowance, conveyance_allowance, other_allowance, status, created_by
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20
       )
       RETURNING *`,
      [
        payload.employee_code.trim(),
        payload.full_name.trim(),
        payload.designation.trim(),
        payload.department.trim(),
        payload.date_of_joining,
        payload.nid || null,
        payload.present_address || null,
        payload.permanent_address || null,
        payload.office_phone || null,
        payload.emergency_phone || null,
        payload.personal_phone || null,
        payload.email || null,
        payload.bank_name || null,
        payload.bank_account || null,
        Number(payload.basic_salary || 0),
        Number(payload.mobile_allowance || 1000),
        Number(payload.conveyance_allowance || 2500),
        Number(payload.other_allowance || 0),
        payload.status || 'Active',
        actor.id,
      ]
    );

    const employee = empRes.rows[0];
    let createdUser = null;

    if (payload.create_login && payload.username && payload.password) {
      if (String(payload.password).length < 8) {
        throw new ValidationError('Login password must be at least 8 characters long');
      }

      const roleCode = String(payload.role_code || 'STAFF').toUpperCase();
      const roleRes = await client.query('SELECT id FROM roles WHERE code = $1', [roleCode]);
      if (!roleRes.rows[0]) {
        throw new ValidationError(`Invalid role_code: ${roleCode}`);
      }

      const passwordHash = await bcrypt.hash(payload.password, env.auth.bcryptRounds);
      const userRes = await client.query(
        `INSERT INTO users (employee_id, username, email, password_hash, role_id, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, username, email, role_id, is_active`,
        [
          employee.id,
          payload.username.trim().toLowerCase(),
          (payload.email || `${payload.username.trim().toLowerCase()}@nineteenalpha.local`).toLowerCase(),
          passwordHash,
          roleRes.rows[0].id,
        ]
      );
      createdUser = userRes.rows[0];

      const modules = ['hr', 'projects', 'tasks', 'crm', 'inventory', 'finance', 'rnd'];
      for (const modKey of modules) {
        const canView = modKey === 'hr' || modKey === 'tasks';
        await client.query(
          `INSERT INTO user_access_controls (
             user_id, module_key, can_view, can_create, can_edit, can_delete, can_approve, can_export
           ) VALUES ($1, $2, $3, FALSE, FALSE, FALSE, FALSE, FALSE)
           ON CONFLICT (user_id, module_key) DO NOTHING`,
          [createdUser.id, modKey, canView]
        );
      }
    }

    await logAudit(client, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      moduleKey: 'hr',
      action: 'EMPLOYEE_CREATED',
      entityType: 'employee',
      entityId: employee.id,
      details: {
        employee_code: employee.employee_code,
        full_name: employee.full_name,
        has_login: Boolean(createdUser),
      },
      ipAddress,
    });

    return {
      ...employee,
      user: createdUser,
    };
  });
}

export async function updateEmployee({ employeeId, payload, actor, ipAddress = null }) {
  const existing = await query('SELECT * FROM employees WHERE id = $1', [employeeId]);
  if (!existing.rows[0]) {
    throw new NotFoundError('Employee not found');
  }
  const current = existing.rows[0];

  const updatedRes = await query(
    `UPDATE employees SET
       full_name = $1,
       designation = $2,
       department = $3,
       nid = $4,
       present_address = $5,
       permanent_address = $6,
       office_phone = $7,
       emergency_phone = $8,
       personal_phone = $9,
       email = $10,
       bank_name = $11,
       bank_account = $12,
       basic_salary = $13,
       mobile_allowance = $14,
       conveyance_allowance = $15,
       other_allowance = $16,
       status = $17,
       updated_at = NOW()
     WHERE id = $18
     RETURNING *`,
    [
      payload.full_name ?? current.full_name,
      payload.designation ?? current.designation,
      payload.department ?? current.department,
      payload.nid !== undefined ? payload.nid : current.nid,
      payload.present_address !== undefined ? payload.present_address : current.present_address,
      payload.permanent_address !== undefined ? payload.permanent_address : current.permanent_address,
      payload.office_phone !== undefined ? payload.office_phone : current.office_phone,
      payload.emergency_phone !== undefined ? payload.emergency_phone : current.emergency_phone,
      payload.personal_phone !== undefined ? payload.personal_phone : current.personal_phone,
      payload.email !== undefined ? payload.email : current.email,
      payload.bank_name !== undefined ? payload.bank_name : current.bank_name,
      payload.bank_account !== undefined ? payload.bank_account : current.bank_account,
      payload.basic_salary !== undefined ? Number(payload.basic_salary) : current.basic_salary,
      payload.mobile_allowance !== undefined ? Number(payload.mobile_allowance) : current.mobile_allowance,
      payload.conveyance_allowance !== undefined
        ? Number(payload.conveyance_allowance)
        : current.conveyance_allowance,
      payload.other_allowance !== undefined ? Number(payload.other_allowance) : current.other_allowance,
      payload.status || current.status,
      employeeId,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'hr',
    action: 'EMPLOYEE_UPDATED',
    entityType: 'employee',
    entityId: employeeId,
    details: { employee_code: current.employee_code },
    ipAddress,
  });

  return updatedRes.rows[0];
}

export async function addEmployeeDocument({
  employeeId,
  docType,
  docTitle,
  file,
  actor,
  ipAddress = null,
}) {
  if (!file) {
    throw new ValidationError('Document file is required');
  }
  if (!docType || !docTitle) {
    throw new ValidationError('doc_type and doc_title are required');
  }

  const empCheck = await query('SELECT id, employee_code FROM employees WHERE id = $1', [employeeId]);
  if (!empCheck.rows[0]) {
    throw new NotFoundError('Employee not found');
  }

  const storedPath = path.relative(path.resolve(env.upload.dir), file.path).replaceAll('\\', '/');
  const docRes = await query(
    `INSERT INTO employee_documents (
       employee_id, doc_type, doc_title, file_name, file_path, mime_type, file_size_bytes, uploaded_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      employeeId,
      docType.trim(),
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
    moduleKey: 'hr',
    action: 'EMPLOYEE_DOCUMENT_UPLOADED',
    entityType: 'employee_document',
    entityId: docRes.rows[0].id,
    details: {
      employee_id: employeeId,
      doc_type: docType,
      file_name: file.originalname,
    },
    ipAddress,
  });

  return docRes.rows[0];
}

export async function getBiometricSetting() {
  const res = await query(
    `SELECT setting_value, updated_at
     FROM module_settings
     WHERE module_key = 'hr' AND setting_key = 'biometric_device'`
  );
  return (
    res.rows[0]?.setting_value || {
      enabled: false,
      device_mode: 'API_WEBHOOK',
      note: 'Biometric attendance toggle',
    }
  );
}

export async function toggleBiometricSetting({ enabled, deviceMode, actor, ipAddress = null }) {
  const current = await getBiometricSetting();
  const nextVal = {
    ...current,
    enabled: Boolean(enabled),
    device_mode: deviceMode || current.device_mode || 'API_WEBHOOK',
  };

  await query(
    `INSERT INTO module_settings (module_key, setting_key, setting_value, updated_by, updated_at)
     VALUES ('hr', 'biometric_device', $1::jsonb, $2, NOW())
     ON CONFLICT (module_key, setting_key)
     DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [JSON.stringify(nextVal), actor.id]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'hr',
    action: 'BIOMETRIC_TOGGLE_UPDATED',
    entityType: 'module_setting',
    entityId: 'hr.biometric_device',
    details: nextVal,
    ipAddress,
  });

  return nextVal;
}

export async function logAttendance({
  employeeId,
  action = 'CHECK_IN',
  source = 'MANUAL',
  deviceRef = null,
  remarks = null,
  logDate = null,
  logTime = null,
  actor = null,
  ipAddress = null,
}) {
  if (!employeeId) {
    throw new ValidationError('employee_id is required');
  }

  const empRes = await query('SELECT id, employee_code, full_name FROM employees WHERE id = $1', [
    employeeId,
  ]);
  if (!empRes.rows[0]) {
    throw new NotFoundError('Employee not found');
  }

  const normalizedAction = String(action).toUpperCase();
  if (!['CHECK_IN', 'CHECK_OUT'].includes(normalizedAction)) {
    throw new ValidationError('action must be CHECK_IN or CHECK_OUT');
  }

  const normalizedSource = String(source).toUpperCase();
  if (normalizedSource === 'BIOMETRIC') {
    const bioCfg = await getBiometricSetting();
    if (!bioCfg.enabled) {
      throw new ValidationError(
        'Biometric attendance device integration is currently turned OFF by administrator'
      );
    }
  }

  const finalDate = logDate || dhakaDateString();
  const finalTime = logTime || dhakaTimeString();

  const res = await query(
    `INSERT INTO attendance_logs (
       employee_id, log_date, log_time, action, source, device_ref, remarks, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      employeeId,
      finalDate,
      finalTime,
      normalizedAction,
      normalizedSource,
      deviceRef,
      remarks,
      actor?.id || null,
    ]
  );

  await logAudit(query, {
    actorUserId: actor?.id || null,
    actorUsername: actor?.username || `device:${deviceRef || 'biometric'}`,
    moduleKey: 'hr',
    action: 'ATTENDANCE_LOGGED',
    entityType: 'attendance_log',
    entityId: res.rows[0].id,
    details: {
      employee_id: employeeId,
      employee_code: empRes.rows[0].employee_code,
      action: normalizedAction,
      source: normalizedSource,
      log_date: finalDate,
    },
    ipAddress,
  });

  return {
    ...res.rows[0],
    employee_code: empRes.rows[0].employee_code,
    full_name: empRes.rows[0].full_name,
  };
}

export async function listAttendanceLogs({ employeeId = '', startDate = '', endDate = '' } = {}) {
  const conditions = [];
  const params = [];

  if (employeeId) {
    params.push(Number(employeeId));
    conditions.push(`a.employee_id = $${params.length}`);
  }
  if (startDate) {
    params.push(startDate);
    conditions.push(`a.log_date >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`a.log_date <= $${params.length}`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       a.*,
       e.employee_code,
       e.full_name,
       e.department
     FROM attendance_logs a
     JOIN employees e ON e.id = a.employee_id
     ${whereSql}
     ORDER BY a.log_date DESC, a.log_time DESC, a.id DESC`,
    params
  );
  return res.rows;
}

export async function generateAttendancePdf({ employeeId = '', startDate = '', endDate = '' } = {}) {
  const logs = await listAttendanceLogs({ employeeId, startDate, endDate });
  let employeeLabel = 'All Employees';
  if (employeeId) {
    const emp = await query('SELECT employee_code, full_name FROM employees WHERE id = $1', [
      Number(employeeId),
    ]);
    if (emp.rows[0]) {
      employeeLabel = `${emp.rows[0].employee_code} - ${emp.rows[0].full_name}`;
    }
  }
  return buildAttendanceReportPdf({ employeeLabel, startDate, endDate }, logs);
}

export async function listHolidays() {
  const res = await query('SELECT * FROM holidays ORDER BY holiday_date ASC');
  return res.rows;
}

export async function createHoliday({ holidayDate, title, holidayType = 'Company Holiday', actor, ipAddress = null }) {
  if (!holidayDate || !title) {
    throw new ValidationError('holiday_date and title are required');
  }

  const res = await query(
    `INSERT INTO holidays (holiday_date, title, holiday_type, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [holidayDate, title.trim(), holidayType.trim(), actor.id]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'hr',
    action: 'HOLIDAY_CREATED',
    entityType: 'holiday',
    entityId: res.rows[0].id,
    details: { holiday_date: holidayDate, title },
    ipAddress,
  });

  return res.rows[0];
}

export async function generateMonthlyPayroll({ payMonth, actor, ipAddress = null }) {
  if (!/^\d{4}-\d{2}$/.test(String(payMonth || ''))) {
    throw new ValidationError('pay_month must be in YYYY-MM format (e.g., 2026-11)');
  }

  const cfgRes = await query(
    `SELECT * FROM salary_configurations WHERE is_active = TRUE ORDER BY id DESC LIMIT 1`
  );
  const cfg = cfgRes.rows[0] || {
    house_rent_pct: 50,
    medical_pct: 15,
    default_mobile_allowance: 1000,
    default_conveyance: 2500,
  };

  return withTransaction(async (client) => {
    const empRes = await client.query(`SELECT * FROM employees WHERE status = 'Active' ORDER BY id ASC`);
    const generated = [];

    for (const emp of empRes.rows) {
      const attRes = await client.query(
        `SELECT COUNT(DISTINCT log_date)::int AS present_days
         FROM attendance_logs
         WHERE employee_id = $1
           AND TO_CHAR(log_date, 'YYYY-MM') = $2`,
        [emp.id, payMonth]
      );
      const presentDays = attRes.rows[0]?.present_days ?? 0;

      const basic = Number(emp.basic_salary || 0);
      const houseRent = Number(((basic * Number(cfg.house_rent_pct)) / 100).toFixed(2));
      const medical = Number(((basic * Number(cfg.medical_pct)) / 100).toFixed(2));
      const mobile = Number(emp.mobile_allowance ?? cfg.default_mobile_allowance ?? 0);
      const conveyance = Number(emp.conveyance_allowance ?? cfg.default_conveyance ?? 0);
      const other = Number(emp.other_allowance || 0);

      const existingPay = await client.query(
        `SELECT id, deductions, status FROM payroll_records WHERE employee_id = $1 AND pay_month = $2`,
        [emp.id, payMonth]
      );
      const deductions = existingPay.rows[0] ? Number(existingPay.rows[0].deductions || 0) : 0;
      const netPayable = Number(
        (basic + houseRent + medical + mobile + conveyance + other - deductions).toFixed(2)
      );
      const payslipNo = `PS-${payMonth.replace('-', '')}-${emp.employee_code}`;

      const rowRes = await client.query(
        `INSERT INTO payroll_records (
           payslip_no, employee_id, pay_month, present_days,
           basic_amount, house_rent_amount, medical_amount,
           mobile_allowance, conveyance_allowance, other_allowances,
           deductions, net_payable, status, generated_by
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7,
           $8, $9, $10,
           $11, $12, 'GENERATED', $13
         )
         ON CONFLICT (employee_id, pay_month)
         DO UPDATE SET
           present_days = EXCLUDED.present_days,
           basic_amount = EXCLUDED.basic_amount,
           house_rent_amount = EXCLUDED.house_rent_amount,
           medical_amount = EXCLUDED.medical_amount,
           mobile_allowance = EXCLUDED.mobile_allowance,
           conveyance_allowance = EXCLUDED.conveyance_allowance,
           other_allowances = EXCLUDED.other_allowances,
           net_payable = EXCLUDED.net_payable,
           generated_by = EXCLUDED.generated_by
         RETURNING *`,
        [
          payslipNo,
          emp.id,
          payMonth,
          presentDays,
          basic,
          houseRent,
          medical,
          mobile,
          conveyance,
          other,
          deductions,
          netPayable,
          actor.id,
        ]
      );

      generated.push({
        ...rowRes.rows[0],
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        designation: emp.designation,
        department: emp.department,
      });
    }

    await logAudit(client, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      moduleKey: 'hr',
      action: 'PAYROLL_GENERATED',
      entityType: 'payroll_batch',
      entityId: payMonth,
      details: { pay_month: payMonth, count: generated.length },
      ipAddress,
    });

    return generated;
  });
}

export async function listPayrollRecords({ payMonth = '' } = {}) {
  const params = [];
  let whereSql = '';
  if (payMonth) {
    params.push(payMonth);
    whereSql = 'WHERE p.pay_month = $1';
  }

  const res = await query(
    `SELECT
       p.*,
       e.employee_code,
       e.full_name,
       e.designation,
       e.department,
       e.bank_name,
       e.bank_account
     FROM payroll_records p
     JOIN employees e ON e.id = p.employee_id
     ${whereSql}
     ORDER BY p.pay_month DESC, e.employee_code ASC`,
    params
  );
  return res.rows;
}

export async function markPayrollPaid({ payrollId, actor, ipAddress = null }) {
  const res = await query(
    `UPDATE payroll_records
     SET status = 'PAID', paid_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [payrollId]
  );
  if (!res.rows[0]) {
    throw new NotFoundError('Payroll record not found');
  }

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'hr',
    action: 'PAYROLL_MARKED_PAID',
    entityType: 'payroll_record',
    entityId: payrollId,
    details: { payslip_no: res.rows[0].payslip_no, net_payable: res.rows[0].net_payable },
    ipAddress,
  });

  return res.rows[0];
}

export async function generatePayslipPdfById(payrollId) {
  const res = await query(
    `SELECT
       p.*,
       e.employee_code,
       e.full_name,
       e.designation,
       e.department,
       e.bank_name,
       e.bank_account
     FROM payroll_records p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.id = $1`,
    [payrollId]
  );

  if (!res.rows[0]) {
    throw new NotFoundError('Payroll record not found');
  }

  const row = res.rows[0];
  return buildPayslipPdf(row, row);
}
