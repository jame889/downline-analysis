import fs from 'fs';
import * as XLSX from 'xlsx';

const buf = fs.readFileSync('/Users/zenitha/Downloads/business_report_SPS_2026-03-2.xlsx');
// Use the underlying buffer
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log(JSON.stringify(rows.slice(0, 5), null, 2));
