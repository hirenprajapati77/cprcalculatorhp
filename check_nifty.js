const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const snaps = await prisma.marketSnapshot.findMany({
    where: { symbol: { contains: 'NIFTY' } }
  });
  console.log('NIFTY SNAPSHOTS:', JSON.stringify(snaps, null, 2));

  const signals = await prisma.overnightSignal.findMany({
    where: { symbol: { contains: 'NIFTY' } },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('NIFTY OVERNIGHT SIGNALS:', JSON.stringify(signals, null, 2));

  await prisma['']();
}
run();
