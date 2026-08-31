const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('=== BSE SCANNER RESULTS AUG 21 ===');
  const scans = await prisma.scannerResult.findMany({
    where: { symbol: { contains: 'BSE' }, date: '2026-08-21' }
  });
  console.log(JSON.stringify(scans, null, 2));

  await prisma['']();
}

run();
