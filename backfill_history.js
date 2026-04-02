import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// ---- Firebase Admin Setup (from sync.js) ----
let fbAdmin = null;
let fbDb = null;
try {
  const { default: admin } = await import('firebase-admin');
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (fs.existsSync('./serviceAccountKey.json')) {
    serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
  }
    if (serviceAccount) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://downline-analyzer-default-rtdb.asia-southeast1.firebasedatabase.app"
      });
    }
    fbAdmin = admin;
    fbDb = admin.database();
    console.log("✅ Firebase Admin initialized (Background connection).");
  } else {
    console.warn("⚠️ No Firebase credentials found. History will NOT be pushed.");
  }
} catch (e) {
  console.warn("⚠️ firebase-admin not available:", e.message);
}

const getLastDayOfMonth = (year, month) => {
    return new Date(year, month, 0).toISOString().slice(0, 10);
};

(async () => {
  const user = '900057';
  const password = process.env.FIRST_DIRECT_PASSWORD || '19781104';
  const downloadsDir = path.resolve('./backfill_downloads');
  
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
  }

  console.log("🚀 Starting Historical Backfill Scraper...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 } 
  });
  const page = await context.newPage();

  try {
    // 1. Login
    console.log("🔑 Logging in...");
    await page.goto('https://www.firstthailand.co.th/common/login/index.do', { waitUntil: 'networkidle' });
    
    await page.fill('[name="loginid"]', user);
    await page.fill('[name="passWord"]', password);
    
    await page.fill('[name="loginid"]', user);
    await page.fill('[name="passWord"]', password);
    
    console.log("🖱️ Clicking Login button (#btnLogin)...");
    await page.click('#btnLogin');
    
    // Wait for navigation or a post-login element
    try {
        await page.waitForSelector('text="สำนักงานของฉัน"', { timeout: 15000 });
        console.log("✅ Login successful (verified via selector).");
    } catch(e) {
        console.log("⚠️ Post-login element not found, checking URL...");
        if (page.url().includes('login')) {
            console.error("❌ Still on login page. Login failed?");
            throw new Error("Login failed");
        }
    }

    console.log("✅ Login successful! Navigating to Report Page...");
    await page.goto('https://www.firstthailand.co.th/myoffice/performance/getDownlineBusinessReport.do', { waitUntil: 'networkidle' });

    // Range: June 2025 to March 2026
    const months = [];
    for (let year = 2025; year <= 2026; year++) {
        let startMonth = (year === 2025) ? 6 : 1;
        let endMonth = (year === 2025) ? 12 : (year === 2026) ? 3 : 12;
        for (let month = startMonth; month <= endMonth; month++) {
            months.push({ year, month, str: `${year}-${String(month).padStart(2, '0')}` });
        }
    }

    console.log(`📅 Planned to scrape ${months.length} months.`);

    for (const m of months) {
        console.log(`\n--- Processing ${m.str} ---`);
        
        // Update Month Input
        await page.fill('#s_month', m.str);
        
        // Click Search
        console.log(`🔍 Searching for ${m.str}...`);
        await page.click('#searchListButton');
        await page.waitForTimeout(5000); // Wait for results

        // Trigger Download
        console.log(`📥 Downloading Excel for ${m.str}...`);
        const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
        
        // Accept the confirmation dialog
        const dialogHandler = dialog => dialog.accept();
        page.on('dialog', dialogHandler);
        
        await page.click('#downloadButton');
        
        // Handle Confirm Dialog (if any) - Playwright auto-handles confirms in most cases, 
        // but we might need to listen for dialog if it blocks.
        // The HTML showed "if(confirm(...))" in the click handler.
        // page.on('dialog', dialog => dialog.accept()); 
        // Note: Playwright handles dialogs automatically by dismissing them unless a listener is added.
        // We need to ACCEPT it.

        const download = await downloadPromise;
        page.off('dialog', dialogHandler);
        
        if (!download) {
            console.error(`❌ Download failed for ${m.str} (Timeout or no event)`);
            continue;
        }

        const downloadPath = path.join(downloadsDir, `report_${m.str}.xlsx`);
        await download.saveAs(downloadPath);
        console.log(`💾 Saved to ${downloadPath}`);

        // Parse and Push
        const dateKey = getLastDayOfMonth(m.year, m.month);
        console.log(`📊 Parsing data for ${dateKey}...`);
        
        const buf = fs.readFileSync(downloadPath);
        const wb = XLSX.read(buf, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const members = [];
        // Header is row 0/1. Data starts at row 2 usually in these reports.
        // sync.js started at i=1. Let's be safe.
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 18) continue;
            
            const memberRaw = String(row[1] || "");
            const parts = memberRaw.split('\n');
            const id = parts[0] ? parts[0].trim() : "";
            if (!id || isNaN(parseInt(id))) continue;

            let volL = row[16];
            let volR = row[17];
            if (typeof volL === 'string') volL = parseFloat(volL.replace(/,/g, ''));
            if (typeof volR === 'string') volR = parseFloat(volR.replace(/,/g, ''));
            
            if (volL || volR) {
                members.push({ id, volL: volL || 0, volR: volR || 0 });
            }
        }

        console.log(`✅ Extracted stats for ${members.length} members.`);

        if (fbDb && members.length > 0) {
            const updates = {};
            for (const member of members) {
                updates[`history/${member.id}/${dateKey}`] = { 
                    volL: member.volL, 
                    volR: member.volR,
                    lastUpdated: new Date().toISOString()
                };
            }
            await fbDb.ref('/').update(updates);
            console.log(`🚀 Pushed ${Object.keys(updates).length} updates to Firebase.`);
        }
    }

    console.log("\n✨ Backfill process completed!");

  } catch (err) {
    console.error("❌ Error during scraping:", err);
  } finally {
    if (fbAdmin) await fbAdmin.app().delete();
    await browser.close();
  }
})();
