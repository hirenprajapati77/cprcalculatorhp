#!/usr/bin/env python3
import subprocess, os

sql = '''CREATE TABLE IF NOT EXISTS "TradeJournal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeDate" TIMESTAMP NOT NULL,
    "signalType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "optionContract" TEXT NOT NULL,
    "optionStrike" INTEGER NOT NULL,
    "optionType" TEXT NOT NULL,
    "entryCmp" DOUBLE PRECISION NOT NULL,
    "entryTime" TIMESTAMP NOT NULL,
    "cmp916" DOUBLE PRECISION,
    "cmp930" DOUBLE PRECISION,
    "cmp945" DOUBLE PRECISION,
    "cmp1000" DOUBLE PRECISION,
    "exitCmp" DOUBLE PRECISION,
    "exitTime" TIMESTAMP,
    "pnl" DOUBLE PRECISION,
    "pnlPct" DOUBLE PRECISION,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "signalSummary" TEXT NOT NULL,
    UNIQUE("symbol", "tradeDate", "signalType")
);
CREATE INDEX IF NOT EXISTS "TradeJournal_tradeDate_idx" ON "TradeJournal"("tradeDate");
CREATE INDEX IF NOT EXISTS "TradeJournal_signalType_idx" ON "TradeJournal"("signalType");
SELECT COUNT(*) as total_cols FROM information_schema.columns WHERE table_name = 'TradeJournal';'''

env = os.environ.copy()
env['PGPASSWORD'] = 'postgrespassword'

result = subprocess.run(
    ['psql', '-U', 'postgres', '-h', '127.0.0.1', '-d', 'cpr_pro', '-c', sql],
    env=env, capture_output=True, text=True
)
print("STDOUT:", result.stdout)
print("STDERR:", result.stderr)
print("RC:", result.returncode)
