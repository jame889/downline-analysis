import { chromium } from 'playwright';
import fs from 'fs';

// ---- Firebase Admin Setup (for Node.js / GitHub Actions) ----
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
  }
} catch (e) {
  console.warn("⚠️ firebase-admin not available or config missing.");
}

(async () => {
  console.log("Starting Web Scraper Sync...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    const password = process.env.FIRST_DIRECT_PASSWORD || '19781104';
    
    console.log("Logging into FirstThailand portal...");
    await page.goto('https://www.firstthailand.co.th/common/login/index.do', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Fill credentials natively
    console.log("Filling login form...");
    await page.fill('[name="loginid"]', '900057').catch(() => page.fill('input[placeholder*="ชื่อผู้ใช้"]', '900057'));
    await page.fill('[name="passWord"]', password).catch(() => page.fill('input[placeholder*="รหัสผ่าน"]', password));
    
    await page.screenshot({ path: './logs_out/before_login_click.png' });
    
    // Click submit natively
    console.log("Clicking login button...");
    await page.click('button:has-text("เข้าสู่ระบบ")').catch(() => page.click('.btn.fullpoint'));
    
    // Wait for URL to change away from login
    console.log("Waiting for navigation...");
    await page.waitForURL(url => !url.href.includes('login'), { timeout: 30000 }).catch(e => console.log("URL didn't change away from login:", e.message));
    
    await page.screenshot({ path: './logs_out/after_login_sync.png' });

    console.log("Navigating to Downline Business Report...");
    await page.goto('https://www.firstthailand.co.th/myoffice/performance/getDownlineBusinessReport.do', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: './logs_out/report_page_scrape.png' });
    
    // Ensure "Search" is clicked
    console.log("Checking if data needs to be loaded...");
    const tableRows = await page.$$eval('table.business-report tbody tr', rows => rows.length);
    const hasNoData = await page.evaluate(() => document.body.innerText.includes('ไม่มีข้อมูล'));

    if (tableRows <= 1 || hasNoData) {
        console.log("Table is empty or has placeholder, clicking Search button...");
        await page.click('#searchListButton').catch(async () => {
            console.log("Selector #searchListButton failed, trying by text...");
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('ค้นหา') && !b.id.includes('MemberSearch'));
                if (btn) btn.click();
            });
        });
        
        console.log("Waiting for table data to load...");
        await page.waitForFunction(() => {
            const rows = document.querySelectorAll('table.business-report tbody tr');
            return rows.length > 0 && !rows[0].innerText.includes('ไม่มีข้อมูล');
        }, { timeout: 30000 }).catch(e => console.log("Still no data after click:", e.message));
    }

    console.log("Scraping table data...");
    const members = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.business-report tbody tr'));
      return rows.map(row => {
        const tds = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
        if (tds.length < 18) return null;

        // Member ID and Name are in column 1 (usually ID\nName)
        const memberRaw = tds[1] || "";
        const parts = memberRaw.split('\n');
        const id = parts[0] ? parts[0].trim() : "";
        let name = parts.length > 1 ? parts[1].replace(/[()]/g, '').trim() : id;

        const uplineRaw = tds[10] || "";
        const upline = uplineRaw.split(' ')[0].trim();
        const uplineName = uplineRaw.includes('(') ? uplineRaw.split('(')[1].replace(')', '').trim() : upline;
        
        const sponsorRaw = tds[11] || "";
        const sponsor = sponsorRaw.split(' ')[0].trim();
        const sponsorName = sponsorRaw.includes('(') ? sponsorRaw.split('(')[1].replace(')', '').trim() : sponsor;

        // Parse volumes
        const parseVol = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;
        const volL = parseVol(tds[16]);
        const volR = parseVol(tds[17]);

        // Dot indicators (Active/Qualified) - usually column 12, 13
        // Check for circle colors or 'Y'/'N'
        let dots = ['blue', 'blue'];
        const activeCell = row.querySelector('td:nth-child(13) .circle'); // 1-indexed
        const qualCell = row.querySelector('td:nth-child(14) .circle');
        if (activeCell && activeCell.classList.contains('red')) dots[0] = 'red';
        if (qualCell && qualCell.classList.contains('red')) dots[1] = 'red';

        return {
          id, name,
          level: parseInt(tds[0]) || 0,
          regDate: tds[2] || "",
          pos: `${tds[3] || ""} / ${tds[4] || ""}`,
          upline, uplineName,
          sponsor, sponsorName,
          volL, volR,
          dots
        };
      }).filter(m => m && m.id);
    });

    console.log(`✅ Scraped ${members.length} members.`);

    if (members.length > 0) {
      const fileContent = `export const members = ${JSON.stringify(members, null, 2)};\n`;
      fs.writeFileSync('./src/data.js', fileContent);
      console.log(`✅ Updated src/data.js`);

      // ---- Push Daily History Snapshot to Firebase ----
      if (fbDb) {
        const today = new Date().toISOString().slice(0, 10);
        console.log(`📊 Pushing daily snapshot for ${today} to Firebase...`);
        const updates = {};
        for (const m of members) {
          if (m.volL || m.volR) {
            updates[`history/${m.id}/${today}`] = { volL: m.volL, volR: m.volR, name: m.name };
          }
        }
        await fbDb.ref('/').update(updates);
        console.log(`✅ History snapshot pushed to Firebase.`);
        await fbAdmin.app().delete();
      }
    } else {
      console.error("❌ No members found to scrape!");
    }

  } catch (error) {
    console.error("❌ Scraping failed:", error.message);
    await page.screenshot({ path: './scraping_error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
