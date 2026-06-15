import { PrismaClient } from '@prisma/client';
import { RetentionService } from '../services/retention/retention.service';

const prisma = new PrismaClient();

async function run() {
  console.log('--- PHASE 5.1 RETENTION VALIDATION ---');
  
  await prisma.backtestRun.deleteMany(); // clean slate
  
  // 1. Create a simulated expired run (> 90 days old)
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 100);

  const run = await prisma.backtestRun.create({
    data: {
      name: 'ExpiredRun',
      universe: 'NIFTY50',
      startDate: new Date(),
      endDate: new Date(),
      capital: 100000,
      riskModel: 'Fixed',
      executionMode: 'conservative',
      status: 'COMPLETED',
      createdAt: expiredDate,
    }
  });

  // Seed cascade entities
  const trade = await prisma.trade.create({
    data: {
      backtestRunId: run.id,
      symbol: 'SYM1',
      type: 'LONG',
      signal: 'TEST',
      status: 'CLOSED_TARGET',
      entryDate: new Date(),
      entryPrice: 100,
      entryReason: 'Test',
      stopLoss: 95,
      target: 110,
      riskAmount: 100,
      fees: 0,
      slippage: 0,
      executionDelayMs: 0,
      positionSize: 10
    }
  });

  await prisma.journal.create({
    data: {
      tradeId: trade.id,
      timestamp: new Date(),
      event: 'ENTRY',
      details: 'Test'
    }
  });

  // 1. Dry Run Test
  console.log('\\n[TEST 1] Dry Run Check');
  const dryRunRes = await RetentionService.purgeExpired(1000, true);
  console.log(`wouldDelete: ${dryRunRes.wouldDelete}, hardDeleted: ${dryRunRes.hardDeleted}`);

  // 2. Mark Expired
  console.log('\\n[TEST 2] Mark Expired (Soft Delete)');
  const marked = await RetentionService.markExpired();
  const dbRunAfterMark = await prisma.backtestRun.findUnique({where:{id: run.id}});
  console.log(`Marked runs: ${marked}`);
  console.log(`Soft Delete Applied: ${!!dbRunAfterMark?.deletedAt ? 'PASS' : 'FAIL'}`);

  // 3. Purge Expired (Not 7 days yet)
  console.log('\\n[TEST 3] Purge Expired (Under 7 Days)');
  const purgeUnder7 = await RetentionService.purgeExpired();
  console.log(`Hard Deleted: ${purgeUnder7.hardDeleted}`);
  console.log(`Safeguard working: ${purgeUnder7.hardDeleted === 0 ? 'PASS' : 'FAIL'}`);

  // Time travel: set deletedAt to 8 days ago
  const eightDaysAgo = new Date();
  eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
  await prisma.backtestRun.update({where:{id: run.id}, data: {deletedAt: eightDaysAgo}});

  // 4. Cascade Hard Delete
  console.log('\\n[TEST 4] Purge Expired (Cascade Deletion)');
  const purgeRes = await RetentionService.purgeExpired();
  
  const tradesLeft = await prisma.trade.count({where: {backtestRunId: run.id}});
  const journalsLeft = await prisma.journal.count();
  
  console.log(`Hard Deleted Runs: ${purgeRes.hardDeleted}`);
  console.log(`Orphan Trades: ${tradesLeft}`);
  console.log(`Orphan Journals: ${journalsLeft}`);
  console.log(`Cascade Deletion: ${tradesLeft === 0 && journalsLeft === 0 ? 'PASS' : 'FAIL'}`);

  console.log('\\n--- RETENTION VALIDATION COMPLETE ---');
}

run().catch(console.error).finally(() => prisma.$disconnect());
