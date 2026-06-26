import { BacktestService } from './src/services/backtest/backtest.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Submitting run...');
  const res = await BacktestService.submitRun({
    name: '2024 NIFTY50 1:2 RR',
    universe: 'NIFTY50',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    capital: 100000,
    riskModel: 'Risk%',
    riskValue: 1,
    executionMode: 'Conservative'
  });
  
  const runId = res.jobId;
  console.log('Run ID:', runId);

  if (runId) {
    console.log('Run is processing in the background... waiting 60s');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    console.log('Run processed. Fetching metrics...');
    const metrics = await prisma.backtestMetrics.findUnique({
      where: { backtestRunId: runId }
    });
    
    const run = await prisma.backtestRun.findUnique({
      where: { id: runId },
      include: { trades: true }
    });
    
    console.log('Trades total:', run?.trades.length);
    console.log('METRICS:', metrics);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
