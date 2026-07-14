const fs = require('fs');
const crypto = require('crypto');

const envPath = '.env';
if (!fs.existsSync(envPath)) {
  console.log('No .env found.');
  process.exit(0);
}

let envContent = fs.readFileSync(envPath, 'utf8');

const newTokenKey = crypto.randomBytes(32).toString('hex');
const newCronSecret = crypto.randomBytes(16).toString('hex');

envContent = envContent.replace(
  /TOKEN_ENCRYPTION_KEY=".*"/, 
  `TOKEN_ENCRYPTION_KEY="${newTokenKey}"`
);

envContent = envContent.replace(
  /CRON_SECRET=".*"/, 
  `CRON_SECRET="${newCronSecret}"`
);

fs.writeFileSync(envPath, envContent);
console.log('Rotated TOKEN_ENCRYPTION_KEY and CRON_SECRET.');
