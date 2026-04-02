import fs from 'fs';
import * as XLSX from 'xlsx';
import admin from 'firebase-admin';

// ---- Firebase Admin Setup ----
let serviceAccount;
if (fs.existsSync('./serviceAccountKey.json')) {
  serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
} else {
  console.error("❌ No serviceAccountKey.json found! Required for Firebase pushing.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://downline-analyzer-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}
const db = admin.database();

// ---- Config ----
const DOWNLOADS_DIR = './backfill_downloads/';
const HISTORY_FILES = [];
const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) console.log("🧪 DRY RUN MODE ENABLED - No data will be pushed to Firebase");

// Auto-scan the downloads dir
if (fs.existsSync(DOWNLOADS_DIR)) {
  const files = fs.readdirSync(DOWNLOADS_DIR);
  for (const file of files) {
    if (file.endsWith('.xlsx')) {
      // business_report_SPS_2026-03.xlsx or report_2026-03.xlsx
      const match = file.match(/(\d{4}-\d{2})/);
      if (match) {
        // Use the end of the month or just YYYY-MM-01? 
        // Let's use YYYY-MM-01 for simplicity or look for specific period
        // Based on previous example, end date was preferred. 
        const datePart = match[1];
        const [year, month] = datePart.split('-');
        const lastDay = new Date(year, month, 0).getDate();
        const date = `${datePart}-${String(lastDay).padStart(2, '0')}`;
        HISTORY_FILES.push({ path: file, date });
      }
    }
  }
}

// Keep the old ones if they exist in case user still has them elsewhere
const LEGACY_DIR = '/Users/zenitha/Downloads/';
const LEGACY_FILES = [
  { path: 'รายงานที่ไม่มีชื่อ-ม.ค.-27-2026-ถึง-ก.พ.-25-2026.xlsx', date: '2026-02-25' },
  { path: 'business_report_SPS_2026-03.xlsx', date: '2026-03-01' }
];

async function importFile(fileName, snapshotDate, baseDir = DOWNLOADS_DIR) {
  const filePath = baseDir + fileName;
  if (!fs.existsSync(filePath)) {
    return;
  }

  console.log(`📖 Parsing ${fileName} for snapshot date ${snapshotDate}...`);
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const entries = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 18) continue;
    
    const memberRaw = String(row[1] || "");
    const parts = memberRaw.split('\n');
    const id = parts[0] ? parts[0].trim() : "";
    let name = parts.length > 1 ? parts[1].replace(/[()]/g, '').trim() : id;
    if (!id) continue;
    
    let volL = row[16];
    let volR = row[17];
    if (typeof volL === 'string') volL = parseFloat(volL.replace(/,/g, ''));
    if (typeof volR === 'string') volR = parseFloat(volR.replace(/,/g, ''));

    if (volL || volR) {
      entries.push([`history/${id}/${snapshotDate}`, { volL: volL || 0, volR: volR || 0, name }]);
    }
  }

  if (entries.length === 0) {
    console.warn(`⚠️ No valid member data found in ${fileName}.`);
    return;
  }

  if (DRY_RUN) {
    console.log(`🧪 [Dry Run] Would have pushed ${entries.length} member snapshots from ${fileName} with date ${snapshotDate}.`);
    return;
  }

  // Chunk into batches of 20 to avoid Firebase update size limits/timeouts
  const CHUNK_SIZE = 20;
  const CHUNK_TIMEOUT = 30000;
  let pushed = 0;
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const updates = Object.fromEntries(chunk);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase Chunk Timeout')), CHUNK_TIMEOUT));
      await Promise.race([db.ref('/').update(updates), timeout]);
      pushed += chunk.length;
    } catch (e) {
      console.error(`❌ Chunk ${Math.floor(i/CHUNK_SIZE)+1} failed for ${fileName}:`, e.message);
    }
  }
  console.log(`✅ Pushed ${pushed}/${entries.length} member snapshots from ${fileName} (date: ${snapshotDate}).`);
}

(async () => {
  try {
    console.log(`🔍 Found ${HISTORY_FILES.length} files in ${DOWNLOADS_DIR}`);
    for (const f of HISTORY_FILES) {
      await importFile(f.path, f.date, DOWNLOADS_DIR);
    }
    
    // Also try legacy files
    for (const f of LEGACY_FILES) {
      await importFile(f.path, f.date, LEGACY_DIR);
    }
    
    console.log("🚀 Backfill from local files complete!");
  } catch (err) {
    console.error("❌ Import failed:", err);
  } finally {
    if (admin.apps.length) await admin.app().delete();
  }
})();
