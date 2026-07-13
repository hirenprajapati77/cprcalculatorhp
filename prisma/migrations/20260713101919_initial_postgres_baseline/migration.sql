-- CreateTable
CREATE TABLE "Calculation" (
    "id" TEXT NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "pivot" DOUBLE PRECISION NOT NULL,
    "bc" DOUBLE PRECISION NOT NULL,
    "tc" DOUBLE PRECISION NOT NULL,
    "r1" DOUBLE PRECISION NOT NULL,
    "r2" DOUBLE PRECISION NOT NULL,
    "r3" DOUBLE PRECISION NOT NULL,
    "r4" DOUBLE PRECISION NOT NULL,
    "s1" DOUBLE PRECISION NOT NULL,
    "s2" DOUBLE PRECISION NOT NULL,
    "s3" DOUBLE PRECISION NOT NULL,
    "s4" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "classification" TEXT NOT NULL,
    "trend" TEXT NOT NULL,
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Calculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerResult" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "ltp" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "pivot" DOUBLE PRECISION NOT NULL,
    "bc" DOUBLE PRECISION NOT NULL,
    "tc" DOUBLE PRECISION NOT NULL,
    "r1" DOUBLE PRECISION NOT NULL,
    "r2" DOUBLE PRECISION NOT NULL,
    "r3" DOUBLE PRECISION NOT NULL,
    "r4" DOUBLE PRECISION NOT NULL,
    "s1" DOUBLE PRECISION NOT NULL,
    "s2" DOUBLE PRECISION NOT NULL,
    "s3" DOUBLE PRECISION NOT NULL,
    "s4" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "classification" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "signalSummary" TEXT NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "target" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rr" TEXT NOT NULL DEFAULT '1:2.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannerResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "avgVolume" DOUBLE PRECISION NOT NULL,
    "marketCap" DOUBLE PRECISION NOT NULL,
    "sector" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanHistory" (
    "id" TEXT NOT NULL,
    "filtersJson" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "topSymbols" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "universe" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "capital" DOUBLE PRECISION NOT NULL,
    "riskModel" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "riskValue" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" TEXT NOT NULL,
    "strategyMode" TEXT NOT NULL DEFAULT 'LEGACY_NARROW_CPR',
    "metricsVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestCheckpoint" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL,
    "processedSymbols" INTEGER NOT NULL,
    "processedTrades" INTEGER NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "backtestRunId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "strategyMode" TEXT NOT NULL DEFAULT 'LEGACY_NARROW_CPR',
    "entryDate" TIMESTAMP(3) NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "entryReason" TEXT NOT NULL,
    "exitDate" TIMESTAMP(3),
    "exitPrice" DOUBLE PRECISION,
    "exitReason" TEXT,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "riskAmount" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL,
    "slippage" DOUBLE PRECISION NOT NULL,
    "executionDelayMs" INTEGER NOT NULL,
    "rr" DOUBLE PRECISION,
    "durationDays" INTEGER,
    "positionSize" DOUBLE PRECISION NOT NULL,
    "pnl" DOUBLE PRECISION,
    "pnlPercent" DOUBLE PRECISION,
    "cprWidth" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "signalsJson" TEXT,
    "triggerDelayDays" INTEGER,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "event" TEXT NOT NULL,
    "details" TEXT,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestMetrics" (
    "id" TEXT NOT NULL,
    "backtestRunId" TEXT NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "profitFactor" DOUBLE PRECISION NOT NULL,
    "expectancy" DOUBLE PRECISION NOT NULL,
    "maxDrawdown" DOUBLE PRECISION NOT NULL,
    "sharpe" DOUBLE PRECISION NOT NULL,
    "sortino" DOUBLE PRECISION NOT NULL,
    "avgRR" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestMetricSnapshot" (
    "id" TEXT NOT NULL,
    "backtestRunId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BtstSignal" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "signalDate" TEXT NOT NULL,
    "signalTime" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'LONG',
    "entry" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "overnightScore" INTEGER,
    "expectedGap" DOUBLE PRECISION,
    "expectedMove" DOUBLE PRECISION,
    "confidence" INTEGER,
    "exitStrategy" TEXT,
    "actualExit" DOUBLE PRECISION,
    "actualReturn" DOUBLE PRECISION,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "classification" TEXT NOT NULL,
    "freezeTime" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "historyQuality" INTEGER,
    "liquidityQuality" INTEGER,
    "eventRisk" INTEGER,
    "regimeFit" INTEGER,
    "conflictConfidence" INTEGER,
    "qualityModelVersion" INTEGER,
    "qualityBucket" TEXT,
    "eventRiskReason" TEXT,
    "slippageModelVersion" INTEGER,
    "regimeSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BtstSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerToken" (
    "id" SERIAL NOT NULL,
    "broker" TEXT NOT NULL DEFAULT 'fyers',
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakoutAlertState" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "hadBreakout" BOOLEAN NOT NULL DEFAULT false,
    "lastAlerted" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakoutAlertState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeJournal" (
    "id" TEXT NOT NULL,
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "signalType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "optionContract" TEXT NOT NULL,
    "optionStrike" INTEGER NOT NULL,
    "optionType" TEXT NOT NULL,
    "entryCmp" DOUBLE PRECISION NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "cmp916" DOUBLE PRECISION,
    "cmp930" DOUBLE PRECISION,
    "cmp945" DOUBLE PRECISION,
    "cmp1000" DOUBLE PRECISION,
    "exitCmp" DOUBLE PRECISION,
    "exitTime" TIMESTAMP(3),
    "pnl" DOUBLE PRECISION,
    "pnlPct" DOUBLE PRECISION,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "signalSummary" TEXT NOT NULL,
    "scoreV2" INTEGER,
    "v2Breakdown" JSONB,
    "overnightSignalId" TEXT,
    "modelEntryPrice" DOUBLE PRECISION,
    "modelExitPrice" DOUBLE PRECISION,
    "executionVariancePct" DOUBLE PRECISION,
    "executionOutcome" TEXT,
    "qualityBucketAtSignal" TEXT,
    "eventRiskReasonAtSignal" TEXT,
    "eventRiskScoreAtSignal" INTEGER,
    "slippageModelVersionAtSignal" INTEGER,
    "regimeSnapshotAtSignal" TEXT,
    "qualityModelVersionAtSignal" INTEGER,

    CONSTRAINT "TradeJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "marketMode" TEXT NOT NULL DEFAULT 'live',
    "defaultUniverse" TEXT NOT NULL DEFAULT 'NSE_FNO',
    "autoRefresh" TEXT NOT NULL DEFAULT '15m',
    "minPrice" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "minVolume" INTEGER NOT NULL DEFAULT 50000,
    "bypassBtst" BOOLEAN NOT NULL DEFAULT false,
    "telegramToken" TEXT NOT NULL DEFAULT '',
    "telegramChatId" TEXT NOT NULL DEFAULT '',
    "telegramGroupChatId" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketEvent" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "eventStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Calculation_shareToken_key" ON "Calculation"("shareToken");

-- CreateIndex
CREATE INDEX "Calculation_createdAt_idx" ON "Calculation"("createdAt");

-- CreateIndex
CREATE INDEX "Calculation_shareToken_idx" ON "Calculation"("shareToken");

-- CreateIndex
CREATE INDEX "ScannerResult_date_idx" ON "ScannerResult"("date");

-- CreateIndex
CREATE INDEX "ScannerResult_date_score_idx" ON "ScannerResult"("date", "score");

-- CreateIndex
CREATE INDEX "ScannerResult_score_idx" ON "ScannerResult"("score");

-- CreateIndex
CREATE INDEX "ScannerResult_createdAt_idx" ON "ScannerResult"("createdAt");

-- CreateIndex
CREATE INDEX "ScannerResult_symbol_idx" ON "ScannerResult"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "ScannerResult_symbol_date_key" ON "ScannerResult"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshot_symbol_key" ON "MarketSnapshot"("symbol");

-- CreateIndex
CREATE INDEX "ScanHistory_createdAt_idx" ON "ScanHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_symbol_key" ON "Watchlist"("symbol");

-- CreateIndex
CREATE INDEX "BacktestRun_status_createdAt_idx" ON "BacktestRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BacktestCheckpoint_runId_batchNumber_key" ON "BacktestCheckpoint"("runId", "batchNumber");

-- CreateIndex
CREATE INDEX "Trade_backtestRunId_idx" ON "Trade"("backtestRunId");

-- CreateIndex
CREATE INDEX "Trade_backtestRunId_status_idx" ON "Trade"("backtestRunId", "status");

-- CreateIndex
CREATE INDEX "Trade_backtestRunId_pnl_idx" ON "Trade"("backtestRunId", "pnl");

-- CreateIndex
CREATE INDEX "Trade_symbol_idx" ON "Trade"("symbol");

-- CreateIndex
CREATE INDEX "Journal_tradeId_idx" ON "Journal"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "BacktestMetrics_backtestRunId_key" ON "BacktestMetrics"("backtestRunId");

-- CreateIndex
CREATE INDEX "BacktestMetricSnapshot_backtestRunId_metricType_idx" ON "BacktestMetricSnapshot"("backtestRunId", "metricType");

-- CreateIndex
CREATE INDEX "BtstSignal_direction_idx" ON "BtstSignal"("direction");

-- CreateIndex
CREATE INDEX "BtstSignal_classification_idx" ON "BtstSignal"("classification");

-- CreateIndex
CREATE INDEX "BtstSignal_signalDate_idx" ON "BtstSignal"("signalDate");

-- CreateIndex
CREATE INDEX "BtstSignal_signalDate_direction_idx" ON "BtstSignal"("signalDate", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "BtstSignal_symbol_signalDate_signalTime_key" ON "BtstSignal"("symbol", "signalDate", "signalTime");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerToken_broker_key" ON "BrokerToken"("broker");

-- CreateIndex
CREATE UNIQUE INDEX "BreakoutAlertState_symbol_key" ON "BreakoutAlertState"("symbol");

-- CreateIndex
CREATE INDEX "TradeJournal_tradeDate_idx" ON "TradeJournal"("tradeDate");

-- CreateIndex
CREATE INDEX "TradeJournal_signalType_idx" ON "TradeJournal"("signalType");

-- CreateIndex
CREATE UNIQUE INDEX "TradeJournal_symbol_tradeDate_signalType_key" ON "TradeJournal"("symbol", "tradeDate", "signalType");

-- CreateIndex
CREATE INDEX "MarketEvent_symbol_date_idx" ON "MarketEvent"("symbol", "date");

-- CreateIndex
CREATE INDEX "MarketEvent_date_idx" ON "MarketEvent"("date");

-- AddForeignKey
ALTER TABLE "BacktestCheckpoint" ADD CONSTRAINT "BacktestCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BacktestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "BacktestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestMetrics" ADD CONSTRAINT "BacktestMetrics_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "BacktestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestMetricSnapshot" ADD CONSTRAINT "BacktestMetricSnapshot_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "BacktestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeJournal" ADD CONSTRAINT "TradeJournal_overnightSignalId_fkey" FOREIGN KEY ("overnightSignalId") REFERENCES "BtstSignal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
