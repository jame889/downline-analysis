import fs from 'fs';
import * as XLSX from 'xlsx';

try {
  const dir = '/Users/zenitha/Downloads/';
  const files = fs.readdirSync(dir).filter(f => f.startsWith('business_report_SPS') && f.endsWith('.xlsx'));
  files.sort((a,b) => fs.statSync(dir+b).mtime.getTime() - fs.statSync(dir+a).mtime.getTime());
  
  if (files.length === 0) {
    console.error("No business report found in Downloads.");
    process.exit(1);
  }

  const latestFile = dir + files[0];
  console.log(`Reading from: ${latestFile}`);

  const buf = fs.readFileSync(latestFile);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const members = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 18) continue; // Skip incomplete rows and header
    
    // Parse member ID and Name from "900057\n(อัจฉรา ศรีตะเถระ)"
    const memberRaw = String(row[1] || "");
    const parts = memberRaw.split('\n');
    const id = parts[0] ? parts[0].trim() : "";
    let name = parts.length > 1 ? parts[1].replace(/[()]/g, '').trim() : id;
    if (!id) continue;
    
    // Parse upline ID and Name
    const uplineRaw = String(row[10] || "");
    const upline = uplineRaw.split(' ')[0].trim();
    const uplineName = uplineRaw.includes('(') ? uplineRaw.split('(')[1].replace(')', '').trim() : upline;
    
    // Parse sponsor ID and Name
    const sponsorRaw = String(row[11] || "");
    const sponsor = sponsorRaw.split(' ')[0].trim();
    const sponsorName = sponsorRaw.includes('(') ? sponsorRaw.split('(')[1].replace(')', '').trim() : sponsor;
    
    // Determine red dots equivalent based on raw Active/Qualified cols (12 & 13)
    let dots = ['blue', 'blue'];
    if (row[12] === 'N' && row[13] === 'N') {
       dots = ['red', 'red'];
    }
    
    // Ensure numeric parsing for volumes
    let volL = row[16];
    let volR = row[17];
    if (typeof volL === 'string') volL = parseFloat(volL.replace(/,/g, ''));
    if (typeof volR === 'string') volR = parseFloat(volR.replace(/,/g, ''));
    
    members.push({
      id,
      name,
      level: parseInt(row[0]) || 0,
      regDate: row[2] || "",
      pos: `${row[3] || ""} / ${row[4] || ""}`,
      upline,
      uplineName,
      sponsor,
      sponsorName,
      volL: volL || 0,
      volR: volR || 0,
      dots
    });
  }

  const fileContent = `export const members = ${JSON.stringify(members, null, 2)};\n`;
  fs.writeFileSync('/Users/zenitha/.gemini/antigravity/scratch/downline-analyzer/src/data.js', fileContent);
  console.log(`Successfully imported ${members.length} records into the app!`);
  
} catch (e) {
  console.error("Error importing data", e);
}
