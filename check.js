const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const results = await prisma.scannerResult.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' }
    });
    const reversals = results.filter(r => 
      r.signals && (r.signals.includes('KGS_ASC_REVERSAL') || r.signals.includes('KGS_DESC_REVERSAL'))
    );
    console.log("Found REVERSAL occurrences in recent scans:", reversals.length);
    if (reversals.length > 0) {
      console.log(reversals.map(r => ({ symbol: r.symbol, date: r.date, signals: r.signals })));
    } else {
      console.log("No reversal signals found in the last 100 scans.");
    }
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
