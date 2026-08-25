import { MultiYearBreakoutService } from '../../src/services/market-tools/multi-year-breakout.service';

async function main() {
  console.log('=== MULTI-YEAR BREAKOUT SCANNER PRODUCTION SANITY RUN ===');
  const start = Date.now();
  const report = await MultiYearBreakoutService.getBreakoutReport(true);
  const duration = Date.now() - start;

  console.log(`Report Date: ${report.date}`);
  console.log(`Trading Days Available: ${report.tradingDaysAvailable}`);
  console.log(`Total Symbols Scanned: ${report.totalScanned}`);
  console.log(`Breakout Counts:`, JSON.stringify(report.breakoutCounts, null, 2));
  console.log(`Window Availability:`, JSON.stringify(report.windowAvailability, null, 2));

  console.log('\n--- SAMPLE 1Y BREAKOUTS (Top 5 by gain) ---');
  const sample1Y = report.stocks
    .filter((s) => s.breakout1Y === true)
    .slice(0, 5)
    .map((s) => ({
      symbol: s.symbol,
      sector: s.sector,
      close: s.close,
      high1Y: s.high1Y,
      gain1YPct: `${s.gain1YPct}%`,
      strongest: s.strongestBreakout,
    }));
  console.table(sample1Y);

  console.log('\n--- SAMPLE ATH BREAKOUTS (Top 5 by gain) ---');
  const sampleATH = report.stocks
    .filter((s) => s.breakoutATH === true)
    .slice(0, 5)
    .map((s) => ({
      symbol: s.symbol,
      sector: s.sector,
      close: s.close,
      highATH: s.highATH,
      gainATHPct: `${s.gainATHPct}%`,
      strongest: s.strongestBreakout,
    }));
  console.table(sampleATH);

  console.log(`\nExecution completed in ${duration}ms.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
