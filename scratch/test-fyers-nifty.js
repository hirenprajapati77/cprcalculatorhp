const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config({ path: '/home/ubuntu/cpr-calculator-platform/.env' });

function getKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY missing');
  return crypto.createHash('sha256').update(secret).digest();
}

function decrypt(ciphertext) {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedText).toString('utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function main() {
  const p = new PrismaClient();
  const r = await p.brokerToken.findFirst({ where: { broker: 'fyers' }, orderBy: { updatedAt: 'desc' } });
  if (!r) {
    console.error('No token in DB');
    await p.$disconnect();
    return;
  }

  const token = decrypt(r.accessToken);
  const appId = process.env.FYERS_APP_ID;

  // Let's call Fyers Option Chain API directly for NIFTY
  const url = 'https://api-t1.fyers.in/data/options-chain-v3?symbol=NSE:NIFTY-INDEX&strikecount=30';
  console.log('Fetching options-chain from:', url);

  const res = await fetch(url, {
    headers: {
      'Authorization': `${appId}:${token}`,
      'Accept': 'application/json'
    }
  });

  const data = await res.json();
  console.log('NIFTY Expiry Data:', data.data?.expiryData);
  
  if (data.data?.optionsChain) {
    const options = data.data.optionsChain.filter(o => o.strike_price !== -1);
    console.log('First 5 NIFTY options items:', options.slice(0, 5).map(o => ({
      symbol: o.symbol,
      ltp: o.ltp
    })));
  }

  await p.$disconnect();
}

main().catch(console.error);
