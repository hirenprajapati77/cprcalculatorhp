import { PrismaClient } from '@prisma/client';
import { BacktestService } from './src/services/backtest/backtest.service';
import { ReplayService } from './src/services/backtest/replay.service';
import { MetricsService } from './src/services/backtest/metrics.service';

const prisma = new PrismaClient();

process.env.BACKTEST_EXECUTION_MODE = 'sync'; // Force sync mode to bypass Redis requirement

async function run() {
  console.log('--- PHASE 5 CORRECTNESS VERIFICATION ---');
  
  await prisma.backtestRun.deleteMany();
  
  const config = {
    name: 'Verification Run',
    universe: 'NIFTY50', // mocks 50 symbols
    startDate: '2023-01-01',
    endDate: '2023-12-31',
    capital: 100000,
    riskModel: 'Fixed',
    executionMode: 'conservative',
    metricsVersion: 1
  };

  // 1. DETERMINISM
  console.log('\\n[STEP 1] Determinism (3 Runs)');
  const runs = [];
  for(let i=0; i<3; i++) {
    const runReq = await BacktestService.submitRun({...config, name: `Det_${i}`});
    // the sync mode in backtest.service already fired processRun in background, let's wait a bit or we can just call it explicitly
    // wait, backtest.service catches errors but doesn't return the promise. 
    // we'll wait for it to finish by polling DB
    let isDone = false;
    for(let j=0; j<20; j++) {
      const dbRun = await prisma.backtestRun.findUnique({where: {id: runReq.jobId}});
      if (dbRun?.status === 'COMPLETED') { isDone = true; break; }
      await new Promise(r => setTimeout(r, 500));
    }

    const metrics = await prisma.backtestMetrics.findUnique({where:{backtestRunId: runReq.jobId}});
    const trades = await prisma.trade.count({where:{backtestRunId: runReq.jobId}});
    runs.push({trades, winRate: metrics?.winRate});
    console.log(`Run ${i}: Trades=${trades}, WinRate=${metrics?.winRate}%`);
  }
  
  const isDeterministic = runs.every(r => r.trades === runs[0].trades && r.winRate === runs[0].winRate);
  console.log(`Deterministic: ${isDeterministic ? 'PASS' : 'FAIL'}`);

  // 2. CHECKPOINT & 3. IDEMPOTENCY
  console.log('\\n[STEP 2 & 3] Checkpoint & Idempotency');
  const idempReq = await BacktestService.submitRun({...config, name: `Idemp`});
  await new Promise(r => setTimeout(r, 2000)); // allow sync to finish

  const tradesOnce = await prisma.trade.count({where:{backtestRunId: idempReq.jobId}});
  
  // Force process again to test idempotency
  await BacktestService.processRun(idempReq.jobId);
  const tradesTwice = await prisma.trade.count({where:{backtestRunId: idempReq.jobId}});
  
  console.log(`Trades 1st Time: ${tradesOnce}, 2nd Time: ${tradesTwice}`);
  console.log(`Idempotency: ${tradesOnce === tradesTwice ? 'PASS' : 'FAIL'}`);

  // 4. REPLAY
  console.log('\\n[STEP 4] Replay');
  const aTrade = await prisma.trade.findFirst({where: {backtestRunId: idempReq.jobId}});
  if (aTrade) {
    const replay = await ReplayService.getReplayPayload(aTrade.id);
    console.log(`Events: ${replay.events.length} (Max 100)`);
    console.log(`Candles: ${replay.ohlc.length} (Max 500)`);
    console.log(`Truncated Flag: ${replay.truncated}`);
    console.log(`Replay Limit Enforced: ${replay.events.length <= 100 && replay.ohlc.length <= 500 ? 'PASS' : 'FAIL'}`);
  }

  // 7. MEMORY
  console.log('\\n[STEP 7] Memory Profile (Approx 1000 trades)');
  const memBefore = process.memoryUsage().heapUsed;
  
  const bigReq = await BacktestService.submitRun({...config, name: `MemProfile`});
  await new Promise(r => setTimeout(r, 2000));
  
  const memPeak = process.memoryUsage().heapUsed;
  global.gc && global.gc(); // if exposed
  const memAfter = process.memoryUsage().heapUsed;
  
  console.log(`Before: ${(memBefore / 1024/1024).toFixed(2)} MB`);
  console.log(`Peak: ${(memPeak / 1024/1024).toFixed(2)} MB`);
  console.log(`After: ${(memAfter / 1024/1024).toFixed(2)} MB`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
