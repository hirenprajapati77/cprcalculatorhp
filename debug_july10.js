const { PrismaClient } = require('./cpr-calculator-platform/node_modules/@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const dateStr = '2026-07-10';
  const [y, m, d] = dateStr.split('-').map(Number);
  const midnightUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  midnightUTC.setUTCMinutes(midnightUTC.getUTCMinutes() - 330);
  
  const rows = await prisma.tradeJournal.findMany({
    where: { tradeDate: midnightUTC }
  });
  console.log('JULY 10 ROWS:', JSON.stringify(rows, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
