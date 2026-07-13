-- CreateIndex
CREATE INDEX "BacktestRun_status_createdAt_idx" ON "BacktestRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BtstSignal_signalDate_direction_idx" ON "BtstSignal"("signalDate", "direction");

-- CreateIndex
CREATE INDEX "ScannerResult_date_score_idx" ON "ScannerResult"("date", "score");

-- CreateIndex
CREATE INDEX "Trade_backtestRunId_status_idx" ON "Trade"("backtestRunId", "status");

-- CreateIndex
CREATE INDEX "Trade_backtestRunId_pnl_idx" ON "Trade"("backtestRunId", "pnl");
