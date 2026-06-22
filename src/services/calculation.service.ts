import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { CPRInput, CalculationRecord } from '@/types/cpr.types';
import { calculateCPR } from '@/lib/cpr-engine';
import { generateShareToken } from '@/lib/share';

export class CalculationService {
  /**
   * Calculates CPR, saves the inputs and outputs to the database,
   * generates a unique share token, and caches the record.
   */
  static async calculateAndSave(input: CPRInput): Promise<CalculationRecord> {
    const result = calculateCPR(input);
    let record!: CalculationRecord;
    let shareToken = '';
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      shareToken = generateShareToken();
      try {
        const created = await prisma.calculation.create({
          data: {
            high: input.high,
            low: input.low,
            close: input.close,
            pivot: result.pivot,
            bc: result.bc,
            tc: result.tc,
            r1: result.r1,
            r2: result.r2,
            r3: result.r3,
            r4: result.r4,
            s1: result.s1,
            s2: result.s2,
            s3: result.s3,
            s4: result.s4,
            width: result.width,
            classification: result.classification,
            trend: result.trend,
            shareToken,
          },
        });
        record = { ...(created as CalculationRecord), persisted: true };
        break;
      } catch (err: any) {
        const isCollision = err.code === 'P2002' && err.meta?.target?.includes('shareToken');
        if (isCollision && attempt < maxAttempts) {
          console.warn(`[CalculationService] Share token collision on attempt ${attempt}. Retrying...`);
          continue;
        }

        const isProd = process.env.NODE_ENV === 'production';
        if (isProd) {
          console.error('[CalculationService] Database write failed in production:', err);
        } else {
          console.warn('Database write failed, returning unsaved calculation:', err);
        }

        record = {
          id: `local_${Date.now()}`,
          high: input.high,
          low: input.low,
          close: input.close,
          ...result,
          shareToken,
          createdAt: new Date(),
          ...(isProd ? { persisted: false } : {})
        };
        break;
      }
    }

    // Cache the calculation by shareToken for fast public lookups (7 days)
    if (record.shareToken) {
      await cache.set(`calc:share:${record.shareToken}`, JSON.stringify(record), 86400 * 7);
    }

    return record;
  }

  /**
   * Fetches a calculation by its public share token. Uses Redis/Memory cache first,
   * falling back to the PostgreSQL/SQLite database.
   */
  static async getByShareToken(token: string): Promise<CalculationRecord | null> {
    const cacheKey = `calc:share:${token}`;
    
    // 1. Try cache
    const cached = await cache.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        parsed.createdAt = new Date(parsed.createdAt);
        return parsed;
      } catch (err) {
        console.error('Failed to parse cached share calculation:', err);
      }
    }

    // 2. Try DB
    try {
      const record = await prisma.calculation.findUnique({
        where: { shareToken: token },
      }) as CalculationRecord | null;

      if (record) {
        // Populate cache
        await cache.set(cacheKey, JSON.stringify(record), 86400 * 7);
        return record;
      }
    } catch (err) {
      console.warn('Database read failed for token:', token, err);
    }

    return null;
  }
}
