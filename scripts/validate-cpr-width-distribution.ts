/**
 * CPR Width Distribution Validation Script
 * ----------------------------------------
 * Validates the CPR width classification thresholds across historical DailyOhlcv bars.
 *
 * Compares two classification methods:
 *  1. Fixed fallback: NARROW < 0.3%, NORMAL < 0.8%, WIDE >= 0.8%
 *  2. ATR-aware:      NARROW < 0.15 * ATR% * 100, NORMAL < 0.40 * ATR% * 100, WIDE >= 0.40 * ATR% * 100
 *
 * Reads only from DailyOhlcv (no writes). Safe to run against local dev DB or production.
 *
 * Usage:
 *   npx tsx scripts/validate-cpr-width-distribution.ts
 *
 * Env required:
 *   DATABASE_URL (postgresql://...)
 */

import { prisma } from '@/lib/db';
import { calculateCPR, classifyCprWidth } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';

interface Distribution {
  narrow: number;
  normal: number;
  wide: number;
}

function zeroed(): Distribution {
  return { narrow: 0, normal: 0, wide: 0 };
}

function bucket(d: Distribution, cls: 'NARROW' | 'NORMAL' | 'WIDE'): void {
  if (cls === 'NARROW') d.narrow++;
  else if (cls === 'NORMAL') d.normal++;
  else d.wide++;
}

async function main() {
  console.log('Fetching distinct EQ symbols from DailyOhlcv...');
  const symbols = await prisma.dailyOhlcv.findMany({
    where: { series: 'EQ' },
    distinct: ['symbol'],
    select: { symbol: true },
  });

  console.log(`Found ${symbols.length} symbols.\n`);

  let totalBars = 0;
  const fixed = zeroed();
  const atrAware = zeroed();

  for (const { symbol } of symbols) {
    const candles = await prisma.dailyOhlcv.findMany({
      where: { symbol, series: 'EQ' },
      orderBy: { date: 'asc' },
      select: { date: true, open: true, high: true, low: true, close: true, volume: true },
    });

    // Need at least 20 candles: 15 for ATR history + current bar
    if (candles.length < 20) {
      continue;
    }

    for (let i = 15; i < candles.length; i++) {
      const priorHistory = candles.slice(0, i);
      const yesterday = candles[i - 1];

      const atrPct = getAtrPct(priorHistory, yesterday.close);
      const cpr = calculateCPR(
        {
          high: yesterday.high,
          low: yesterday.low,
          close: yesterday.close,
        },
        atrPct
      );

      const widthPct = cpr.width;

      // Method 1: Fixed % fallback thresholds
      const fixedCls = classifyCprWidth(widthPct, undefined);
      bucket(fixed, fixedCls);

      // Method 2: ATR-aware thresholds (current production logic)
      const atrCls = classifyCprWidth(widthPct, atrPct);
      bucket(atrAware, atrCls);

      totalBars++;
    }
  }

  const pct = (n: number) => (totalBars > 0 ? ((n / totalBars) * 100).toFixed(2) : '0.00');

  console.log('================ CPR WIDTH DISTRIBUTION SUMMARY ================');
  console.log(`Total Evaluated Daily Bars: ${totalBars.toLocaleString()}`);
  console.log('');
  console.log('1. Fixed Fallback (< 0.3% / < 0.8%):');
  console.log(`   NARROW : ${fixed.narrow.toLocaleString().padStart(10)} (${pct(fixed.narrow)}%)`);
  console.log(`   NORMAL : ${fixed.normal.toLocaleString().padStart(10)} (${pct(fixed.normal)}%)`);
  console.log(`   WIDE   : ${fixed.wide.toLocaleString().padStart(10)} (${pct(fixed.wide)}%)`);
  console.log('');
  console.log('2. ATR-Aware (0.15 * ATR% * 100 / 0.40 * ATR% * 100):');
  console.log(`   NARROW : ${atrAware.narrow.toLocaleString().padStart(10)} (${pct(atrAware.narrow)}%)`);
  console.log(`   NORMAL : ${atrAware.normal.toLocaleString().padStart(10)} (${pct(atrAware.normal)}%)`);
  console.log(`   WIDE   : ${atrAware.wide.toLocaleString().padStart(10)} (${pct(atrAware.wide)}%)`);
  console.log('=================================================================\n');

  // Heuristic flag: if ATR-aware classifies > 90% as NARROW, thresholds may be too permissive
  const narrowRatio = totalBars > 0 ? atrAware.narrow / totalBars : 0;
  if (narrowRatio > 0.90) {
    console.warn(
      `⚠️  WARNING: ${(narrowRatio * 100).toFixed(1)}% of bars classified NARROW under ATR-aware thresholds. ` +
      'Consider reviewing 0.15 * ATR% * 100 threshold.'
    );
  } else if (narrowRatio < 0.10) {
    console.warn(
      `⚠️  WARNING: Only ${(narrowRatio * 100).toFixed(1)}% of bars classified NARROW under ATR-aware thresholds. ` +
      'Thresholds may be too strict.'
    );
  } else {
    console.log('✅ NARROW distribution within expected range (10%–90%).');
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
