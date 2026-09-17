# Acceptance Gate Report — Second Code Review Remediation

**Date:** 2026-09-17  
**PR Range:** #232–#241  
**Baseline Commit:** `3835c59214835e668e279cce708be66e5f36a102`  
**Branch:** `main`  
**Scope:** All 10 findings from the Second Code Review plus scheduler alert deduplication hardening  
**Verification:** 1,158 / 1,158 unit tests passing, 0 lint errors, 0 type errors, regression lock passed, CI passed.

---

## Summary

| Category | Count |
|---|---|
| Findings identified | 10 |
| Findings remediated & merged | 10 (10/10) |
| Unit tests passing | 1,158 / 1,158 |
| Unit tests failing | 0 |
| Typecheck errors | 0 |
| Lint warnings / errors | 0 |
| Math regression lock | Passed (3.00 ms) |
| Deployment audit items validated | 3 (ISSUE-012, ISSUE-013, ISSUE-014) |

---

## Remediated Findings Checklist

- [x] **Finding #1 (PR #233)** — `options-pricing.ts`, `options.service.ts`: Update fallback lot sizes to current NSE contracts (NIFTY 25, BANKNIFTY 15, FINNIFTY 25) and align DTE to Tuesday index expiry with holiday rollback.
- [x] **Finding #2 (PR #234)** — `btst-alert.job.ts`: Resolve orphan journal date mismatch by decoupling `signalDate` from `dateKey`, preferring `overnightSignalId` foreign key linkage.
- [x] **Finding #3 / #4 (PR #235)** — `earnings-populator.service.ts`: Verify Telegram delivery before locking Redis alert deduplication flag to avoid dropped alerts.
- [x] **Finding #5 (PR #236)** — `distributed-lock.ts`, `cron-run-claim.ts`: Retain active lock tracking on shutdown until Redis release confirmation; bound cron lock TTL to 180s.
- [x] **Finding #6 (PR #237)** — `cache-freshness.ts`, `market-tools-cache.ts`: Enforce strict fail-stale contract for missing, null, NaN, or non-positive `computedAt` in market tools cache.
- [x] **Finding #7 (PR #238)** — `fno-universe-updater.ts`, `market.service.ts`: Synchronize runtime F&O universe with official NSE list, backed by static fallback and checksum validation.
- [x] **Finding #8 (PR #239)** — `momentum-leaders.service.ts`: Correct history requirement guard from 22 to 21 candles for 21-day compounded return calculations.
- [x] **Finding #9 (PR #240)** — `scanner.service.ts`: Enforce LTP boundary checks on RANGE setups (`target > ltp` for Longs, `target < ltp` for Shorts) and extract pure `computeTradeSetup`.
- [x] **Finding #10 (PR #241)** — `market.service.ts`, `market-hours.ts`: Skip Yahoo candles with invalid/missing timestamps and generate genuine NSE trading dates via `getRecentNseTradingDays(5)`.
- [x] **Maintenance (PR #232)** — `earnings-populator.service.ts`: Deduplicate earnings populator failure alert per trading day via Redis.

---

## Deployment Governance Validation

1. **ISSUE-012 (Cron Lock TTL vs Job Timeout)**:
   - Evaluated against production architecture: Single-process PM2 `fork` mode on 1 GB Oracle Cloud VM.
   - Guarded by module-level `tickInFlight = true` mutex within `market-cron.scheduler.ts`.
   - **Verdict**: Concurrent duplicate execution is impossible in current single-process deployment. Documented as a future multi-worker risk if horizontally scaled.
2. **ISSUE-013 (Future-Dated Cache Timestamps)**:
   - Validated as low-severity theoretical boundary gap. All timestamps originate from trusted server clocks (`new Date().toISOString()`).
3. **ISSUE-014 (Coverage Governance Scope)**:
   - Confirmed as intentional 4-tier architectural boundary design. Pure domain math (Tiers 1 & 2) remains strictly enforced above 85–90% floors.
