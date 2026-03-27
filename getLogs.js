import https from 'https';
import fs from 'fs';
import { execSync } from 'child_process';

https.get('https://api.github.com/repos/jame889/downline-analysis/actions/runs', { headers: { 'User-Agent': 'node' } }, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const runs = JSON.parse(body);
    const runId = runs.workflow_runs[0].id;
    console.log("Fetching logs for Run ID:", runId);
    
    try {
      execSync(`curl -sL -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/jame889/downline-analysis/actions/runs/${runId}/logs > logs.zip`);
      execSync(`mkdir -p logs_out && unzip -o logs.zip -d logs_out`);
      
      const files = fs.readdirSync('logs_out');
      // Find the file that corresponds to the Build Web App step or sync-and-deploy job
      const relevantFiles = files.filter(f => f.includes('Build Web App') || f.includes('sync'));
      
      for (const file of relevantFiles) {
         if (fs.statSync(`logs_out/${file}`).isDirectory()) continue;
         console.log(`\n--- CONTENTS OF ${file} ---`);
         const content = fs.readFileSync(`logs_out/${file}`, 'utf-8');
         const lines = content.split('\n');
         console.log(lines.slice(Math.max(0, lines.length - 40)).join('\n'));
      }
      
    } catch(e) {
      console.log("Error analyzing logs:", e.message);
    }
  });
});
