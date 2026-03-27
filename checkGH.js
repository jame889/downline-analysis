import https from 'https';

https.get('https://api.github.com/repos/jame889/downline-analysis/actions/runs', { headers: { 'User-Agent': 'node' } }, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const runs = JSON.parse(body);
    const latestRun = runs.workflow_runs[0];
    
    https.get(`https://api.github.com/repos/jame889/downline-analysis/actions/runs/${latestRun.id}/jobs`, { headers: { 'User-Agent': 'node' } }, (jRes) => {
      let jBody = '';
      jRes.on('data', d => jBody += d);
      jRes.on('end', () => {
        const jobs = JSON.parse(jBody);
        const failedJob = jobs.jobs.find(j => j.conclusion === 'failure');
        
        if (failedJob) {
          https.get(`https://api.github.com/repos/jame889/downline-analysis/actions/jobs/${failedJob.id}/logs`, { headers: { 'User-Agent': 'node' } }, (lRes) => {
             if (lRes.statusCode === 302) {
                https.get(lRes.headers.location, (flRes) => {
                   let lBody = '';
                   flRes.on('data', d => lBody += d);
                   flRes.on('end', () => {
                      const lines = lBody.split('\n');
                      const errLines = lines.filter(l => l.includes('error') || l.includes('ERR') || l.includes('Failed') || l.includes('Exit code') || l.includes('vite'));
                      console.log(errLines.slice(-30).join('\n'));
                   });
                });
             } else {
                console.log("No redirect for logs found.");
             }
          });
        }
      });
    });
  });
});
