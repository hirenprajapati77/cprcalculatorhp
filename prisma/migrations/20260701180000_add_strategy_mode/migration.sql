-- AlterTable
ALTER TABLE "BacktestRun" ADD COLUMN     "strategyMode" TEXT NOT NULL DEFAULT 'LEGACY_NARROW_CPR';

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "score" DOUBLE PRECISION,
ADD COLUMN     "signalsJson" TEXT,
ADD COLUMN     "strategyMode" TEXT NOT NULL DEFAULT 'LEGACY_NARROW_CPR',
ADD COLUMN     "triggerDelayDays" INTEGER;
