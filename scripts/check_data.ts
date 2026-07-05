import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const calculations = await prisma.calculation.count();
  const scannerResults = await prisma.scannerResult.count();
  const snapshots = await prisma.marketSnapshot.count();
  const history = await prisma.scanHistory.count();
  const watchlist = await prisma.watchlist.count();
  const backtestRuns = await prisma.backtestRun.count();
  const checkpoints = await prisma.backtestCheckpoint.count();
  const trades = await prisma.trade.count();
  const journals = await prisma.journal.count();
  const metrics = await prisma.backtestMetrics.count();
  const snapshotsMetrics = await prisma.backtestMetricSnapshot.count();
  const overnightSignals = await prisma.overnightSignal.count();
  const brokerTokens = await prisma.brokerToken.count();
  const alertStates = await prisma.breakoutAlertState.count();
  const tradeJournals = await prisma.tradeJournal.count();

  console.log({
    calculations,
    scannerResults,
    snapshots,
    history,
    watchlist,
    backtestRuns,
    checkpoints,
    trades,
    journals,
    metrics,
    snapshotsMetrics,
    overnightSignals,
    brokerTokens,
    alertStates,
    tradeJournals
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
