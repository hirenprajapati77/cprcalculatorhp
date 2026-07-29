const { execSync } = require('child_process');

try {
  const currentCrontab = execSync('crontab -l').toString();
  const lines = currentCrontab.split('\n').map(l => l.trim()).filter(l => l && !l.includes('earnings-populate'));
  
  // Add the correct, properly formatted line
  const newLine = '45 8 * * 1-5 curl -s -H "x-cron-secret: cpr-prod-token-v2-2026" http://localhost:3000/api/cron/earnings-populate >> /var/log/cpr-cron/earnings-populate.log 2>&1';
  lines.push(newLine);
  
  const fs = require('fs');
  fs.writeFileSync('temp-cron', lines.join('\n') + '\n');
  
  execSync('crontab temp-cron');
  fs.unlinkSync('temp-cron');
  
  console.log('Crontab successfully updated!');
  console.log(execSync('crontab -l').toString());
} catch (err) {
  console.error('Error updating crontab:', err);
}
