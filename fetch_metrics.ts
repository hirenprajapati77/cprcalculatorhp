import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const metrics = await prisma.backtestMetrics.findUnique({
    where: { backtestRunId: 'cmqukihwx00007wpkeopoj0hx' }
  });
  console.log('METRICS:', metrics);
}
main().finally(() => prisma.$disconnect());
