import AdmZip from 'adm-zip';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export interface IngestResult {
  date: string;
  success: boolean;
  rowsProcessed: number;
  rowsInserted: number;
  rowsSkipped: number;
  peakRssMb: number;
  durationMs: number;
  error?: string;
}

export async function runBhavcopyIngest(targetDateStr?: string): Promise<IngestResult> {
  let peakRssBytes = 0;
  const memInterval = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peakRssBytes) {
      peakRssBytes = rss;
    }
  }, 100);

  const startTime = Date.now();
  const dateStr = targetDateStr || getLatestTradingDateStr();
  const yyyymmdd = dateStr.replace(/-/g, '');
  const url = `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${yyyymmdd}_F_0000.csv.zip`;

  console.log(`[BhavcopyIngest] Starting ingestion for ${dateStr} from: ${url}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 404) {
      console.warn(`[BhavcopyIngest] No Bhavcopy file found for ${dateStr} (HTTP 404 - weekend/holiday).`);
      return {
        date: dateStr,
        success: true,
        rowsProcessed: 0,
        rowsInserted: 0,
        rowsSkipped: 0,
        peakRssMb: Math.round((peakRssBytes / 1024 / 1024) * 100) / 100,
        durationMs: Date.now() - startTime,
        error: 'HTTP 404 (non-trading day)',
      };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    if (zipEntries.length === 0) {
      throw new Error('Zip archive contains no entries');
    }

    const csvEntry = zipEntries[0];
    if (!csvEntry) {
      throw new Error('Zip entry undefined');
    }

    const csvText = csvEntry.getData().toString('utf-8');
    const lines = csvText.split(/\r?\n/);

    if (lines.length <= 1) {
      throw new Error('CSV file empty or header-only');
    }

    const headerLine = lines[0]!;
    const headers = headerLine.split(',').map((h) => h.trim());
    const colIndex = buildColumnIndex(headers);

    let rowsProcessed = 0;
    let rowsInserted = 0;
    let rowsSkipped = 0;

    const BATCH_SIZE = 250;
    const batchMap = new Map<string, Record<string, unknown>>();

    await prisma.$transaction(async (tx) => {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (!line) continue;

        const cols = line.split(',');
        if (cols.length < 15) {
          rowsSkipped++;
          continue;
        }

        // Filter: Only equity segment ('STK') instruments.
        // B17 fix: removed `|| series !== 'EQ'` here — it incorrectly hard-dropped
        // BE (Trade-to-Trade) and SM (SME) series stocks before the deduplication
        // logic could run. The dedup block below prefers EQ over BE/SM when both
        // exist for the same symbol; without this fix, that block was dead code
        // and BE/SM stocks were permanently excluded from ingestion.
        const finInstrmTp = getCol(cols, colIndex.FinInstrmTp);
        const series = getCol(cols, colIndex.SctySrs);
        if (finInstrmTp && finInstrmTp !== 'STK') {
          rowsSkipped++;
          continue;
        }

        const symbol = getCol(cols, colIndex.TckrSymb);
        const open = parseFloat(getCol(cols, colIndex.OpnPric) || '0');
        const high = parseFloat(getCol(cols, colIndex.HghPric) || '0');
        const low = parseFloat(getCol(cols, colIndex.LwPric) || '0');
        const close = parseFloat(getCol(cols, colIndex.ClsPric) || '0');
        const prevClose = parseFloat(getCol(cols, colIndex.PrvsClsgPric) || '0');
        const volumeStr = getCol(cols, colIndex.TtlTradgVol) || '0';
        const parsedVol = parseFloat(volumeStr);
        const volume = BigInt(isNaN(parsedVol) ? 0 : Math.floor(parsedVol));
        const valueStr = getCol(cols, colIndex.TtlTrfVal);
        const parsedVal = valueStr ? parseFloat(valueStr) : null;
        const value = parsedVal !== null && !isNaN(parsedVal) ? parsedVal : null;
        const tradesStr = getCol(cols, colIndex.TtlNbOfTxsExctd);
        const parsedTrades = tradesStr ? parseInt(tradesStr, 10) : null;
        const trades = parsedTrades !== null && !isNaN(parsedTrades) ? parsedTrades : null;
        const isin = getCol(cols, colIndex.ISIN) || null;

        if (!symbol || close <= 0 || [open, high, low, close].some(isNaN)) {
          rowsSkipped++;
          continue;
        }

        rowsProcessed++;
        const key = `${symbol}_${dateStr}`;

        // Deduplication within same date: prefer EQ series over BE/SM
        if (batchMap.has(key)) {
          const existing = batchMap.get(key)!;
          if (existing.series !== 'EQ' && series === 'EQ') {
            batchMap.set(key, {
              id: key, symbol, date: dateStr, open, high, low, close, prevClose, volume, value, trades, series, isin
            });
          }
        } else {
          batchMap.set(key, {
            id: key, symbol, date: dateStr, open, high, low, close, prevClose, volume, value, trades, series, isin
          });
        }

        if (batchMap.size >= BATCH_SIZE) {
          const items = Array.from(batchMap.values());
          await upsertBatch(items, tx);
          rowsInserted += items.length;
          batchMap.clear();
        }
      }

      if (batchMap.size > 0) {
        const items = Array.from(batchMap.values());
        await upsertBatch(items, tx);
        rowsInserted += items.length;
        batchMap.clear();
      }
    }, { timeout: 300000 });

    const durationMs = Date.now() - startTime;
    const peakRssMb = Math.round((peakRssBytes / 1024 / 1024) * 100) / 100;

    console.log(
      `[BhavcopyIngest] SUCCESS: date=${dateStr}, rowsProcessed=${rowsProcessed}, ` +
      `rowsInserted=${rowsInserted}, rowsSkipped=${rowsSkipped}, peakRssMb=${peakRssMb}MB, durationMs=${durationMs}ms`
    );

    return {
      date: dateStr,
      success: true,
      rowsProcessed,
      rowsInserted,
      rowsSkipped,
      peakRssMb,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const peakRssMb = Math.round((peakRssBytes / 1024 / 1024) * 100) / 100;
    const errorMsg = err instanceof Error ? err.message : String(err);

    console.error(`[BhavcopyIngest] ERROR for ${dateStr}: ${errorMsg}`);
    return {
      date: dateStr,
      success: false,
      rowsProcessed: 0,
      rowsInserted: 0,
      rowsSkipped: 0,
      peakRssMb,
      durationMs,
      error: errorMsg,
    };
  } finally {
    clearInterval(memInterval);
  }
}

function getCol(cols: string[], idx: number): string {
  if (idx < 0 || idx >= cols.length) return '';
  return cols[idx]?.trim() || '';
}

function buildColumnIndex(headers: string[]) {
  return {
    FinInstrmTp: headers.indexOf('FinInstrmTp'),
    TckrSymb: headers.indexOf('TckrSymb'),
    OpnPric: headers.indexOf('OpnPric'),
    HghPric: headers.indexOf('HghPric'),
    LwPric: headers.indexOf('LwPric'),
    ClsPric: headers.indexOf('ClsPric'),
    PrvsClsgPric: headers.indexOf('PrvsClsgPric'),
    TtlTradgVol: headers.indexOf('TtlTradgVol'),
    TtlTrfVal: headers.indexOf('TtlTrfVal'),
    TtlNbOfTxsExctd: headers.indexOf('TtlNbOfTxsExctd'),
    SctySrs: headers.indexOf('SctySrs'),
    ISIN: headers.indexOf('ISIN'),
  };
}

/**
 * Perform bulk raw SQL upsert using Postgres ON CONFLICT (symbol, date) DO UPDATE SET ...
 * Uses Prisma.sql tagged template literal for full parameterization — no string interpolation
 * on user-derived data. Guarantees authoritative overwrite if re-run for a date (idempotent).
 */
async function upsertBatch(
  items: Record<string, unknown>[],
  tx: PrismaClient | Prisma.TransactionClient = prisma
): Promise<void> {
  if (items.length === 0) return;

  // Build one parameterized VALUES row per item and combine with Prisma.join.
  // Prisma.sql automatically escapes every interpolated value as a query parameter.
  const rows = items.map((r) =>
    Prisma.sql`(
      ${String(r.id)},
      ${String(r.symbol)},
      ${String(r.date)},
      ${Number(r.open)},
      ${Number(r.high)},
      ${Number(r.low)},
      ${Number(r.close)},
      ${Number(r.prevClose)},
      ${BigInt(String(r.volume))}::bigint,
      ${r.value === null ? null : Number(r.value)},
      ${r.trades === null ? null : Number(r.trades)},
      ${String(r.series)},
      ${r.isin === null ? null : String(r.isin)},
      NOW()
    )`
  );

  await tx.$executeRaw`
    INSERT INTO "DailyOhlcv"
      (id, symbol, date, open, high, low, close, "prevClose", volume, value, trades, series, isin, "createdAt")
    VALUES ${Prisma.join(rows)}
    ON CONFLICT (symbol, date) DO UPDATE SET
      open        = EXCLUDED.open,
      high        = EXCLUDED.high,
      low         = EXCLUDED.low,
      close       = EXCLUDED.close,
      "prevClose" = EXCLUDED."prevClose",
      volume      = EXCLUDED.volume,
      value       = EXCLUDED.value,
      trades      = EXCLUDED.trades,
      series      = EXCLUDED.series,
      isin        = EXCLUDED.isin
  `;
}

/** @deprecated No longer needed — replaced by Prisma parameterization. */
function escapeSql(val: string): string {
  return val.replace(/'/g, "''");
}

function getLatestTradingDateStr(): string {
  // IST = UTC+5:30. Shift by 5h30m so we can safely use UTC date getters.
  const d = new Date();
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);

  // If run before 18:30 IST, default to yesterday's bhavcopy
  if (ist.getUTCHours() < 18 || (ist.getUTCHours() === 18 && ist.getUTCMinutes() < 30)) {
    ist.setUTCDate(ist.getUTCDate() - 1);
  }
  // Skip weekends (0 = Sunday, 6 = Saturday in IST)
  if (ist.getUTCDay() === 0) ist.setUTCDate(ist.getUTCDate() - 2); // Sun -> Fri
  if (ist.getUTCDay() === 6) ist.setUTCDate(ist.getUTCDate() - 1); // Sat -> Fri

  return ist.toISOString().split('T')[0]!;
}

// ── CLI Direct Invocation ──────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].includes('bhavcopy-ingest')) {
  const argDate = process.argv[2];
  runBhavcopyIngest(argDate)
    .then((res) => {
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('[BhavcopyIngest CLI Error]', err);
      process.exit(1);
    });
}
