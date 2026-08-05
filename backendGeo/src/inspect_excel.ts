import ExcelJS from 'exceljs';
import path from 'path';

async function main() {
  const filePath = path.join(__dirname, 'update.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log('Sheet names:', workbook.worksheets.map(w => w.name));
  const worksheet = workbook.worksheets[0];

  const rows: any[] = [];
  worksheet.eachRow((row) => {
    // cell values can be objects or primitives
    const vals = (row.values as any[]).map(v => (v && typeof v === 'object' && 'text' in v ? v.text : v));
    rows.push(vals);
  });

  console.log('Total rows:', rows.length);
  console.log('Header row:', rows[0]);
  for (let i = 1; i < Math.min(rows.length, 6); i++) {
    console.log(`Row ${i + 1}:`, rows[i]);
  }
}

main().catch(console.error);
