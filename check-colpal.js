const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const colpal = await prisma.tradeJournal.findMany({ where: { symbol: 'COLPAL' }, orderBy: { tradeDate: 'desc' }, take: 1 });
  console.log(colpal);
}
main().finally(() => prisma.$disconnect());
