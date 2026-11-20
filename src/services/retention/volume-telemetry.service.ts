import { prisma } from '@/lib/db';
import { getISTTime, getISTDateString } from '@/lib/market-hours';
import type { MarketStockData } from '@/services/market.service';
import type { RangeProvenance } from '@/lib/range-provenance';

export interface VolumeTelemetryRow {
  symbol: string;
  date: string;
  minuteOfDay: number;
  sessionVolume: bigint;
  avgVolume: bigint;
  rawRatio: number;
  rangeProvenance: RangeProvenance;
}

export interface VolumeTelemetryPrismaClient {
  volumeTelemetry: {
    createMany: (args: { data: VolumeTelemetryRow[]; skipDuplicates?: boolean }) => Promise<{ count: number }>;
    findMany: (args: {
      where: { date: { lt: string } };
      select: { id: true };
      take: number;
      orderBy: { id: 'asc' };
    }) => Promise<Array<{ id: number }>>;
    deleteMany: (args: { where: { id: { in: number[] } } }) => Promise<{ count: number }>;
  };
}

export class VolumeTelemetryService {
  /**
   * Builds telemetry rows from scanned stock data.
   * Only includes stocks with avgVolume > 0.
   */
  static buildRows(
    stocks: MarketStockData[],
    now: Date = new Date(),
    asOfDate?: string
  ): VolumeTelemetryRow[] {
    const { totalMinutes, dateString } = getISTTime(now);
    const date = asOfDate ?? dateString;

    const rows: VolumeTelemetryRow[] = [];
    for (const stock of stocks) {
      if (!stock.symbol) continue;
      const rawAvg = typeof stock.avgVolume === 'number' && Number.isFinite(stock.avgVolume)
        ? stock.avgVolume : 0;
      if (rawAvg <= 0) continue; // Skip zero / missing avgVolume (prevents invalid / infinite ratio)
      const avgVol = Math.max(0, Math.round(rawAvg));
      if (avgVol <= 0) continue;

      const rawSession = typeof stock.volume === 'number' && Number.isFinite(stock.volume)
        ? stock.volume : 0;
      const sessionVol = Math.max(0, Math.round(rawSession));
      const rawRatio = avgVol > 0 ? Number((sessionVol / rawAvg).toFixed(4)) : 0;
      const provenance: RangeProvenance = stock.rangeProvenance ?? 'STALE_PREV_DAY';

      rows.push({
        symbol: stock.symbol,
        date,
        minuteOfDay: totalMinutes,
        sessionVolume: BigInt(sessionVol),
        avgVolume: BigInt(avgVol),
        rawRatio,
        rangeProvenance: provenance,
      });
    }

    return rows;
  }

  /**
   * Persists telemetry rows into Postgres in a single batch.
   */
  static async record(
    rows: VolumeTelemetryRow[],
    client: VolumeTelemetryPrismaClient = prisma as unknown as VolumeTelemetryPrismaClient
  ): Promise<number> {
    if (!rows.length) return 0;
    try {
      const res = await client.volumeTelemetry.createMany({
        data: rows,
        skipDuplicates: true,
      });
      return res.count;
    } catch (err) {
      console.warn('[VolumeTelemetryService] Failed to record volume telemetry:', err);
      return 0;
    }
  }

  /**
   * Computes the cutoff date string (YYYY-MM-DD in IST) for pruning telemetry older than daysAgo.
   */
  static cutoffDate(daysAgo: number = 30, now: Date = new Date()): string {
    const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return getISTDateString(d);
  }

  /**
   * Purges telemetry rows older than cutoffDateStr in bounded batches to prevent WAL spikes.
   * Query filters on `date < cutoffDateStr` to leverage the index.
   */
  static async purge(
    cutoffDateStr: string,
    client: VolumeTelemetryPrismaClient = prisma as unknown as VolumeTelemetryPrismaClient,
    options?: { batchSize?: number; maxRows?: number }
  ): Promise<{ deleted: number; batches: number; capped: boolean }> {
    const batchSize = Math.min(Math.max(1, options?.batchSize ?? 500), 1000);
    const maxRows = options?.maxRows ?? 25000;

    let deleted = 0;
    let batches = 0;
    let capped = false;

    while (deleted < maxRows) {
      const remainingLimit = Math.min(batchSize, maxRows - deleted);
      const rows = await client.volumeTelemetry.findMany({
        where: { date: { lt: cutoffDateStr } },
        select: { id: true },
        take: remainingLimit,
        orderBy: { id: 'asc' },
      });

      if (!rows.length) break;

      batches++;
      const ids = rows.map((r) => r.id);
      const res = await client.volumeTelemetry.deleteMany({
        where: { id: { in: ids } },
      });

      deleted += res.count;

      if (deleted >= maxRows) {
        capped = true;
        break;
      }

      if (rows.length < remainingLimit) break;
    }

    return { deleted, batches, capped };
  }
}
