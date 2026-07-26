-- DropIndex
DROP INDEX "BtstSignal_symbol_signalDate_signalTime_key";

-- CreateIndex
CREATE UNIQUE INDEX "BtstSignal_symbol_signalDate_signalTime_direction_key" ON "BtstSignal"("symbol", "signalDate", "signalTime", "direction");
