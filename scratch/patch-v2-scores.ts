import { prisma } from '../src/lib/db';
import { MarketService } from '../src/services/market.service';
import { BtstService } from '../src/services/backtest/btst.service';

async function main() {
  // Get IST date string (YYYY-MM-DD)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const today = istDate.toISOString().slice(0, 10);

  console.log(`Patching V2 scores for tradeDate: ${today}`);

  // TradeJournal stores dates in UTC as the start of the IST day
  // i.e., 10 Jul IST = 09 Jul 18:30:00 UTC
  // So we query: tradeDate = yesterday UTC date at 18:30:00
  const startOfDay = new Date(`${today}T00:00:00.000+05:30`); // 10 Jul 00:00 IST
  const endOfDay = new Date(`${today}T23:59:59.999+05:30`);   // 10 Jul 23:59 IST

  console.log(`UTC range: ${startOfDay.toISOString()} → ${endOfDay.toISOString()}`);
  // Find today's journal entries where scoreV2 is 0 or null
  const entries = await prisma.tradeJournal.findMany({
    where: {
      tradeDate: { gte: startOfDay, lte: endOfDay },
      OR: [{ scoreV2: 0 }, { scoreV2: null }],
    },
    select: { id: true, symbol: true, scoreV2: true },
  });

  console.log(`Found ${entries.length} entries to patch:`, entries.map(e => e.symbol));

  for (const entry of entries) {
    try {
      const stock = await MarketService.getStockData(entry.symbol);
      if (!stock) {
        console.warn(`  ${entry.symbol}: no market data, skipping`);
        continue;
      }

      const v2 = BtstService.evaluateOvernightV2(stock);
      const newScore = v2.finalScore;

      await prisma.tradeJournal.update({
        where: { id: entry.id },
        data: {
          scoreV2: newScore,
          v2Breakdown: {
            hardGates: v2.hardGates,
            scoreBreakdown: v2.scoreBreakdown,
          },
        },
      });

      console.log(`  ✓ ${entry.symbol}: ${entry.scoreV2} → ${newScore} (${JSON.stringify(v2.scoreBreakdown)})`);
    } catch (err) {
      console.error(`  ✗ ${entry.symbol}: error`, err);
    }
  }

  console.log('Done.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
