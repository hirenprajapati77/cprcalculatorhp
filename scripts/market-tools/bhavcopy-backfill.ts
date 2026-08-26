import { runBhavcopyIngest } from './bhavcopy-ingest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BackfillSummary {
  startDate: string;
  endDate: string;
  totalDatesProcessed: number;
  successfulDates: number;
  skippedDates: number;
  failedDates: number;
  totalRowsInserted: number;
  dateStats: Array<{
    date: string;
    rowsInserted: number;
    peakRssMb: number;
    durationMs: number;
    status: 'INGESTED' | 'SKIPPED_EXISTS' | 'HOLIDAY_404' | 'FAILED';
    reason?: string;
  }>;
  totalWallClockMs: number;
  avgDurationPerDateMs: number;
  extrapolated250DaysMinutes: number;
}

export async function runBhavcopyBackfill(
  startDateStr: string,
  endDateStr: string,
  courtesyDelayMs: number = 300
): Promise<BackfillSummary> {
  const wallClockStart = Date.now();
  const dateList = generateDateRange(startDateStr, endDateStr);

  console.log(
    `[BhavcopyBackfill] Starting backfill range: ${startDateStr} to ${endDateStr} (${dateList.length} calendar dates)`
  );

  const stats: BackfillSummary['dateStats'] = [];
  let successfulDates = 0;
  let skippedDates = 0;
  let failedDates = 0;
  let totalRowsInserted = 0;

  for (let i = 0; i < dateList.length; i++) {
    const dateStr = dateList[i]!;

    // Proactively skip weekends (0 = Sunday, 6 = Saturday)
    const dateObj = new Date(dateStr + 'T00:00:00Z');
    const dayOfWeek = dateObj.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`[BhavcopyBackfill] Skipping ${dateStr} (Weekend)`);
      stats.push({
        date: dateStr,
        rowsInserted: 0,
        peakRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
        durationMs: 0,
        status: 'SKIPPED_EXISTS',
        reason: 'Weekend',
      });
      skippedDates++;
      continue;
    }

    // Resumability check: Safe raw query checking if date already exists in DailyOhlcv
    let existingCount = 0;
    try {
      const res = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint FROM "DailyOhlcv" WHERE date = ${dateStr}
      `;
      existingCount = Number(res[0]?.count || 0);
    } catch (e) {
      existingCount = 0;
    }

    if (existingCount > 2000) {
      console.log(`[BhavcopyBackfill] Skipping ${dateStr} (Already ingested: ${existingCount} rows)`);
      stats.push({
        date: dateStr,
        rowsInserted: existingCount,
        peakRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
        durationMs: 0,
        status: 'SKIPPED_EXISTS',
        reason: `Already exists (${existingCount} rows)`,
      });
      skippedDates++;
      continue;
    }

    // Ingest date
    const res = await runBhavcopyIngest(dateStr);

    if (res.success && res.rowsInserted > 0) {
      successfulDates++;
      totalRowsInserted += res.rowsInserted;
      stats.push({
        date: dateStr,
        rowsInserted: res.rowsInserted,
        peakRssMb: res.peakRssMb,
        durationMs: res.durationMs,
        status: 'INGESTED',
      });
    } else if (res.success && res.rowsInserted === 0) {
      skippedDates++;
      stats.push({
        date: dateStr,
        rowsInserted: 0,
        peakRssMb: res.peakRssMb,
        durationMs: res.durationMs,
        status: 'HOLIDAY_404',
        reason: res.error || 'No trading data (Holiday/404)',
      });
    } else {
      failedDates++;
      stats.push({
        date: dateStr,
        rowsInserted: 0,
        peakRssMb: res.peakRssMb,
        durationMs: res.durationMs,
        status: 'FAILED',
        reason: res.error,
      });
    }

    // Courtesy delay between requests
    if (i < dateList.length - 1 && courtesyDelayMs > 0) {
      await delay(courtesyDelayMs);
    }
  }

  const totalWallClockMs = Date.now() - wallClockStart;
  const processedOrIngested = successfulDates + failedDates;
  const avgDurationPerDateMs =
    processedOrIngested > 0 ? Math.round(totalWallClockMs / processedOrIngested) : 0;
  const extrapolated250DaysMinutes =
    Math.round((((avgDurationPerDateMs + courtesyDelayMs) * 250) / 1000 / 60) * 100) / 100;

  console.log(
    `[BhavcopyBackfill] COMPLETE: totalDates=${dateList.length}, successful=${successfulDates}, ` +
      `skipped=${skippedDates}, failed=${failedDates}, totalRowsInserted=${totalRowsInserted}, ` +
      `wallClockMs=${totalWallClockMs}ms, est250Days=${extrapolated250DaysMinutes}min`
  );

  await prisma.$disconnect();

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    totalDatesProcessed: dateList.length,
    successfulDates,
    skippedDates,
    failedDates,
    totalRowsInserted,
    dateStats: stats,
    totalWallClockMs,
    avgDurationPerDateMs,
    extrapolated250DaysMinutes,
  };
}

function generateDateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const curr = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr + 'T00:00:00Z');

  while (curr <= end) {
    dates.push(curr.toISOString().split('T')[0]!);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return dates;
}

// ── CLI Execution ─────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].includes('bhavcopy-backfill')) {
  const startDate = process.argv[2] || '2026-08-07';
  const endDate = process.argv[3] || '2026-08-21';

  runBhavcopyBackfill(startDate, endDate)
    .then((summary) => {
      console.log('\n=== STAGE 1 BACKFILL SUMMARY ===');
      console.log(JSON.stringify(summary, null, 2));
      process.exit(summary.failedDates === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error('[BhavcopyBackfill CLI Error]', err);
      process.exit(1);
    });
}
