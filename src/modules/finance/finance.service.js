import { query, withTransaction } from '../../db/pool.js';
import { createNotification, logAudit } from '../../utils/audit.js';
import { generateVoucherPdf } from '../../utils/pdf.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const ALLOWED_VOUCHER_TYPES = new Set(['PAYMENT', 'RECEIPT', 'JOURNAL', 'CONTRA']);

export async function listAccounts() {
  const res = await query(
    `SELECT * FROM chart_of_accounts
     ORDER BY account_code ASC, id ASC`
  );
  return res.rows;
}

export async function createAccount({ payload, actor, ipAddress = null }) {
  if (!payload.account_code || !payload.account_name || !payload.account_type) {
    throw new ValidationError('account_code, account_name, and account_type are required');
  }

  const accountType = String(payload.account_type).trim().toUpperCase();
  if (!['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(accountType)) {
    throw new ValidationError(
      'account_type must be ASSET, LIABILITY, EQUITY, REVENUE, or EXPENSE'
    );
  }

  const openingBalance = Number(payload.opening_balance || 0);

  const res = await query(
    `INSERT INTO chart_of_accounts (
       account_code, account_name, account_type, parent_account_id,
       opening_balance, current_balance, is_active
     ) VALUES ($1, $2, $3, $4, $5, $5, TRUE)
     RETURNING *`,
    [
      String(payload.account_code).trim(),
      String(payload.account_name).trim(),
      accountType,
      payload.parent_account_id ? Number(payload.parent_account_id) : null,
      openingBalance,
    ]
  );

  await logAudit(query, {
    actorUserId: actor.id,
    actorUsername: actor.username,
    moduleKey: 'finance',
    action: 'COA_ACCOUNT_CREATED',
    entityType: 'chart_of_accounts',
    entityId: res.rows[0].id,
    details: { account_code: res.rows[0].account_code, account_type: accountType },
    ipAddress,
  });

  return res.rows[0];
}

export async function listVouchers({ status = '', voucherType = '', projectId = '' } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).trim().toUpperCase());
    conditions.push(`v.status = $${params.length}`);
  }
  if (voucherType) {
    const vt = String(voucherType).trim().toUpperCase();
    if (!ALLOWED_VOUCHER_TYPES.has(vt)) {
      throw new ValidationError(`Invalid voucher type: ${voucherType}`);
    }
    params.push(vt);
    conditions.push(`v.voucher_type = $${params.length}`);
  }
  if (projectId) {
    params.push(Number(projectId));
    conditions.push(`v.project_id = $${params.length}`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await query(
    `SELECT
       v.*,
       p.project_code,
       p.name AS project_name,
       u_prep.username AS prepared_by_username,
       u_app.username AS approved_by_username
     FROM accounting_vouchers v
     LEFT JOIN projects p ON p.id = v.project_id
     LEFT JOIN users u_prep ON u_prep.id = v.prepared_by
     LEFT JOIN users u_app ON u_app.id = v.approved_by
     ${whereSql}
     ORDER BY v.voucher_date DESC, v.id DESC`,
    params
  );

  return res.rows;
}

export async function getVoucherById(voucherId) {
  const vRes = await query(
    `SELECT
       v.*,
       p.project_code,
       p.name AS project_name,
       u_prep.username AS prepared_by_username,
       u_app.username AS approved_by_username
     FROM accounting_vouchers v
     LEFT JOIN projects p ON p.id = v.project_id
     LEFT JOIN users u_prep ON u_prep.id = v.prepared_by
     LEFT JOIN users u_app ON u_app.id = v.approved_by
     WHERE v.id = $1`,
    [voucherId]
  );

  if (!vRes.rows[0]) {
    throw new NotFoundError('Accounting voucher not found');
  }

  const linesRes = await query(
    `SELECT
       vl.*,
       coa.account_code,
       coa.account_name,
       coa.account_type
     FROM voucher_lines vl
     JOIN chart_of_accounts coa ON coa.id = vl.account_id
     WHERE vl.voucher_id = $1
     ORDER BY vl.id ASC`,
    [voucherId]
  );

  return {
    ...vRes.rows[0],
    lines: linesRes.rows,
  };
}

export async function createVoucher({ payload, actor, ipAddress = null }) {
  if (!payload.voucher_no) {
    throw new ValidationError('voucher_no is required');
  }

  const voucherType = String(payload.voucher_type || 'JOURNAL').toUpperCase();
  if (!ALLOWED_VOUCHER_TYPES.has(voucherType)) {
    throw new ValidationError(`Invalid voucher_type: ${voucherType}`);
  }

  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (lines.length < 2) {
    throw new ValidationError('At least 2 voucher lines (debit and credit) are required');
  }

  let totalDebit = 0;
  let totalCredit = 0;

  const normalizedLines = lines.map((line, idx) => {
    const accountId = Number(line.account_id);
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (!accountId) {
      throw new ValidationError(`Line ${idx + 1}: account_id is required`);
    }
    if (debit < 0 || credit < 0 || (debit === 0 && credit === 0)) {
      throw new ValidationError(`Line ${idx + 1}: must have a positive debit or credit amount`);
    }
    if (debit > 0 && credit > 0) {
      throw new ValidationError(`Line ${idx + 1}: cannot have both debit and credit on the same line`);
    }

    totalDebit += debit;
    totalCredit += credit;

    return {
      account_id: accountId,
      description: line.description || payload.description || null,
      debit: Number(debit.toFixed(2)),
      credit: Number(credit.toFixed(2)),
    };
  });

  totalDebit = Number(totalDebit.toFixed(2));
  totalCredit = Number(totalCredit.toFixed(2));

  if (totalDebit !== totalCredit) {
    throw new ValidationError(
      `Unbalanced voucher: Total Debit (${totalDebit.toFixed(2)}) must equal Total Credit (${totalCredit.toFixed(2)})`
    );
  }

  return withTransaction(async (client) => {
    for (const ln of normalizedLines) {
      const accRes = await client.query(
        'SELECT id, is_active FROM chart_of_accounts WHERE id = $1',
        [ln.account_id]
      );
      if (!accRes.rows[0] || !accRes.rows[0].is_active) {
        throw new ValidationError(`Invalid or inactive account_id: ${ln.account_id}`);
      }
    }

    const vRes = await client.query(
      `INSERT INTO accounting_vouchers (
         voucher_no, voucher_type, voucher_date, project_id, payee_or_payer,
         description, total_debit, total_credit, status, prepared_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING_APPROVAL', $9)
       RETURNING *`,
      [
        String(payload.voucher_no).trim(),
        voucherType,
        payload.voucher_date || new Date().toISOString().slice(0, 10),
        payload.project_id ? Number(payload.project_id) : null,
        payload.payee_or_payer || null,
        payload.description || null,
        totalDebit,
        totalCredit,
        actor.id,
      ]
    );

    const voucher = vRes.rows[0];

    for (const ln of normalizedLines) {
      await client.query(
        `INSERT INTO voucher_lines (voucher_id, account_id, description, debit, credit)
         VALUES ($1, $2, $3, $4, $5)`,
        [voucher.id, ln.account_id, ln.description, ln.debit, ln.credit]
      );
    }

    await createNotification(client, {
      userId: null,
      moduleKey: 'finance',
      title: `Voucher Pending Approval: ${voucher.voucher_no}`,
      message: `${voucher.voucher_type} voucher of ${totalDebit.toFixed(2)} BDT submitted by ${actor.username}.`,
    });

    await logAudit(client, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      moduleKey: 'finance',
      action: 'VOUCHER_CREATED',
      entityType: 'accounting_voucher',
      entityId: voucher.id,
      details: { voucher_no: voucher.voucher_no, amount: totalDebit, status: 'PENDING_APPROVAL' },
      ipAddress,
    });

    return getVoucherById(voucher.id);
  });
}

export async function approveAndPostVoucher({ voucherId, actor, ipAddress = null }) {
  return withTransaction(async (client) => {
    const vRes = await client.query(
      'SELECT * FROM accounting_vouchers WHERE id = $1 FOR UPDATE',
      [voucherId]
    );
    const voucher = vRes.rows[0];
    if (!voucher) {
      throw new NotFoundError('Accounting voucher not found');
    }
    if (voucher.status === 'POSTED') {
      throw new ValidationError('Voucher is already POSTED');
    }

    const linesRes = await client.query('SELECT * FROM voucher_lines WHERE voucher_id = $1', [
      voucherId,
    ]);

    for (const line of linesRes.rows) {
      const accRes = await client.query(
        'SELECT * FROM chart_of_accounts WHERE id = $1 FOR UPDATE',
        [line.account_id]
      );
      const acc = accRes.rows[0];
      if (!acc) {
        throw new NotFoundError(`Account ${line.account_id} not found`);
      }

      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      const currentBal = Number(acc.current_balance || 0);

      // Standard double-entry normal balance rules:
      // ASSET & EXPENSE increase with DEBIT, decrease with CREDIT
      // LIABILITY, EQUITY & REVENUE increase with CREDIT, decrease with DEBIT
      const isDebitNormal = acc.account_type === 'ASSET' || acc.account_type === 'EXPENSE';
      const delta = isDebitNormal ? debit - credit : credit - debit;
      const nextBal = Number((currentBal + delta).toFixed(2));

      await client.query(
        `UPDATE chart_of_accounts SET current_balance = $1, updated_at = NOW() WHERE id = $2`,
        [nextBal, acc.id]
      );
    }

    await client.query(
      `UPDATE accounting_vouchers
       SET status = 'POSTED', approved_by = $1, approved_at = NOW()
       WHERE id = $2`,
      [actor.id, voucherId]
    );

    await logAudit(client, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      moduleKey: 'finance',
      action: 'VOUCHER_APPROVED_POSTED',
      entityType: 'accounting_voucher',
      entityId: voucherId,
      details: { voucher_no: voucher.voucher_no, total_amount: voucher.total_debit },
      ipAddress,
    });

    return getVoucherById(voucherId);
  });
}

export async function generateVoucherPdfById(voucherId) {
  const voucher = await getVoucherById(voucherId);
  return generateVoucherPdf(voucher, voucher.lines);
}

export async function getFinanceSummary() {
  const coaRes = await query(
    `SELECT
       account_type,
       COALESCE(SUM(current_balance), 0)::numeric(14,2) AS total_balance
     FROM chart_of_accounts
     WHERE is_active = TRUE
     GROUP BY account_type`
  );

  const vStatsRes = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS pending_vouchers,
       COUNT(*) FILTER (WHERE status = 'POSTED')::int AS posted_vouchers,
       COALESCE(SUM(total_debit) FILTER (WHERE status = 'POSTED'), 0)::numeric(14,2) AS posted_volume
     FROM accounting_vouchers`
  );

  const byType = {
    ASSET: 0,
    LIABILITY: 0,
    EQUITY: 0,
    REVENUE: 0,
    EXPENSE: 0,
  };
  for (const r of coaRes.rows) {
    byType[r.account_type] = Number(r.total_balance || 0);
  }

  return {
    balances_by_type: byType,
    net_position: Number((byType.ASSET - byType.LIABILITY).toFixed(2)),
    vouchers: vStatsRes.rows[0],
  };
}
