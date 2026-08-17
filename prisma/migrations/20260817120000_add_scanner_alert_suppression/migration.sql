-- Persist breakout Telegram gate suppressions on scanner rows for UI visibility.
ALTER TABLE "ScannerResult" ADD COLUMN "alertSuppressedReason" TEXT,
ADD COLUMN "alertSuppressedDetail" TEXT,
ADD COLUMN "alertSuppressedAt" TIMESTAMP(3);
