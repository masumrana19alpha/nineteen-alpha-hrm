import PDFDocument from 'pdfkit';

/**
 * Generates a PDF buffer for an Accounting Voucher (Debit/Credit)
 */
export function generateVoucherPdf(voucher, lines = []) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('NINETEEN ALPHA', { align: 'center' });
      doc.fontSize(10).text('Business Management System (BMS)', { align: 'center' });
      doc.moveDown();

      // Title
      const vType = voucher.voucher_type || 'JOURNAL';
      doc.fontSize(16).text(`${vType} VOUCHER`, { align: 'center', underline: true });
      doc.moveDown();

      // Meta Details
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`Voucher No: `, { continued: true }).font('Helvetica').text(`${voucher.voucher_no || 'N/A'}`);
      
      const formattedDate = voucher.voucher_date ? String(voucher.voucher_date).slice(0, 10) : 'N/A';
      doc.font('Helvetica-Bold').text(`Date: `, { continued: true }).font('Helvetica').text(`${formattedDate}`);
      
      doc.font('Helvetica-Bold').text(`Status: `, { continued: true }).font('Helvetica').text(`${voucher.status || 'PENDING'}`);
      
      if (voucher.project_name || voucher.project_code) {
        doc.font('Helvetica-Bold').text(`Project: `, { continued: true }).font('Helvetica').text(`${voucher.project_code || ''} - ${voucher.project_name || ''}`);
      }
      
      if (voucher.payee_or_payer) {
        doc.font('Helvetica-Bold').text(`Payee/Payer: `, { continued: true }).font('Helvetica').text(`${voucher.payee_or_payer}`);
      }
      
      doc.moveDown();

      // Table Header
      const tableTop = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('Account', 50, tableTop, { width: 150 });
      doc.text('Description', 200, tableTop, { width: 180 });
      doc.text('Debit (BDT)', 380, tableTop, { width: 80, align: 'right' });
      doc.text('Credit (BDT)', 470, tableTop, { width: 80, align: 'right' });
      
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      // Table Rows
      doc.font('Helvetica');
      let totalDebit = 0;
      let totalCredit = 0;

      if (lines && lines.length > 0) {
        lines.forEach((line) => {
          const d = Number(line.debit || 0);
          const c = Number(line.credit || 0);
          totalDebit += d;
          totalCredit += c;

          const rowY = doc.y;
          doc.text(line.account_name || line.account_code || '-', 50, rowY, { width: 150 });
          doc.text(line.description || '-', 200, rowY, { width: 180 });
          doc.text(d > 0 ? d.toFixed(2) : '', 380, rowY, { width: 80, align: 'right' });
          doc.text(c > 0 ? c.toFixed(2) : '', 470, rowY, { width: 80, align: 'right' });
          
          doc.moveDown(0.5);
        });
      } else {
        doc.text('No voucher lines found.', 50, doc.y);
        doc.moveDown();
      }

      // Totals
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold');
      
      const totalsY = doc.y;
      doc.text('Total', 50, totalsY, { width: 330 });
      doc.text(totalDebit.toFixed(2), 380, totalsY, { width: 80, align: 'right' });
      doc.text(totalCredit.toFixed(2), 470, totalsY, { width: 80, align: 'right' });
      
      doc.moveDown(2);
      
      // Signatures
      doc.fontSize(10).font('Helvetica');
      doc.text('_____________________________', 50, doc.y, { width: 200, align: 'center' });
      doc.text('_____________________________', 350, doc.y, { width: 200, align: 'center' });
      
      doc.moveDown(0.5);
      doc.text('Prepared By', 50, doc.y, { width: 200, align: 'center' });
      doc.text('Approved By', 350, doc.y, { width: 200, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
