-- CreateTable
CREATE TABLE "TradeJournal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeDate" DATETIME NOT NULL,
    "signalType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "optionContract" TEXT NOT NULL,
    "optionStrike" INTEGER NOT NULL,
    "optionType" TEXT NOT NULL,
    "entryCmp" REAL NOT NULL,
    "entryTime" DATETIME NOT NULL,
    "cmp916" REAL,
    "cmp930" REAL,
    "cmp945" REAL,
    "cmp1000" REAL,
    "exitCmp" REAL,
    "exitTime" DATETIME,
    "pnl" REAL,
    "pnlPct" REAL,
    "score" INTEGER NOT NULL,
    "confidence" REAL NOT NULL,
    "signalSummary" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "TradeJournal_tradeDate_idx" ON "TradeJournal"("tradeDate");

-- CreateIndex
CREATE INDEX "TradeJournal_signalType_idx" ON "TradeJournal"("signalType");

-- CreateIndex
CREATE UNIQUE INDEX "TradeJournal_symbol_tradeDate_signalType_key" ON "TradeJournal"("symbol", "tradeDate", "signalType");
