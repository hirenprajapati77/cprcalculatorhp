import redis from '@/lib/redis';
import { env } from '@/config/env';
import { Queue, QueueOptions, Worker, Job } from 'bullmq';


const connection = {
  host: env.REDIS_HOST || 'localhost',
  port: parseInt(env.REDIS_PORT || '6379'),
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

const isQueueEnabled = env.ENABLE_QUEUE !== 'false';

class QueueServiceImpl {
  public scannerQueue: Queue | null = null;
  public marketQueue: Queue | null = null;
  public historyQueue: Queue | null = null;
  public marketWorker: Worker | null = null;

  constructor() {
    if (isQueueEnabled) {
      try {
        this.scannerQueue = new Queue('scanner', defaultQueueOptions);
        this.marketQueue = new Queue('market', defaultQueueOptions);
        this.historyQueue = new Queue('history', defaultQueueOptions);

        this.marketWorker = new Worker(
          'market',
          async (job: Job) => {
            if (job.name === 'pattern-breakout-refresh') {
              const { PatternBreakoutService } = await import('@/services/market-tools/pattern-breakout.service');
              await PatternBreakoutService.runBackgroundRefreshJob();
            }
          },
          { connection }
        );

        this.marketWorker.on('failed', (job, err) => {
          console.error(`[BullMQ] Market worker job ${job?.id} failed:`, err);
        });

        console.log('Queues and workers initialized successfully.');
        this.setupGracefulShutdown();
      } catch (e) {
        console.error('Failed to initialize queues, running in sync mode.', e);
      }
    }
  }

  private setupGracefulShutdown() {
    const globalWithShutdown = globalThis as unknown as { __queueServiceShutdownRegistered?: boolean };
    if (globalWithShutdown.__queueServiceShutdownRegistered) return;
    globalWithShutdown.__queueServiceShutdownRegistered = true;

    const shutdown = async () => {
      console.log('Closing BullMQ connections...');
      try {
        await Promise.all([
          this.scannerQueue?.close(),
          this.marketQueue?.close(),
          this.historyQueue?.close(),
          this.marketWorker?.close(),
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
    try {
      const isRedisReady = redis && redis.status === 'ready';
      return isQueueEnabled && this.scannerQueue !== null && isRedisReady;
    } catch {
      return false;
    }
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
