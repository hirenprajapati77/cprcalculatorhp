# Final Acceptance Gate Report

**Repo:** cprcalculatorhp / cpr-calculator-platform  
**Branch:** `main`  
**Report pass:** 14 (Post-10-Day Deep Code Review, Tiered Coverage Governance & Production Hardening)  
**Report generated:** 2026-09-10  
**Acceptance declaration:** **VERIFIED & PASSED.** Full clean gate run completed on September 10, 2026 (`npm run release:check` + `npm run test:e2e`).

---

## 1. Verified Infrastructure and Code Changes (Pass 14 / Sep 10, 2026)

This pass integrates and verifies the comprehensive 10-day deep code review remediation, architectural tiered coverage governance, and production hardening backlog across PRs #166 through #199:

1. **10-Day Deep Code Review Defect Remediation (PR #199)**:
   - **Gap-Failure Exit Data Integrity (`btst-alert.job.ts`)**: Skips option trade journal leg when option CMP cannot be resolved, preventing spot stock LTP pollution into option PnL calculations.
   - **Distributed Cron Lock TOCTOU Race Condition Closure (`cron-run-claim.ts`)**: Re-checks `cron_done:${key}` immediately after acquiring `cron_lock:${key}` to eliminate duplicate execution windows.
   - **Prisma P2002 Concurrency Error Handling (`index-overnight-persist.ts`)**: Absorbs unique constraint collisions on concurrent index BTST signal upserts.
   - **CSV Formula Injection Defense Hardening (`export-utils.ts`)**: Hardened regex to `/^\s*[=+\-@\t\r]/` neutralizing payloads with leading whitespace.
   - **ETF Exclusion Regex Suffix Matching (`nse-fund-exclusion.ts`)**: Added `(GSEC|GILT)\d*$` for government security funds without word boundaries.
   - **Unmounted Component Timer Cleanup (`ScannerClient.tsx`)**: Hoisted and cleared drawer indicator timers on component unmount.
   - **E2E Test Harness Timeout Expansion (`harness.ts`)**: Increased ready timeout to 60s (`E2E_READY_TIMEOUT_MS`) for slow startup environments.
   - **Unhandled Rejection Recovery (`server-starter.js`)**: Added `process.exit(1)` on `unhandledRejection` so corrupt processes restart cleanly via PM2.
   - **Telegram Rate-Limit Exponential Backoff (`telegram.service.ts`)**: Added HTTP 429 retry using `retry_after` header (capped at 5s).
   - **Uniform Constant-Time String Comparison (`auth-token.ts`)**: Eliminated early exit on empty strings in `timingSafeEqual`.
   - **Query Deadline Alignment (`db-query-guard.ts`)**: Aligned application query deadline with Prisma transaction timeout.
   - **Provisional 2027 Market Holidays (`market-hours.ts`)**: Added provisional fixed national holidays for 2027.
   - **Market Breadth Zero Advance/Decline Guard (`market-breadth.service.ts`)**: Defaulted `adRatio` to 1.0 (neutral parity) when both advances and declines are 0.
   - **Invalid Session OHLC Fallback (`overnight.service.ts`)**: Fallback to `lastCandle` when live session OHLC is zeroed or invalid.
   - **HTTP Security Headers (`next.config.ts`)**: Enforced `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy: strict-origin-when-cross-origin`.

2. **Orphaned Coverage Script Cleanup (PR #198)**:
   - Removed deprecated `test:coverage:core` and `test:coverage:services` from `package.json`, directing all validation through `scripts/check-coverage-tiers.ts`.

3. **Tiered Code Coverage Governance (PR #197 / ISSUE-004)**:
   - Implemented 4-tier architectural coverage governance (`scripts/check-coverage-tiers.ts`):
     - **Tier 1 (Core Lib)**: 92.39% lines (req >=90%), 85.18% branches (req >=85%), 95.82% functions (req >=90%) — PASS
     - **Tier 2 (Trading Engine & Alerts)**: 85.64% lines (req >=85%), 81.26% branches (req >=80%), 95.47% functions (req >=90%) — PASS
     - **Tier 3A (Market Tools)**: 68.98% lines (req >=64%), 75.17% branches (req >=70%), 89.11% functions (req >=84%) — PASS
     - **Tier 3B (Backtest Engine)**: 51.39% lines (req >=46%), 67.06% branches (req >=62%), 84.48% functions (req >=79%) — PASS
   - Added 27 new unit test suites across all tiers (+3,105 lines of tests).

4. **Production Hardening, E2E Security & Operational Governance (PRs #181–#196)**:
   - **Fail-Closed Distributed Locks (PR #196)**: Fail closed in production when Redis is unreachable.
   - **Smoke Verification TLS Enforcement (PR #195)**: Default strict TLS checks in `scripts/smoke_verify.sh`.
   - **Dependency CVE Remediations (PR #194)**: Upgraded `next`, `sharp`, `js-yaml`, and `hono`.
   - **CPR Journal EOD Lookahead Bias Reversal (PR #191 & #193)**: Reverted EOD target-achieved override to eliminate selection bias.
   - **Market Tools Cache Freshness Contract (PR #187, #192 / ISSUE C, ISSUE-008)**: Wired `evaluateReportFreshness` directly into read endpoints; enforced 7-day maximum safety TTL.
   - **Deterministic Build ID Strategy (PR #190 / ISSUE-011)**: Implemented 12-char git commit SHA build ID and `/api/build-id` runtime endpoint.
   - **E2E Security Attack Scenarios (PR #189 / ISSUE-010)**: Hardened against CSV injection, path traversal, auth bypasses, and timing attacks.
   - **Production Smoke Verification Script (PR #188 / ISSUE-009)**: Built `scripts/smoke-verify.ts` with post-deploy verification hooks.
   - **Scoped Database Query Timeouts (PR #186 / ISSUE-007)**: Enforced statement timeouts via `db-query-guard.ts` and optimized composite indexes on `DailyOhlcv`.
   - **Zero-Dependency E2E Test Harness (PR #185 / ISSUE-005)**: 37 automated E2E tests across 17 suites against ephemeral server.
   - **CI Release Gate Parity (PR #184 / ISSUE-004)**: Enforced `release:check` in GitHub Actions CI workflows.
   - **Canonical OHLCV Candle Geometry Validation (PR #178 & #183 / ISSUE-003)**: Enforced strict candle geometry across computation boundaries.
   - **Concurrency & Cold-Cache Protection (PR #181 & #182 / ISSUE-001, ISSUE-002)**: Protected heavy computation with distributed locks and blocked anonymous cold-cache compute.

5. **Verification Metrics (Pass 14 / Sep 10, 2026)**:
   - **TypeScript `tsc --noEmit`:** 0 errors.
   - **ESLint (`npm run lint`):** 0 errors.
   - **Regression Lock (`npm run regression-lock`):** Hash `2ef002db...` 100% stable; core execution 4.70ms.
   - **Security Audit (`npm run security:check`):** 0 high or critical vulnerabilities.
   - **Unit Tests:** **1,105 tests across 216 suites (1,104 pass, 1 skip, 0 fail)** (~36.4s).
   - **E2E Tests:** **37 tests across 17 suites (37 pass, 0 fail)**.
   - **GitHub Actions CI:** All check gates (`verify`) green.

---

## 2. Verified Infrastructure and Code Changes (Pass 13 / Sep 1, 2026)

This pass integrates and verifies the 1-month comprehensive deep review across all 303 commits (Aug 1 – Sep 1, 2026):

1. **Index BTST/STBT Discovery Window Parity**:
   - Updated `index-ranking.service.ts` to allow index scoring when `last15mHigh`/`last15mLow` is `null`, enabling signal discovery during 15:10–15:15 IST before the closing window forms.

2. **Scheduler Timeout Lock Retain & Hang Protection**:
   - Defined `TimeoutError` in `with-timeout.ts` and updated `market-cron.scheduler.ts` to retain the claim lock when timeouts occur, preventing overlapping duplicate background processes from leaking sockets and memory.

3. **Pattern Breakout Deduplication & Date Bounding**:
   - Added `inFlightCompute` promise singleton to `pattern-breakout.service.ts` to deduplicate concurrent requests.
   - Bounded CTE queries with `WHERE date >= :oldestDate` across the 626K+ row `DailyOhlcv` table.
   - Expanded `detectFlatBase` window to 45 candles.

4. **Option Theta Risk Buffer Mathematical Correction**:
   - Corrected formula in `option-suggestion.service.ts` to `(1 - thetaBuffer)` so options with $\le 4$ DTE receive a 10% tighter stop loss during expiry week.

5. **Extension Gate Historical Backtesting Clock Alignment**:
   - Updated `resolvePreviousClose` in `entry-manager.service.ts` to prioritize historical series data relative to `asOfDate` rather than today's live close.

6. **Bhavcopy Ingest NaN Sanitization**:
   - Added `isNaN` guards for `value` and `trades` in `bhavcopy-ingest.ts` to protect batch transactions.

7. **Memory Watchdog Redis Key Protection**:
   - Updated `ops/mem_watchdog.sh` `is_protected_redis_key` to include `market_tools:*|market_breadth:*`, preventing off-hours cache pruning.

8. **Telegram Breakout Alert Fallback**:
   - Added fallback to `TELEGRAM_CHAT_ID` when group chat ID is unconfigured.

9. **Verification Metrics**:
   - TypeScript `tsc --noEmit`: 0 errors.
   - Unit Tests: 715/716 pass, 0 failures, 1 skipped.
   - GitHub Actions CI: Run #24 passed on hosted runners (1m 23s).
   - Production URL: `https://129-159-230-41.nip.io` (healthy).

---

## 2. Verified Infrastructure and Code Changes (Pass 12 / Aug 31, 2026)

This pass integrates and verifies the ETF scanner leak fixes and database optimizations merged as PR #150:

1. **ETF Scanner Leak Resolution**:
   - Added `KNOWN_GAP_SYMBOLS` set (`HDFCMOMENT`, `MONQ50`, `LICNMID100`, `MULTICAP`) to filter out newly confirmed fund leaks.
   - Removed a regex bug (stray trailing `$`) that would have restricted prefix matching for `MID` group.

2. **Database Schema Cleanup**:
   - Dropped duplicate index `@@index([symbol, date])` from the `DailyOhlcv` model.
   - Generated and executed migration `20260831104947_remove_duplicate_daily_ohlcv_index` on production Postgres to drop the index.

3. **Precompute Failure Propagation**:
   - Refactored `runMarketToolsPrecomputeJob` to compute `anySucceeded` and return it as the `success` field rather than a hardcoded `true` to ensure job errors trigger cron scheduler retries.

4. **PostgreSQL Date Cast Resolution**:
   - Fixed text vs timestamp type mismatch (`operator does not exist: text >= timestamp without time zone`) inside `pattern-breakout.service.ts` raw query by casting the 150-day window subtraction back to `::date::text`.

5. **Unit Test Updates**:
   - Standardized `cpr-journal-job.test.ts` default LTP values from 103 to 101.2 to avoid false extension skips under the tightened 1.5% extension cap.

---

## 2. Verified Infrastructure and Code Changes (Pass 11 / Aug 20, 2026)

This pass integrates and verifies the five-fix robustness hardening merged as PR #140 following forensic analysis of the FORTIS Aug 19, 2026 PE trade loss (−32% option P&L on a +0.78% adverse spot gap):

1. **Market Regime Gate in CPR Journal (Fix 1)**:
   - `runCprJournalJob` now fetches `RegimeService.getMarketRegime` once per run and derives `suppressShort` / `suppressLong` flags — mirroring `btst-journal.job.ts`.
   - SHORT/PE signals suppressed in `BULL` regime; LONG/CE signals suppressed in `BEAR` regime.
   - When `regime.reliable === false` (Nifty history unavailable), **both** directions suppressed (fail-closed).
   - Log line: `[CPRJournal] Regime: BULL (score 80, reliable=true) → suppressShort=true suppressLong=false`.

2. **Signal Confluence / Direction Contradiction Filter (Fix 2)**:
   - New exported `validateCprSignalConfluence(signalSummary, direction)` in `cpr-direction.ts`.
   - SHORT invalidators: `GAP_UP`, `HP_CAM_BULL_BIAS`, `HP_DIRECT_UP`.
   - LONG invalidators: `GAP_DOWN`, `HP_CAM_BEAR_BIAS`, `HP_DIRECT_DOWN`.
   - Returns `{ valid: false, reason: 'DIRECTION_CONFLICT:GAP_UP' }` on conflict; wired into job loop before any market data fetch.

3. **Dynamic Delta + DTE Theta Risk Buffer (Fix 3)**:
   - `option-suggestion.service.ts` `buildSuggestion`: flat `delta = 0.7` replaced by `{ 1: 0.52, 2: 0.65, 3: 0.80 }[itmDepth]`.
   - New `computeDTE(optionSymbol, underlying, todayStr)` private static method parses Fyers weekly (`26820`) and monthly (`26AUG`) expiry tokens and counts business days remaining.
   - When DTE <= 4: `thetaBuffer = 0.10` tightens the SL distance by 10%.

4. **CPR GAP_FAILURE Classification Fix (Fix 4)**:
   - `classifyExecutionOutcome` in `trade-journal.service.ts`: removed `trade.signalType !== 'CPR'` exclusion.
   - CPR trades with adverse cmp916/cmp930/exitCmp gap > 15% now correctly labelled `GAP_FAILURE`.

5. **9:16 AM Dead Tick Guard (Fix 5)**:
   - `captureSnapshot` in `trade-journal.service.ts`: skips writing any CMP < Rs.0.25 (pre-market auction ticks).
   - Defers write to next slot (9:30 or 9:45 AM), preventing distorted PnL and false GAP_FAILURE classifications.

---

## 2. Verified Infrastructure and Code Changes (Pass 10 / Aug 16, 2026)

This pass integrates and verifies the full suite of production fixes and features merged across PR #98 through PR #135:

1. **Empty Calendar TRADEABLE & In-Window GET Cache (PR #135)**: Fixed empty MarketEvent calendar causing false WATCHLIST demotion; cached in-window GET /api/overnight during 15:10-15:25 IST.
2. **NSE F&O Check Drift Timeout (PR #134)**: Added 10s AbortSignal.timeout(10_000) to FnoUniverseCheckService.checkDrift().
3. **Scanner Controller Persistence & Retry (PR #133)**: DatabaseCircuitBreaker + single 3s retry + 24h Redis failure marker.
4. **C2 Documentation & Method Alignment (PR #132)**: cpr-journal uses suggestOption; btst-journal uses suggestOptionForBtst.
5. **PCR Gate & Alert Cooldown (PR #131)**: Suppressed PCR-gated claims; standardized regime.reliable === false handling.
6. **LICI Bull-Trap & Scanner Hang Fixes (PR #130)**: Suppressed counter-trend breakouts vs prior close; POST /api/scanner/refresh returns 202.
7. **Telegram Alert Routing & Formatting (PR #71, PR #127)**: BTST/STBT route to group chat; dynamic SL footer.

## 3. Full Verification Gate Output (Aug 31, 2026 — Pass 12)

### 3.1 Prisma Schema Generation
- **Command:** `npx prisma generate`
- **Status:** **CLEAN** (dropped duplicate DailyOhlcv index; verified locally and migrated successfully in production)

### 3.2 TypeScript Typecheck
- **Command:** `npx tsc --noEmit`
- **Status:** **CLEAN** (0 errors)

### 3.3 Unit & Integration Tests
- **Command:** `npm run test`
- **Total Tests:** 699
- **Passed:** **698** *(+38 net new since Pass 11)*
- **Failed:** **0**
- **Skipped:** 1 *(pre-existing intentional skip, unchanged)*
- **Test Suites:** 119 *(+7 since Pass 11)*
- **Duration:** ~21.9s

### 3.4 New Tests Added in Pass 12 (1 test suite / 1 new test file + 1 nested test case)

| Test Suite | Test Name | Status |
|---|---|---|
| isLikelyEtfOrFund | isLikelyEtfOrFund catches individually confirmed gap symbols | PASS |

---

## 4. Full Verification Gate Output (Aug 20, 2026 — Pass 11)

### 3.1 Prisma Schema Generation
- **Command:** `npx prisma generate`
- **Status:** **CLEAN** (no schema changes in PR #140; previously verified clean in Pass 10)

### 3.2 TypeScript Typecheck
- **Command:** `npx tsc --noEmit`
- **Status:** **CLEAN** (0 errors)

### 3.3 Unit & Integration Tests
- **Command:** `npm run test`
- **Total Tests:** 661
- **Passed:** **660** *(+25 net new since Pass 10)*
- **Failed:** **0**
- **Skipped:** 1 *(pre-existing intentional skip, unchanged)*
- **Test Suites:** 112 *(+4 since Pass 10)*
- **Duration:** ~46.7s

### 3.4 New Tests Added in PR #140 (11 tests)

| Test Suite | Test Name | Status |
|---|---|---|
| Regime Suppression | BULL regime suppresses SHORT (PE) — core FORTIS guard | PASS |
| Regime Suppression | BULL regime allows LONG (CE) through | PASS |
| Regime Suppression | BEAR regime suppresses LONG (CE) | PASS |
| Regime Suppression | BEAR regime allows SHORT (PE) through | PASS |
| Regime Suppression | Unreliable regime suppresses all signals (fail-closed) | PASS |
| Signal Confluence | Rejects SHORT + GAP_UP — exact FORTIS scenario | PASS |
| Signal Confluence | Rejects SHORT + HP_CAM_BULL_BIAS | PASS |
| Signal Confluence | Rejects LONG + GAP_DOWN | PASS |
| Signal Confluence | Allows clean SHORT (no contradictory tags) | PASS |
| Signal Confluence | Allows clean LONG (no contradictory tags) | PASS |
| mockJobDeps | RegimeService.getMarketRegime properly stubbed and restored | PASS |

---

## 4. Full Verification Gate Output (Aug 16, 2026 — Pass 10)

### 4.1 Prisma Schema Generation
- **Status:** CLEAN (Prisma Client v6.19.3 generated in 171ms)

### 4.2 TypeScript Typecheck
- **Status:** CLEAN (0 errors)

### 4.3 Unit & Integration Tests
- **Total Tests:** 636 | **Passed:** 635 | **Failed:** 0 | **Skipped:** 1 | **Suites:** 108 | ~21.6s

---

**Bottom Line (Pass 12):** All code review items, ETF scanner leaks (HDFCMOMENT, etc.), duplicate DailyOhlcv index issues, precompute reporting bugs, and PostgreSQL date arithmetic type mismatches are fully resolved, verified, and deployed. 698 active tests pass cleanly with zero type errors.
