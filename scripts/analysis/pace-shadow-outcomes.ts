/**
 * READ-ONLY. Compare pace curve v1 (current) vs v2 (empirical) using archived "[PaceShadow]" lines.
 *
 *   npx tsx scripts/analysis/pace-shadow-outcomes.ts /home/ubuntu/pace-shadow.log
 *
 * Cohorts per symbol + date + direction: both versions would have confirmed, v1 only, v2 only.
 * Outcomes are close-to-trigger (official bhavcopy close in DailyOhlcv, series EQ; available after ~18:30 IST).
 * NOT a stop/target simulation. Lines logged before curve v2 shipped have no gainedV2 and are ignored.
 * Every event is a signal the LIVE system did not take (raw volume was below the bar).
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { parsePaceShadowLines, scoreShadowEvents, summarizeCohorts } from '../../src/lib/pace-shadow-outcomes';

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: npx tsx scripts/analysis/pace-shadow-outcomes.ts <log-file> [more...]');
    process.exit(2);
  }
  const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const { events, legacyLines, badLines } = parsePaceShadowLines(text);
  console.log(`Parsed ${events.length} version events; ${legacyLines} legacy (pre-v2) lines ignored; ${badLines} malformed.`);
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
    const scored = scoreShadowEvents(events, (s, d) => closeBy.get(`${s}|${d}`));
    console.log(`Scored ${scored.length} of ${events.length}; sessions: ${new Set(scored.map((e) => e.date)).size}`);

    const f = (x: number | null, d = 2) => (x === null ? '-' : x.toFixed(d));
    const pct = (x: number | null) => (x === null ? '-' : `${(x * 100).toFixed(0)}%`);
    console.table(
      summarizeCohorts(scored).map((r) => ({
        cohort: r.cohort,
        entry_from: r.version,
        n: r.n,
        mean_ret_pct: f(r.meanRetPct),
        median_ret_pct: f(r.medianRetPct),
        win_rate: pct(r.winRate),
        false_break_rate: pct(r.falseBreakRate),
        mean_minute: f(r.meanMinute, 0),
      }))
    );
    console.log('v1_only is the key row: signals only the current (inflated) curve would have confirmed.');
    console.log('Treat rows with n < 30 as anecdotal; do not change the flag or curve on < 10 sessions.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
