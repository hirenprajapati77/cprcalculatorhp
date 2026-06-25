const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const latestResult = await prisma.scannerResult.findFirst({
    orderBy: { date: 'desc' }
  });
  if (!latestResult) {
    console.log("No scan results found.");
    return;
  }
  const latestDate = latestResult.date;
  console.log(`Latest scan date: ${latestDate}`);

  const results = await prisma.scannerResult.findMany({
    where: { date: latestDate }
  });

  console.log(`Total results on ${latestDate}: ${results.length}`);
  
  // We need to fetch the sector for each symbol from MarketSnapshot
  const symbols = results.map(r => r.symbol);
  const snapshots = await prisma.marketSnapshot.findMany({
    where: { symbol: { in: symbols } }
  });
  const sectorMap = {};
  for (const s of snapshots) {
    sectorMap[s.symbol] = s.sector;
  }

  for (const r of results) {
    const sector = sectorMap[r.symbol] || 'Other';
    console.log(`Symbol: ${r.symbol.padEnd(12)} | Sector: ${sector.padEnd(25)} | Score: ${String(r.score).padStart(3)} | Signals: ${r.signalSummary}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
