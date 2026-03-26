import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import fs from 'fs';

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
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => console.log("Navigation ready."));

    console.log("Navigating to Downline Business Report...");
    await page.goto('https://www.firstthailand.co.th/myoffice/performance/getDownlineBusinessReport.do', { waitUntil: 'domcontentloaded' });
    
    console.log("Waiting for report table to load...");
    await page.waitForTimeout(6000); // Give the table and scripts 6 seconds to populate

    console.log("Triggering Excel Download...");
    // Use an evaluate trick to click the exact download endpoint if known, or text match
    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    
    // Try an alternative Playwright locator for the Excel link before evaluating
    const excelLocator = page.locator('a, button, img').filter({ hasText: /excel|download/i }).first();
    if (await excelLocator.count() > 0) {
        console.log("Triggering explicit locator click for Excel...");
        await excelLocator.click();
    } else {
        await page.evaluate(() => {
           const links = Array.from(document.querySelectorAll('a, span, div, button, img'));
           const excelAct = links.find(el => 
              (el.tagName === 'A' && el.href.includes('excel')) || 
              (el.innerText && el.innerText.toLowerCase().includes('excel')) ||
              (el.src && el.src.includes('excel'))
           );
           if (excelAct) excelAct.click();
           else if (typeof excelDown === 'function') excelDown();
        });
    }

    try {
      const download = await downloadPromise;
      const downloadPath = `./temp_report.xlsx`;
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
    
    // Cleanup temp excel file
    fs.unlinkSync(downloadPath);

  } catch (error) {
    console.error("❌ Sync process failed:", error);
  } finally {
    await browser.close();
  }
})();
