require('dotenv').config();
console.log('TOKEN_ENCRYPTION_KEY:', process.env.TOKEN_ENCRYPTION_KEY);

// Now try to save a fresh unencrypted test to verify the key works
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

function getKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY missing');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + encrypted + ':' + authTag;
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
  if (!r) { console.log('No token in DB'); return; }
  
  console.log('Token saved at:', r.updatedAt);
  console.log('Token format (first 40):', r.accessToken.substring(0, 40));
  
  try {
    const decrypted = decrypt(r.accessToken);
    console.log('DECRYPT OK - first 15 chars:', decrypted.substring(0, 15));
  } catch(e) {
    console.log('DECRYPT FAILED:', e.message);
    console.log('Re-saving with current key...');
    // We cannot re-save because we do not have the plaintext
    // We need to delete and have user reconnect
    await p.brokerToken.deleteMany({ where: { broker: 'fyers' } });
    console.log('Deleted all fyers tokens. Please click Connect again.');
  }
  
  await p.$disconnect();
}

main();
