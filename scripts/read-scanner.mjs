import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgrespassword@localhost:5433/cpr_pro?schema=public' } } });
async function main() {
  const sr = await prisma.scannerResult.findMany({ where: { symbol: 'RADICO' }, orderBy: { id: 'desc' }, take: 1 });
  console.log(JSON.stringify(sr, null, 2));
}
main().finally(() => prisma.$disconnect());
