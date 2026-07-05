require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const tokenRecord = await prisma.brokerToken.findFirst({ where: { broker: 'fyers' }, orderBy: { updatedAt: 'desc' } });
  
  if (!tokenRecord) { console.log('No token found'); return; }
  console.log('Token updated at:', tokenRecord.updatedAt);
}
run();
