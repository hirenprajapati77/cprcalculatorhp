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

## 5. Daily Pre-Market Shadow Checklist
Before relying on the system's generated signals for paper-trading or shadow validation, run this manual checklist every trading day (e.g., at 9:00 AM IST):

1. **Check `/api/health` Payload**
   - Confirm `status` is `healthy`.
   - Verify `checks.database` and `checks.redis` are `connected`/`healthy`.
   - *Example Payload Expected:*
     ```json
     {
       "status": "healthy",
       "version": "v1.0.0-rc.1",
       "executionMode": "SHADOW",
       "checks": {
         "database": "healthy",
         "redis": "connected",
         "signals": "healthy",
         "events": "healthy",
         "regime": "healthy"
       },
       "timestamps": {
         "latestSignal": "2026-07-08T09:45:00.000Z",
         "latestEvent": "2026-07-08T06:30:00.000Z",
         "latestRegime": "2026-07-08T04:15:00.000Z"
       }
     }
     ```
2. **Verify Regime Freshness**
   - Confirm `checks.regime` is `healthy` (last snapshot < 48 hours). If it says `stale`, today's signals might be excessively filtered out due to the conservative `NEUTRAL` fallback.
3. **Verify Event Calendar Freshness**
   - Confirm `checks.events` is `healthy` (last sync < 48 hours). If it says `stale`, all symbols will be evaluated with `100` Event Risk (`STALE_CALENDAR_FALLBACK`) and overnight trades will be universally blocked or heavily downgraded.
4. **Verify Cron Freshness**
   - Confirm `checks.signals` is `healthy` (yesterday's 3:15 PM scan ran successfully).

## 6. Daily Post-Market Shadow Checklist
After the trading day concludes (e.g., around 4:00 PM IST), run this validation checklist:

1. **Compare Signal Generation**
   - Did the 3:15 PM cron run? Verify `OvernightSignal` rows were created.
   - Were risky symbols properly downgraded to `LOW_QUALITY` or `WATCHLIST`?
2. **Review Execution Outcomes**
   - Use the `Trade Journal > Analytics` tab to review the distribution of `EXECUTION_SLIPPAGE`, `GAP_FAILURE`, and `EVENT_RISK_AVOIDABLE`.
   - Export the CSV via the `Export` button to run offline divergence analysis between live V2 scores vs execution realities.
3. **Handle Missing Exits**
   - If the 10:00 AM sweep missed an exit, manually update the `Exit CMP` for the affected row in the Journal UI so it doesn't skew overall outcome metrics.

