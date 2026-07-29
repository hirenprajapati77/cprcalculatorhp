import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgrespassword@localhost:5433/cpr_pro?schema=public' } } });
async function main() {
  const del = await prisma.tradeJournal.deleteMany({ where: { symbol: 'NESTLEIND' } });
  console.log('Deleted NESTLEIND', del);
}
main().finally(() => prisma.$disconnect());
