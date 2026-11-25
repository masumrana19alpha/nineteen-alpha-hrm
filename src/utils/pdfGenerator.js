import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';

function createHeader(doc, title, subtitle) {
  doc
    .fontSize(16)
    .fillColor('#0f172a')
    .text(env.company.name.toUpperCase(), { align: 'left' })
    .fontSize(9)
    .fillColor('#475569')
    .text(`${env.company.location} | ${env.company.systemName}`)
    .moveDown(0.5);

  doc
    .fontSize(13)
    .fillColor('#1e3a8a')
    .text(title)
    .fontSize(9)
    .fillColor('#64748b')
    .text(subtitle || `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`)
    .moveDown(0.5);

  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor('#cbd5e1')
    .stroke()
    .moveDown(0.8);
}

function renderKeyValueRows(doc, rows) {
  doc.fontSize(10).fillColor('#1e293b');
  for (const [label, value] of rows) {
    doc
      .font('Helvetica-Bold')
      .text(`${label}: `, { continued: true })
      .font('Helvetica')
      .text(value ?? 'N/A')
      .moveDown(0.25);
  }
}

export function buildPayslipPdf(payroll, employee) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    createHeader(
      doc,
      `MONTHLY SALARY RECEIPT / PAYSLIP (${payroll.pay_month})`,
      `Payslip No: ${payroll.payslip_no} | Status: ${payroll.status}`
    );

    renderKeyValueRows(doc, [
      ['Employee Name', employee.full_name],
      ['Employee ID', employee.employee_code],
      ['Designation & Dept', `${employee.designation} — ${employee.department}`],
      ['Present Days', String(payroll.present_days ?? 0)],
      ['Bank Account', employee.bank_account ? `${employee.bank_name || ''} (${employee.bank_account})` : 'N/A'],
    ]);

    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).text('Earnings & Allowances (BDT)');
    doc.moveDown(0.25);

    const basic = Number(payroll.basic_amount || 0);
    const houseRent = Number(payroll.house_rent_amount || 0);
    const medical = Number(payroll.medical_amount || 0);
    const mobile = Number(payroll.mobile_allowance || 0);
    const conveyance = Number(payroll.conveyance_allowance || 0);
    const other = Number(payroll.other_allowances || 0);
    const deductions = Number(payroll.deductions || 0);
    const netPayable = Number(payroll.net_payable || 0);
    const gross = basic + houseRent + medical + mobile + conveyance + other;

    renderKeyValueRows(doc, [
      ['Basic Salary', basic.toFixed(2)],
      ['House Rent Allowance', houseRent.toFixed(2)],
      ['Medical Allowance', medical.toFixed(2)],
      ['Mobile Allowance', mobile.toFixed(2)],
      ['Conveyance Allowance', conveyance.toFixed(2)],
      ['Other Allowances', other.toFixed(2)],
      ['Gross Earnings', gross.toFixed(2)],
      ['Deductions', deductions.toFixed(2)],
    ]);

    doc
      .moveDown(0.4)
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#0f172a')
      .text(`Net Payable Salary: BDT ${netPayable.toFixed(2)}`);

    doc.end();
  });
}

export function buildAttendanceReportPdf(filters, logs) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    createHeader(
      doc,
      'EMPLOYEE ATTENDANCE REPORT',
      `Employee Filter: ${filters.employeeLabel || 'All Employees'} | Range: ${filters.startDate || 'All'} to ${filters.endDate || 'All'}`
    );

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('Date          Time        Emp Code    Employee Name            Action       Source', {
      width: 515,
    });
    doc.moveDown(0.3).font('Helvetica').fillColor('#334155');

    for (const row of logs) {
      const dateStr = String(row.log_date || '').slice(0, 10).padEnd(14);
      const timeStr = String(row.log_time || '').slice(0, 8).padEnd(12);
      const codeStr = String(row.employee_code || '').padEnd(12);
      const nameStr = String(row.full_name || '').slice(0, 22).padEnd(25);
      const actionStr = String(row.action || '').padEnd(13);
      const sourceStr = String(row.source || '');
      doc.text(`${dateStr}${timeStr}${codeStr}${nameStr}${actionStr}${sourceStr}`, {
        width: 515,
      });
    }

    doc.end();
  });
}

export function buildVoucherPdf(voucher) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const voucherLabel = voucher.voucher_type === 'CREDIT' ? 'CREDIT VOUCHER (CV)' : 'DEBIT VOUCHER (DV)';
    createHeader(
      doc,
      voucherLabel,
      `Voucher No: ${voucher.voucher_no} | Date: ${String(voucher.voucher_date || '').slice(0, 10)} | Status: ${voucher.status}`
    );

    renderKeyValueRows(doc, [
      ['Voucher Type', voucher.voucher_type],
      ['Account Code & Head', `${voucher.account_code} — ${voucher.account_name || ''}`],
      ['Project Reference', voucher.project_name || voucher.project_code || 'General / HQ'],
      ['Business Vertical', voucher.vertical || 'General'],
      ['Petty Cash Voucher', voucher.is_petty_cash ? 'Yes' : 'No'],
      ['Narration', voucher.narration || 'N/A'],
      ['Amount (BDT)', Number(voucher.amount || 0).toFixed(2)],
    ]);

    doc.moveDown(2).fontSize(9).fillColor('#475569');
    doc.text('Prepared By: _____________________      Approved By: _____________________');

    doc.end();
  });
}

export function buildFinancialStatementPdf(title, subtitle, lines) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    createHeader(doc, title, subtitle);

    doc.fontSize(9.5).fillColor('#1e293b');
    for (const line of lines) {
      doc
        .font(line.bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(line.text)
        .moveDown(0.25);
    }

    doc.end();
  });
}
