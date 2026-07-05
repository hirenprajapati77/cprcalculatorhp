const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '/home/ubuntu/cpr-calculator-platform/.env' });

async function main() {
  const p = new PrismaClient();
  const today = new Date();
  today.setHours(0,0,0,0);
  
  console.log('Deleting trade journal entries created today...');
  const res = await p.tradeJournal.deleteMany({
    where: {
      tradeDate: {
        gte: today
      }
    }
  });
  console.log('Deleted entries count:', res.count);
  await p.$disconnect();
}

main().catch(console.error);
