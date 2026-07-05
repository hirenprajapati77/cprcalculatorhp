require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const r = await p.brokerToken.findFirst({ where: { broker: 'fyers' }, orderBy: { updatedAt: 'desc' } });
  if (!r) {
    console.log('No token found in DB');
  } else {
    console.log('updatedAt:', r.updatedAt);
    console.log('expiresAt:', r.expiresAt);
    console.log('token first 30 chars:', r.accessToken.substring(0, 30));
    console.log('token has colons (encrypted format):', r.accessToken.includes(':'));
    // Try to decrypt
    const { decrypt } = require('./src/lib/crypto');
    try {
      const decrypted = decrypt(r.accessToken);
      console.log('Decrypted token first 20 chars:', decrypted.substring(0, 20));
      console.log('SUCCESS - token decrypts fine');
    } catch(e) {
      console.log('DECRYPT FAILED:', e.message);
    }
  }
  await p.$disconnect();
}

main();
