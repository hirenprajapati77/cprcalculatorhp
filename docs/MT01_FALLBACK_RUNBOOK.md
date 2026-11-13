# Market Breadth NIFTY50 / F&O Universe Fallback — Runbook

**Domain**: MarketTools · Market Breadth · `market-breadth.service.ts`  
**Effective**: 2026-11-03  
**Owner**: CPR PRO · **Related**: MT-01 (defensive warning log)

---

## Purpose

This document explains the defensive fallback in `MarketBreadthService.computeMarketBreadth()` that activates when the `NIFTY50_SYMBOLS` or `FNO_SYMBOLS` hard-coded sets match **zero** stocks in `DailyOhlcv`. In that edge case, the service falls back to `operatingStockStats.slice(0, 50)` / `slice(0, 180)` so the UI never renders a completely blank Nifty 50 or F&O tab.

---

## When the Fallback Triggers

The fallback activates only when:

```ts
const nifty50Stats = operatingStockStats.filter((s) => NIFTY50_SYMBOLS.has(s.symbol));
// if nifty50Stats.length === 0 → fallback to slice(0, 50)

const fnoStats = operatingStockStats.filter((s) => FNO_SYMBOLS.has(s.symbol));
// if fnoStats.length === 0 → fallback to slice(0, 180)
```

This can happen when:

| Cause | Example |
|-------|---------|
| **Empty `DailyOhlcv` table** | Fresh deploy, no Bhavcopy ingestion has run yet |
| **Symbol naming mismatch** | DB stores `RELIANCE-EQ` but `FNO_SYMBOLS` has `RELIANCE` |
| **Series filter too narrow** | DB rows have `series = 'BE'` but query filters `series = 'EQ'` |
| **Data not yet ingested for today** | `latestDate` in DB is older than expected |

---

## Detecting the Fallback in Production

A warning log is emitted when either fallback triggers:

```text
[MarketBreadth] NIFTY50_SYMBOLS filter matched 0 stocks - falling back to slice(0,50). Check DailyOhlcv data coverage.
[MarketBreadth] FNO_SYMBOLS filter matched 0 stocks - falling back to slice(0,180). Check DailyOhlcv data coverage.
```

Search your PM2 / container logs for `MarketBreadth] .* filter matched 0 stocks`.

---

## Verification Steps

### 1. Check `DailyOhlcv` row count

```bash
# Via psql against the production DB
psql -d cpr_pro -c "SELECT COUNT(*) FROM \"DailyOhlcv\";"
psql -d cpr_pro -c "SELECT COUNT(DISTINCT symbol) FROM \"DailyOhlcv\" WHERE series = 'EQ';"
psql -d cpr_pro -c "SELECT MAX(date) FROM \"DailyOhlcv\";"
```

If `COUNT(DISTINCT symbol)` is 0 or `MAX(date)` is stale, Bhavcopy ingestion hasn't run or has failed.

### 2. Check symbol naming match

```bash
# Sample symbols actually in the DB
psql -d cpr_pro -c "SELECT DISTINCT symbol FROM \"DailyOhlcv\" WHERE series = 'EQ' LIMIT 20;"

# Compare against the hard-coded sets in src/services/market-tools/market-breadth.service.ts
# NIFTY50_SYMBOLS (50 symbols) and FNO_SYMBOLS (175 symbols)
```

If DB symbols have suffixes like `-EQ`, `-BE`, or `-SM` but the hard-coded sets don't, the filter will match zero rows.

### 3. Check Bhavcopy ingestion status

Verify the bhavcopy ingest cron/job has run recently:

```bash
# Check last ingestion timestamp
psql -d cpr_pro -c "SELECT MAX(createdAt) FROM \"DailyOhlcv\";"
```

If the latest `createdAt` is more than 1 trading day old, the ingestion job may have failed.

---

## Resolution

1. **Run Bhavcopy ingestion** to populate `DailyOhlcv` with current `EQ` series data.
2. **Reconcile symbol naming** — if DB symbols carry suffixes not in `FNO_SYMBOLS`/`NIFTY50_SYMBOLS`, either:
   - Strip suffixes during ingestion, or
   - Add the suffixed variants to the hard-coded sets in `market-breadth.service.ts`.
3. **Confirm the warning log stops appearing** after the next breadth computation.

---

## Notes

- The fallback is **defensive only** — it prevents blank UI tabs during initial setup or data gaps. It is **not** intended for steady-state production operation.
- With full production data loaded, the filter matches correctly and the fallback never activates.
- If you see the warning log repeatedly in steady state, treat it as a data-ingestion or symbol-mapping issue, not a code bug.

---

# Yahoo 15m Session Aggregation Fallback — Runbook (Task A3 / PR #305)

**Domain**: Market Data · Live Feed · `src/services/market.service.ts`  
**Effective**: 2026-11-13  
**Related**: PR #301, PR #305

## Purpose

When Fyers is temporarily unavailable or in 429 cooldown, `MarketService.getStockData` falls back to Yahoo Finance. To avoid freezing intraday OHLCV at the 09:16 daily candle snapshot (the defect addressed in PR #301), Yahoo 15m intraday bars are aggregated into live session `open/high/low/close/volume`.

If the Yahoo 15m request itself fails (e.g. Yahoo 429, timeout, or missing intraday series), the system falls back to the daily candle snapshot (`sessionAggregated = false`).

## Telemetry & Logging

When 15m aggregation fails, `MarketService` tags the returned `MarketStockData`:
```ts
resultData.sessionAggregated = false;
```
and logs a throttled warning via `shouldLogProviderError`:
```
[LiveFeed] Yahoo 15m session aggregation skipped for <TICKER>: using daily candle snapshot (sessionAggregated=false)
```

## Remediation & Operational Response

1. Check if Fyers token or connectivity has restored (`/api/health` or `/api/broker/fyers/status`). Once Fyers is back, traffic immediately reverts to the primary provider.
2. If Yahoo throttling is persistent, inspect Yahoo 429 rates and confirm `YAHOO_SCAN_BATCH_DELAY_MS` (120ms) and `YAHOO_REQUEST_TIMEOUT_MS` (12s) are effective.

