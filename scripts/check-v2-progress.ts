import { prisma } from '../src/lib/db';

async function main() {
  console.log('--- V2 Shadow Scoring Progress ---');

  // We consider a trade "closed" if it has an exit price (exitCmp is populated by the journal exit tracker)
  
  const allV2Logs = await prisma.tradeJournal.findMany({
    where: {
      scoreV2: { not: null }
    }
  });

  const totals = {
    'ELITE_INSTITUTIONAL': { logged: 0, closed: 0 },
    'PRODUCTION_ALERT': { logged: 0, closed: 0 },
    'WATCHLIST': { logged: 0, closed: 0 },
    'MANUAL_REVIEW': { logged: 0, closed: 0 },
    'REJECT': { logged: 0, closed: 0 }
  };

  for (const row of allV2Logs) {
    const score = row.scoreV2!;
    const v2Breakdown = (typeof row.v2Breakdown === 'string' ? JSON.parse(row.v2Breakdown) : row.v2Breakdown) as any;
    const classification = v2Breakdown?.classification || 'REJECT';
    
    if (totals[classification as keyof typeof totals]) {
      totals[classification as keyof typeof totals].logged++;
    }
    if (row.exitCmp !== null) {
      totals[classification as keyof typeof totals].closed++;
    }
  }

  console.log(`Total V2 Signals Logged: ${allV2Logs.length}`);
  console.log('');
  console.log('--- Breakdown by Classification ---');
  for (const [tier, counts] of Object.entries(totals)) {
    console.log(`${tier.padEnd(20)} | Logged: ${counts.logged.toString().padStart(4)} | Closed (Next Day Reached): ${counts.closed.toString().padStart(4)}`);
  }
  console.log('');
  
  const eliteClosed = totals['ELITE_INSTITUTIONAL'].closed;
  if (eliteClosed >= 15) {
    console.log(`[READY] The ELITE_INSTITUTIONAL band has reached MIN_SAMPLE=15 (${eliteClosed}). You can run a preliminary outcome analysis.`);
  } else {
    console.log(`[WAIT] ELITE_INSTITUTIONAL closed trades: ${eliteClosed} / 15 required for preliminary significance.`);
  }

}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
