const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const duplicates = await prisma.$queryRaw`
    SELECT symbol, date, "eventType", COUNT(*) as count
    FROM "MarketEvent"
    GROUP BY symbol, date, "eventType"
    HAVING COUNT(*) > 1
  `;
  console.log('Duplicates:', duplicates);
}
main().finally(() => prisma.$disconnect());
