-- CreateIndex
CREATE UNIQUE INDEX "VolumeTelemetry_symbol_date_minuteOfDay_key" ON "VolumeTelemetry"("symbol", "date", "minuteOfDay");
