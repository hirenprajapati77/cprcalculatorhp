-- AlterTable
ALTER TABLE "MarketSnapshot" ADD COLUMN IF NOT EXISTS "sessionOpen" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "MarketSnapshot" ADD COLUMN IF NOT EXISTS "previousClose" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill previousClose from legacy price column where unset
UPDATE "MarketSnapshot" SET "previousClose" = "price" WHERE "previousClose" = 0 AND "price" > 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DirectionSetupState" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectionSetupState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DirectionSetupState_symbol_date_key" ON "DirectionSetupState"("symbol", "date");
CREATE INDEX IF NOT EXISTS "DirectionSetupState_date_idx" ON "DirectionSetupState"("date");
