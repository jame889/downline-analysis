import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import fs from 'fs';

// ---- Firebase Admin Setup (for Node.js / GitHub Actions) ----
// Uses FIREBASE_SERVICE_ACCOUNT env var (JSON string) in CI,
// or falls back to a local serviceAccountKey.json file.
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
    console.log("✅ Firebase Admin connected.");
  } else {
    console.warn("⚠️ No Firebase credentials found. History will NOT be pushed.");
  }
} catch (e) {
  console.warn("⚠️ firebase-admin not available:", e.message);
}

(async () => {
  console.log("Starting Automated Sync Tracker...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  
  try {
    console.log("Navigating to FirstThailand portal...");
    await page.goto('https://www.firstthailand.co.th/', { waitUntil: 'domcontentloaded' });
    
    console.log("Looking for login portal...");
    // If not already on the login panel, try clicking a login link
    try {
        await page.click('text="เข้าสู่ระบบ"', { timeout: 3000 });
    } catch(e) {}
    
    await page.waitForTimeout(2000);
    
    console.log("Filling credentials...");
    // Try to robustly target the first text input and the password input
    const inputs = await page.$$('input[type="text"]');
    if (inputs.length > 0) {
      await inputs[0].fill('900057');
    } else {
      // Fallback
      await page.fill('input:not([type="hidden"])', '900057').catch(()=>{});
    }
    
    // Use environment variable for security, default to local if not running in CI
    const password = process.env.FIRST_DIRECT_PASSWORD || '19781104';
    await page.fill('input[type="password"]', password).catch(()=>{});
    
    // Click Submit
    console.log("Submitting login form...");
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const loginBtn = btns.find(b => b.innerText.includes('เข้าสู่ระบบ') || b.innerText.includes('Login'));
        if (loginBtn) loginBtn.click();
    });

    console.log("Waiting for network to settle after login...");
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => console.log("Navigation ready (idle)."));

    console.log("Navigating to Downline Business Report...");
    await page.goto('https://www.firstthailand.co.th/myoffice/performance/getDownlineBusinessReport.do', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log("Waiting for report table to load...");
    await page.waitForTimeout(10000); // Increased wait time

    console.log("Triggering Excel Download...");
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    
    // Better click strategy
    const excelLocator = page.locator('a, button, img').filter({ hasText: /excel|download/i }).first();
    if (await excelLocator.count() > 0) {
        console.log("Triggering locator click for Excel...");
        await excelLocator.click({ timeout: 10000 }).catch(async () => {
            console.log("Locator click failed, trying evaluate...");
            await page.evaluate(() => {
                const el = Array.from(document.querySelectorAll('a, button')).find(e => e.innerText.toLowerCase().includes('excel'));
                if (el) el.click();
            });
        });
    } else {
        await page.evaluate(() => {
           if (typeof excelDown === 'function') excelDown();
           else {
               const el = Array.from(document.querySelectorAll('a, button')).find(e => e.innerText.toLowerCase().includes('excel'));
               if (el) el.click();
           }
        });
    }

    let downloadPath;
    try {
      const download = await downloadPromise;
      downloadPath = `./temp_report.xlsx`;
      await download.saveAs(downloadPath);
      console.log(`Report downloaded successfully to temp file.`);
    } catch(e) {
      console.log("Timeout waiting for download! Saving page HTML to debug.html");
      const html = await page.content();
      fs.writeFileSync('./debug.html', html);
      return;
    }

    // --- Parse Excel ---
    console.log("Converting Excel data to Application Database format...");
    const buf = fs.readFileSync(downloadPath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const members = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 18) continue;
      
      const memberRaw = String(row[1] || "");
      const parts = memberRaw.split('\n');
      const id = parts[0] ? parts[0].trim() : "";
      let name = parts.length > 1 ? parts[1].replace(/[()]/g, '').trim() : id;
      if (!id) continue;
      
      const uplineRaw = String(row[10] || "");
      const upline = uplineRaw.split(' ')[0].trim();
      const uplineName = uplineRaw.includes('(') ? uplineRaw.split('(')[1].replace(')', '').trim() : upline;
      
      const sponsorRaw = String(row[11] || "");
      const sponsor = sponsorRaw.split(' ')[0].trim();
      const sponsorName = sponsorRaw.includes('(') ? sponsorRaw.split('(')[1].replace(')', '').trim() : sponsor;
      
      let dots = ['blue', 'blue'];
      if (row[12] === 'N' && row[13] === 'N') dots = ['red', 'red'];
      
      let volL = row[16];
      let volR = row[17];
      if (typeof volL === 'string') volL = parseFloat(volL.replace(/,/g, ''));
      if (typeof volR === 'string') volR = parseFloat(volR.replace(/,/g, ''));
      
      members.push({
        id, name,
        level: parseInt(row[0]) || 0,
        regDate: row[2] || "",
        pos: `${row[3] || ""} / ${row[4] || ""}`,
        upline, uplineName,
        sponsor, sponsorName,
        volL: volL || 0, volR: volR || 0,
        dots
      });
    }

    const fileContent = `export const members = ${JSON.stringify(members, null, 2)};\n`;
    fs.writeFileSync('./src/data.js', fileContent);
    console.log(`✅ Automated Sync Complete! Successfully extracted and replaced ${members.length} records into the app.`);

    // ---- Push Daily History Snapshot to Firebase ----
    if (fbDb) {
      const today = new Date().toISOString().slice(0, 10); // e.g. "2026-03-29"
      console.log(`📊 Pushing daily snapshot for ${today} to Firebase (${members.length} members)...`);
      const updates = {};
      for (const m of members) {
        if (m.volL || m.volR) {
          updates[`history/${m.id}/${today}`] = { volL: m.volL, volR: m.volR, name: m.name };
        }
      }
      await fbDb.ref('/').update(updates);
      console.log(`✅ History snapshot pushed for ${Object.keys(updates).length} members.`);
      await fbAdmin.app().delete();
    }
    
    // Cleanup temp excel file
    fs.unlinkSync(downloadPath);

  } catch (error) {
    console.error("❌ Sync process failed:", error);
  } finally {
    await browser.close();
  }
})();
