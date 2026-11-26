/**
 * READ-ONLY. ORB follow-through by time of day.
 *
 *   npx tsx scripts/analysis/orb-outcomes.ts <pm2-out-log> [more logs...]
 *
 * Reads "[OrbEvent]" lines (first trigger per symbol/day/direction, logged regardless of the
 * 11:30 cut-off), joins each to the day's official close in DailyOhlcv (series EQ, bhavcopy; only
 * available after ~18:30 IST), and prints return / R by time-of-day bucket.
 * Close-to-trigger follow-through only: NOT a stop/target simulation.
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { parseOrbEventLines, scoreOrbEvent, summarizeByBucket, type ScoredOrbEvent } from '../../src/lib/orb-outcomes';

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: npx tsx scripts/analysis/orb-outcomes.ts <log-file> [more...]');
    process.exit(2);
  }
  const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const events = parseOrbEventLines(text);
  console.log(`Parsed ${events.length} unique ORB events (first per symbol/date/direction).`);
  if (events.length === 0) return;

  const prisma = new PrismaClient();
  try {
    const dates = [...new Set(events.map((e) => e.date))];
    const symbols = [...new Set(events.map((e) => e.symbol))];
    const rows = await prisma.dailyOhlcv.findMany({
      where: { series: 'EQ', date: { in: dates }, symbol: { in: symbols } },
      select: { symbol: true, date: true, close: true },
    });
    const closeBy = new Map(rows.map((r) => [`${r.symbol}|${r.date}`, r.close]));

    const scored: ScoredOrbEvent[] = [];
    let missing = 0;
    for (const e of events) {
      const close = closeBy.get(`${e.symbol}|${e.date}`);
      const s = close ? scoreOrbEvent(e, close) : null;
      if (s) scored.push(s);
      else missing++;
    }
    console.log(`Scored ${scored.length}; ${missing} without a close yet (bhavcopy not ingested).`);
    console.log(`Sessions: ${new Set(scored.map((e) => e.date)).size}`);

    const fmt = (x: number | null, d = 2) => (x === null ? '-' : x.toFixed(d));
    console.table(
      summarizeByBucket(scored).map((b) => ({
        bucket: b.bucket,
        n: b.n,
        mean_ret_pct: fmt(b.meanRetPct),
        median_ret_pct: fmt(b.medianRetPct),
        win_rate: b.winRate === null ? '-' : `${(b.winRate * 100).toFixed(0)}%`,
        mean_R: fmt(b.meanR),
      }))
    );
    console.log('Treat buckets with n < 30 as anecdotal; do not change the cut-off on < 10 sessions.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
