import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const records = await prisma.tradeJournal.findMany({ where: { tradeDate: new Date(Date.UTC(2026, 6, 27, 18, 30, 0)) } });
  console.log(records);
}
main().finally(() => prisma.$disconnect());
