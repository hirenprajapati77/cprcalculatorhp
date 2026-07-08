# Operational Runbook: CPR Calculator Platform

This runbook outlines standard operating procedures (SOP) for incident response, degraded mode behavior, and manual recovery for the overnight trading engine.

## 1. Operating Modes
The platform requires `EXECUTION_MODE` to be explicitly set in the `.env` file.
- `SHADOW`: (Default) The system generates signals, snapshots them in `TradeJournal`, and logs the expected entry/exit, but **no real orders are routed to a broker**.
- `LIVE`: Signals will be routed to the connected broker API using real capital.

## 2. Degraded Mode Behavior
The engine relies on external data sources (Yahoo Finance, Fyers, Redis). If data becomes stale, the platform fails safely:

### 2.1 Stale Regime Snapshots (NIFTY 50)
- **Detection**: The `/api/health` endpoint flags if the last `regimeSnapshot` is older than 24 hours.
- **Engine Behavior**: If `RegimeService` fails or returns stale data, the engine defaults to a `NEUTRAL` trend and `NORMAL` volatility.
- **Degraded Impact**: Signals that normally require a `BULL` regime (e.g., gap ups) may be aggressively filtered out or downgraded to `WATCHLIST` by `SignalQualityService`.
- **Recovery**: Check `market.service.ts` connectivity to Yahoo Finance. Flush Redis cache manually via `redis-cli flushall` if corrupted.

### 2.2 Missing or Stale Event Data
- **Detection**: `/api/health` flags if the event calendar cache is missing or stale.
- **Engine Behavior**: If `EventCalendarService` is down or unpopulated, the system assumes a safe fallback of `0` Event Risk.
- **Degraded Impact**: The `SignalQualityService` will proceed, but *it relies entirely on price action*. To prevent blind entries into earnings, `EXECUTION_MODE=LIVE` should be suspended if the calendar is known to be down.
- **Recovery**: Manually populate the `MarketEvent` table or re-trigger the bulk calendar sync.

## 3. Cron Job Failures

### 3.1 Missed 3:15 PM Scan
- **Impact**: `OvernightSignal` and `TradeJournal` entries are not generated for the day.
- **Recovery**: The scan can be manually triggered via `ScannerService.scanAll()` before 3:30 PM. If missed entirely, the day must be skipped to avoid corrupting the `cmp916` forward tests.

### 3.2 Missed 10:00 AM Snapshot Sweep
- **Impact**: Options CMP snapshots are not recorded for the morning.
- **Recovery**: The snapshot sweeps (`cmp916`, `cmp930`, etc.) cannot be perfectly recreated retroactively due to intraday option decay. The `TradeJournal` will leave them `null`. You must manually set the `Exit CMP` for those trades via the UI.

## 4. Rollback Procedure
If a new model deployment causes unstable signals or crashing cron jobs:
1. Revert to the last known stable tag: `git checkout v1.0.0-rc.1`
2. Stop the application: `docker-compose down`
3. If database schemas were altered, restore from backup: `sqlite3 dev.db < archive/backup.sql`
4. Restart the application: `docker-compose up -d --build`
