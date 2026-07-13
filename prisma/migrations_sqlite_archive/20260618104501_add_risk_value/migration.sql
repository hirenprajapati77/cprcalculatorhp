-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "universe" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "capital" REAL NOT NULL,
    "riskModel" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "riskValue" REAL NOT NULL DEFAULT 1.0,
    "status" TEXT NOT NULL,
    "metricsVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "BacktestCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL,
    "processedSymbols" INTEGER NOT NULL,
    "processedTrades" INTEGER NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BacktestCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BacktestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backtestRunId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "entryDate" DATETIME NOT NULL,
    "entryPrice" REAL NOT NULL,
    "entryReason" TEXT NOT NULL,
    "exitDate" DATETIME,
    "exitPrice" REAL,
    "exitReason" TEXT,
    "stopLoss" REAL NOT NULL,
    "target" REAL NOT NULL,
    "riskAmount" REAL NOT NULL,
    "fees" REAL NOT NULL,
    "slippage" REAL NOT NULL,
    "executionDelayMs" INTEGER NOT NULL,
    "rr" REAL,
    "durationDays" INTEGER,
    "positionSize" REAL NOT NULL,
    "pnl" REAL,
    "pnlPercent" REAL,
    CONSTRAINT "Trade_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "BacktestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "event" TEXT NOT NULL,
    "details" TEXT,
    CONSTRAINT "Journal_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BacktestMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backtestRunId" TEXT NOT NULL,
    "winRate" REAL NOT NULL,
    "profitFactor" REAL NOT NULL,
    "expectancy" REAL NOT NULL,
    "maxDrawdown" REAL NOT NULL,
    "sharpe" REAL NOT NULL,
    "sortino" REAL NOT NULL,
    "avgRR" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BacktestMetrics_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "BacktestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BacktestMetricSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backtestRunId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "metricValue" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BacktestMetricSnapshot_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "BacktestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BtstSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "signalDate" TEXT NOT NULL,
    "signalTime" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'LONG',
    "entry" REAL,
    "stopLoss" REAL,
    "target" REAL,
    "overnightScore" INTEGER,
    "expectedGap" REAL,
    "expectedMove" REAL,
    "confidence" INTEGER,
    "exitStrategy" TEXT,
    "actualExit" REAL,
    "actualReturn" REAL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "classification" TEXT NOT NULL,
    "freezeTime" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScannerResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "ltp" REAL NOT NULL,
    "volume" REAL NOT NULL,
    "pivot" REAL NOT NULL,
    "bc" REAL NOT NULL,
    "tc" REAL NOT NULL,
    "r1" REAL NOT NULL,
    "r2" REAL NOT NULL,
    "r3" REAL NOT NULL,
    "r4" REAL NOT NULL,
    "s1" REAL NOT NULL,
    "s2" REAL NOT NULL,
    "s3" REAL NOT NULL,
    "s4" REAL NOT NULL,
    "width" REAL NOT NULL,
    "classification" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "signalSummary" TEXT NOT NULL,
    "entry" REAL NOT NULL DEFAULT 0,
    "sl" REAL NOT NULL DEFAULT 0,
    "target" REAL NOT NULL DEFAULT 0,
    "rr" TEXT NOT NULL DEFAULT '1:2.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ScannerResult" ("bc", "classification", "confidence", "createdAt", "date", "id", "ltp", "pivot", "r1", "r2", "r3", "r4", "s1", "s2", "s3", "s4", "score", "signalSummary", "symbol", "tc", "volume", "width") SELECT "bc", "classification", "confidence", "createdAt", "date", "id", "ltp", "pivot", "r1", "r2", "r3", "r4", "s1", "s2", "s3", "s4", "score", "signalSummary", "symbol", "tc", "volume", "width" FROM "ScannerResult";
DROP TABLE "ScannerResult";
ALTER TABLE "new_ScannerResult" RENAME TO "ScannerResult";
CREATE INDEX "ScannerResult_score_idx" ON "ScannerResult"("score");
CREATE INDEX "ScannerResult_createdAt_idx" ON "ScannerResult"("createdAt");
CREATE INDEX "ScannerResult_symbol_idx" ON "ScannerResult"("symbol");
CREATE UNIQUE INDEX "ScannerResult_symbol_date_key" ON "ScannerResult"("symbol", "date");
CREATE TABLE "new_Watchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Watchlist" ("createdAt", "id", "notify", "pinned", "symbol") SELECT "createdAt", "id", "notify", "pinned", "symbol" FROM "Watchlist";
DROP TABLE "Watchlist";
ALTER TABLE "new_Watchlist" RENAME TO "Watchlist";
CREATE UNIQUE INDEX "Watchlist_symbol_key" ON "Watchlist"("symbol");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BacktestCheckpoint_runId_batchNumber_key" ON "BacktestCheckpoint"("runId", "batchNumber");

-- CreateIndex
CREATE INDEX "Trade_backtestRunId_idx" ON "Trade"("backtestRunId");

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
CREATE UNIQUE INDEX "BtstSignal_symbol_signalDate_signalTime_key" ON "BtstSignal"("symbol", "signalDate", "signalTime");
