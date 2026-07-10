import { prisma } from '@/lib/db';

// In-memory state tracking for health
let lastRun: Date | null = null;
let lastDurationMs = 0;
let lastDeletedCount = 0;

export class RetentionService {
  /**
   * Find BacktestRuns older than 90 days and set deletedAt.
   */
  static async markExpired() {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 90);

    // Using executeRaw or standard updateMany
    // Prisma `updateMany` doesn't return the array of IDs, but returns count
    const result = await prisma.backtestRun.updateMany({
      where: {
        createdAt: {
          lt: thresholdDate
        },
        deletedAt: null // Only mark ones not already marked
      },
      data: {
        deletedAt: new Date()
      }
    });

    return result.count;
  }

  /**
   * Hard delete BacktestRuns where deletedAt is older than 7 days.
   * Leverages Prisma's Cascade Delete for Journal, Snapshots, Metrics, Checkpoints.
   */
  static async purgeExpired(limit: number = 250, dryRun: boolean = false) {
    const startTime = Date.now();
    
    // Safety limit cap
    const safeLimit = Math.min(limit, 1000);

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 7);

    // Find the IDs to delete
    const runsToDelete = await prisma.backtestRun.findMany({
      where: {
        deletedAt: {
          not: null,
          lt: thresholdDate
        }
      },
      select: { id: true },
      take: safeLimit
    });

    const runIds = runsToDelete.map((r: { id: string }) => r.id);
    let hardDeleted = 0;

    if (!dryRun && runIds.length > 0) {
      const result = await prisma.backtestRun.deleteMany({
        where: {
          id: { in: runIds }
        }
      });
      hardDeleted = result.count;
    }

    lastRun = new Date();
    lastDurationMs = Date.now() - startTime;
    lastDeletedCount = dryRun ? runIds.length : hardDeleted;

    return {
      wouldDelete: runIds.length,
      hardDeleted: dryRun ? 0 : hardDeleted,
      duration: lastDurationMs
    };
  }

  /**
   * Returns current health of the retention system
   */
  static getHealth() {
    const next = lastRun ? new Date(lastRun.getTime() + 24 * 60 * 60 * 1000) : null;
    
    return {
      enabled: true,
      lastRun: lastRun?.toISOString() || null,
      nextRun: next?.toISOString() || null,
      lastDuration: lastDurationMs,
      lastDeleted: lastDeletedCount
    };
  }
}
