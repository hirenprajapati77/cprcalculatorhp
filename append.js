const fs = require('fs');
const content = `
model BacktestRun {
  id            String   @id @default(cuid())
  name          String
  universe      String
  startDate     DateTime
  endDate       DateTime
  capital       Float
  riskModel     String
  executionMode String
  status        String
  metricsVersion Int      @default(1)
  createdAt     DateTime @default(now())
  
  trades        Trade[]
  metrics       BacktestMetrics?
  snapshots     BacktestMetricSnapshot[]
  checkpoints   BacktestCheckpoint[]
}

model BacktestCheckpoint {
  id               String   @id @default(cuid())
  runId            String
  batchNumber      Int
  processedSymbols Int
  processedTrades  Int
  elapsedMs        Int
  createdAt        DateTime @default(now())

  run              BacktestRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  
  @@unique([runId, batchNumber])
}

model Trade {
  id               String   @id @default(cuid())
  backtestRunId    String
  symbol           String
  type             String
  signal           String
  status           String
  
  entryDate        DateTime
  entryPrice       Float
  entryReason      String
  exitDate         DateTime?
  exitPrice        Float?
  exitReason       String?
  
  stopLoss         Float
  target           Float
  riskAmount       Float
  fees             Float
  slippage         Float
  executionDelayMs Int
  
  rr               Float?
  durationDays     Int?
  positionSize     Float
  pnl              Float?
  pnlPercent       Float?

  run              BacktestRun @relation(fields: [backtestRunId], references: [id], onDelete: Cascade)
  journal          Journal[]
  
  @@index([backtestRunId])
  @@index([symbol])
}

model Journal {
  id        String   @id @default(cuid())
  tradeId   String
  timestamp DateTime
  event     String
  details   String?
  
  trade     Trade    @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  
  @@index([tradeId])
}

model BacktestMetrics {
  id            String   @id @default(cuid())
  backtestRunId String   @unique
  winRate       Float
  profitFactor  Float
  expectancy    Float
  maxDrawdown   Float
  sharpe        Float
  sortino       Float
  avgRR         Float
  createdAt     DateTime @default(now())

  run           BacktestRun @relation(fields: [backtestRunId], references: [id], onDelete: Cascade)
}

model BacktestMetricSnapshot {
  id            String   @id @default(cuid())
  backtestRunId String
  period        String
  metricType    String
  metricKey     String
  metricValue   Float
  createdAt     DateTime @default(now())

  run           BacktestRun @relation(fields: [backtestRunId], references: [id], onDelete: Cascade)
  
  @@index([backtestRunId, metricType])
}
`;
fs.appendFileSync('prisma/schema.prisma', content);
