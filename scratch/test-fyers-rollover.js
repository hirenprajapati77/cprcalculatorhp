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

  // Let's try different parameters for options-chain-v3 rollover
  const testUrls = [
    'https://api-t1.fyers.in/data/options-chain-v3?symbol=NSE:DRREDDY-EQ&strikecount=30&timestamp=1785232800',
    'https://api-t1.fyers.in/data/options-chain-v3?symbol=NSE:DRREDDY-EQ&strikecount=30&timestamp=1782813600'
  ];

  for (const url of testUrls) {
    console.log('\n----------------------------------------');
    console.log('Testing URL:', url);
    const res = await fetch(url, {
      headers: {
        'Authorization': `${appId}:${token}`,
        'Accept': 'application/json'
      }
    });
    console.log('Response HTTP Status:', res.status);
    const data = await res.json();
    console.log('Response s:', data.s, '| message:', data.message);
    if (data.data?.optionsChain) {
      console.log('SUCCESS! optionsChain length:', data.data.optionsChain.length);
    }
  }

  await p.$disconnect();
}

main().catch(console.error);
