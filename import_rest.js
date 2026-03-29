/**
 * import_rest.js
 * Imports historical Excel data to Firebase using REST API (HTTPS/PATCH)
 * instead of the Admin SDK WebSocket which can hang in some network environments.
 */

import fs from 'fs';
import * as XLSX from 'xlsx';

// ---- Firebase REST Config ----
const DB_URL = 'https://downline-analyzer-default-rtdb.asia-southeast1.firebasedatabase.app';
const DOWNLOADS_DIR = './backfill_downloads/';
const DRY_RUN = process.argv.includes('--dry-run');
const CHUNK_SIZE = 50; // entries per PATCH request

if (DRY_RUN) console.log('🧪 DRY RUN MODE - No data will be pushed');

// ---- Get OAuth Token from Service Account ----
async function getAccessToken() {
  const { default: admin } = await import('firebase-admin');
  const sa = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  const token = await admin.app().options.credential.getAccessToken();
  return token.access_token;
}

// ---- REST PATCH to Firebase ----
async function patchFirebase(token, updates) {
  // Convert flat key paths to nested JSON for PATCH
  const body = JSON.stringify(updates);
  const url = `${DB_URL}.json?access_token=${token}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return await res.json();
}

// ---- Parse Excel File ----
function parseFile(fileName, snapshotDate, baseDir = DOWNLOADS_DIR) {
  const filePath = baseDir + fileName;
  if (!fs.existsSync(filePath)) return [];

  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 18) continue;

    const memberRaw = String(row[1] || '');
    const parts = memberRaw.split('\n');
    const id = parts[0] ? parts[0].trim() : '';
    const name = parts.length > 1 ? parts[1].replace(/[()]/g, '').trim() : id;
    if (!id) continue;

    let volL = row[16];
    let volR = row[17];
    if (typeof volL === 'string') volL = parseFloat(volL.replace(/,/g, ''));
    if (typeof volR === 'string') volR = parseFloat(volR.replace(/,/g, ''));

    if (volL || volR) {
      // Firebase REST PATCH keys use path notation
      entries.push([`history/${id}/${snapshotDate}`, { volL: volL || 0, volR: volR || 0, name }]);
    }
  }
  return entries;
}

// ---- Main ----
(async () => {
  try {
    console.log('🔑 Getting Firebase access token...');
    const token = await getAccessToken();
    console.log('✅ Token obtained.');

    // Auto-scan downloads dir
    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.endsWith('.xlsx')).sort();
    console.log(`🔍 Found ${files.length} xlsx files in ${DOWNLOADS_DIR}`);

    for (const file of files) {
      const match = file.match(/(\d{4}-\d{2})/);
      if (!match) continue;

      const datePart = match[1];
      const [year, month] = datePart.split('-');
      const lastDay = new Date(year, month, 0).getDate();
      const snapshotDate = `${datePart}-${String(lastDay).padStart(2, '0')}`;

      console.log(`\n📖 Parsing ${file} → date ${snapshotDate}`);
      const entries = parseFile(file, snapshotDate);

      if (entries.length === 0) {
        console.log(`   ⚠️  No member data found (skipping)`);
        continue;
      }

      console.log(`   📊 ${entries.length} members to push`);

      if (DRY_RUN) {
        console.log(`   🧪 [Dry Run] Skipping push`);
        continue;
      }

      let pushed = 0;
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        const updates = Object.fromEntries(chunk);
        try {
          await patchFirebase(token, updates);
          pushed += chunk.length;
          process.stdout.write(`   ✅ ${pushed}/${entries.length}\r`);
        } catch (e) {
          console.error(`\n   ❌ Chunk ${Math.floor(i/CHUNK_SIZE)+1} failed:`, e.message);
        }
      }
      console.log(`   ✅ Pushed ${pushed}/${entries.length} snapshots from ${file}`);
    }

    console.log('\n🚀 Import complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Import failed:', err.message);
    process.exit(1);
  }
})();
