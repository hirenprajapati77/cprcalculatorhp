-- CreateTable
CREATE TABLE "VolumeTelemetry" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "minuteOfDay" INTEGER NOT NULL,
    "sessionVolume" BIGINT NOT NULL,
    "avgVolume" BIGINT NOT NULL,
    "rawRatio" DOUBLE PRECISION NOT NULL,
    "rangeProvenance" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolumeTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolumeTelemetry_minuteOfDay_idx" ON "VolumeTelemetry"("minuteOfDay");

-- CreateIndex
CREATE INDEX "VolumeTelemetry_date_minuteOfDay_idx" ON "VolumeTelemetry"("date", "minuteOfDay");
