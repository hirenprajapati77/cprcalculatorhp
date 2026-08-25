-- CreateTable
CREATE TABLE "DailyOhlcv" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "prevClose" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL,
    "value" DOUBLE PRECISION,
    "trades" INTEGER,
    "series" TEXT NOT NULL,
    "isin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyOhlcv_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyOhlcv_date_idx" ON "DailyOhlcv"("date");

-- CreateIndex
CREATE INDEX "DailyOhlcv_symbol_date_idx" ON "DailyOhlcv"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyOhlcv_symbol_date_key" ON "DailyOhlcv"("symbol", "date");
