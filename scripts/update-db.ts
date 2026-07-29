import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const del = await prisma.tradeJournal.deleteMany({ where: { symbol: 'NESTLEIND' } });
  console.log('Deleted NESTLEIND', del);
}
main().finally(() => prisma.$disconnect());
