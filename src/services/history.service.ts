import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { CalculationRecord } from '@/types/cpr.types';

export class HistoryService {
  /**
   * Retrieves calculation history from the database, ordered by latest.
   * Caches the list for 60 seconds to optimize DB reads.
   */
  static async getHistory(limit: number = 50): Promise<CalculationRecord[]> {
    const cacheKey = `history:limit:${limit}`;

    // 1. Try cache
    const cached = await cache.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return parsed.map((item: Omit<CalculationRecord, 'createdAt'> & { createdAt: string }) => ({
          ...item,
          createdAt: new Date(item.createdAt),
        }));
      } catch (err) {
        console.error('Failed to parse cached history:', err);
      }
    }

    // 2. DB — do not swallow failures as an empty list (that looked like "no history").
    const calculations = (await prisma.calculation.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })) as CalculationRecord[];

    // 3. Save to cache (best-effort; fetch still succeeded)
    try {
      await cache.set(cacheKey, JSON.stringify(calculations), 60);
    } catch (err) {
      console.warn('Failed to cache history list:', err);
    }
    return calculations;
  }

  /**
   * Deletes a calculation history entry by database ID and invalidates related caches.
   */
  static async deleteEntry(id: string): Promise<boolean> {
    // 1. Find the calculation to get its share token
    const record = await prisma.calculation.findUnique({
      where: { id },
    });

    if (!record) return false;

    // 2. Delete from DB — let unexpected DB errors propagate (API → 500),
    // not collapse into false (which looked like 404 "not found").
    await prisma.calculation.delete({
      where: { id },
    });

    // 3. Evict caches (best-effort after successful delete)
    try {
      if (record.shareToken) {
        await cache.del(`calc:share:${record.shareToken}`);
      }
      await cache.delPattern('history:limit:*');
    } catch (err) {
      console.warn('Failed to evict history caches after delete:', err);
    }
    return true;
  }
}
