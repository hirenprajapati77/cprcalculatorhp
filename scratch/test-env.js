require('dotenv').config({ path: '/home/ubuntu/cpr-calculator-platform/.env' });
const db = process.env.DATABASE_URL ? 'SET' : 'MISSING';
const key = process.env.TOKEN_ENCRYPTION_KEY ? 'SET' : 'MISSING';
console.log('DATABASE_URL:', db);
console.log('TOKEN_ENCRYPTION_KEY:', key);
console.log('FYERS_APP_ID:', process.env.FYERS_APP_ID || 'MISSING');
