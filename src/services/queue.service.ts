import { Queue, QueueOptions } from 'bullmq';
import { CacheService } from './cache.service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const defaultQueueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s, 2s, 4s
    },
    removeOnComplete: {
      age: 24 * 3600, // keep up to 24 hours
      count: 1000,    // keep up to 1000 jobs
    },
    removeOnFail: {
      age: 24 * 3600, // keep up to 24 hours
      count: 500,     // keep up to 500 jobs
    },
  },
};

const isQueueEnabled = process.env.ENABLE_QUEUE !== 'false';

class QueueServiceImpl {
  public scannerQueue: Queue | null = null;
  public marketQueue: Queue | null = null;
  public historyQueue: Queue | null = null;

  constructor() {
    if (isQueueEnabled) {
      try {
        this.scannerQueue = new Queue('scanner', defaultQueueOptions);
        this.marketQueue = new Queue('market', defaultQueueOptions);
        this.historyQueue = new Queue('history', defaultQueueOptions);
        console.log('Queues initialized successfully.');
        this.setupGracefulShutdown();
      } catch (e) {
        console.error('Failed to initialize queues, running in sync mode.', e);
      }
    }
  }

  private setupGracefulShutdown() {
    if ((globalThis as any).__queueServiceShutdownRegistered) return;
    (globalThis as any).__queueServiceShutdownRegistered = true;

    const shutdown = async () => {
      console.log('Closing BullMQ connections...');
      try {
        await Promise.all([
          this.scannerQueue?.close(),
          this.marketQueue?.close(),
          this.historyQueue?.close(),
        ]);
        console.log('BullMQ connections closed successfully.');
      } catch (e) {
        console.error('Error closing BullMQ connections', e);
      }
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  get isEnabled() {
    return isQueueEnabled && this.scannerQueue !== null;
  }

  async getQueueStatus() {
    if (!this.isEnabled) return { enabled: false };

    const [scanner, market, history] = await Promise.all([
      this.getJobCounts(this.scannerQueue!),
      this.getJobCounts(this.marketQueue!),
      this.getJobCounts(this.historyQueue!),
    ]);

    return {
      enabled: true,
      queues: {
        scanner,
        market,
        history,
      }
    };
  }

  private async getJobCounts(queue: Queue) {
    const counts = await queue.getJobCounts();
    return {
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
    };
  }
}

export const QueueService = new QueueServiceImpl();
