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

    // 2. Try DB
    try {
      const calculations = (await prisma.calculation.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      })) as CalculationRecord[];

      // 3. Save to cache
      await cache.set(cacheKey, JSON.stringify(calculations), 60); // Cache for 60 seconds
      return calculations;
    } catch (err) {
      console.warn('Database fetch failed for history:', err);
      return [];
    }
  }

  /**
   * Deletes a calculation history entry by database ID and invalidates related caches.
   */
  static async deleteEntry(id: string): Promise<boolean> {
    try {
      // 1. Find the calculation to get its share token
      const record = await prisma.calculation.findUnique({
        where: { id },
      });

      if (!record) return false;

      // 2. Delete from DB
      await prisma.calculation.delete({
        where: { id },
      });

      // 3. Evict caches
      if (record.shareToken) {
        await cache.del(`calc:share:${record.shareToken}`);
      }
      
      // Invalidate general history cache keys scoped to history namespace
      await cache.delPattern('history:limit:*'); 
      return true;
    } catch (err) {
      console.error('Failed to delete calculation entry:', err);
      return false;
    }
  }
}
