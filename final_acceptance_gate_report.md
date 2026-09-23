# Final Acceptance Gate Report

**Repo:** cprcalculatorhp / cpr-calculator-platform
**Branch:** `main`
**Commit:** `770deb4d` (1-Month Code Review Remediation & Production Alignment)
**Report pass:** 20 (Post-1-Month Deep Code Review Remediation)
**Report generated:** 2026-09-23
**Acceptance declaration:** **VERIFIED & PASSED.** Full clean gate run completed on September 23, 2026. All production alignment and operational findings remediated, verified, and committed to `main`. No open defects or pending issues remain.

---

## Pass 20 — 23 Sep 2026: 1-Month Code Review Remediation & Production Alignment

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ 0 errors |
| ESLint | ✅ 0 errors / 0 warnings (TS files) |
| Regression lock | ✅ `2ef002db620a9545a601fb2fb23c92e1a6219ae5012ba4bc977e686e9a2072f5` |
| Unit tests | ✅ **1,199 pass · 0 fail · 2 skip** (offline guards) |
| Shadow mode | ✅ `IS_SHADOW_RUN: true` — no live order routing |
| Working tree | ✅ Clean after commit |

### Fixes in this pass

1. **NSE Tuesday Option Expiry Alignment (`option-suggestion.service.ts`)**:
   - Re-aligned monthly option expiry calculation in `computeDTE` to the true last Tuesday of the month per NSE Circulars 108/2025 and 111/2025 (effective September 1, 2025, all NSE equity/index derivatives expire on Tuesday, while BSE derivatives expire on Thursday).
   - Preserved automatic backward holiday rollover to previous trading day (`isNseTradingDay`).
   - Updated unit tests in `option-suggestion.test.ts` to validate Tuesday expiry across Aug 2026, Sep 2026, and holiday rollback for March 2026 (March 31 Mahavir Jayanti rolling back to Monday March 30).

2. **PM2 Standalone Execution Entry Point (`ops/ecosystem.config.cjs`)**:
   - Pointed PM2 runtime `script` to `server-starter.js` (was `server.js`).
   - Verified live in production: `ops/ecosystem.config.cjs` deployed to Oracle VM, PM2 restarted with `server-starter.js` active (`pid: 683132`, `uptime: online`, `restarts: 0`).
   - Ensures production PM2 process execution invokes `server-starter.js` crash-handlers (`uncaughtException`, `unhandledRejection`), static/BUILD_ID existence checks, and 0.0.0.0 binding.

3. **Backtest Friction Accounting Policy Documentation (`backtest.service.ts`)**:
   - Clarified that `0.00002` (0.002% / 0.2 bps) represents statutory NSE exchange turnover fees for Index futures (~0.0019%).
   - Documented full comparison against real trading costs: Index Futures total statutory + brokerage friction is ~0.025%–0.035% of turnover (including STT, stamp duty, GST, SEBI fee), while retail Options friction ranges from 0.15% to 0.50%+ of option premium.
   - Recommended appropriate haircuts for live strategy execution.

4. **Lot Size Test Reliability (`option-suggestion.test.ts`)**:
   - Switched `FALLBACK_LOT_SIZES` test to assert the exported table directly, eliminating unmocked network fetch hangs.

---

## Pass 19 — 23 Sep 2026: 15-Day Deep Code Review Residual Remediation

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ 0 errors |
| ESLint | ✅ 0 errors / 0 warnings (TS files) |
| Regression lock | ✅ `2ef002db620a9545a601fb2fb23c92e1a6219ae5012ba4bc977e686e9a2072f5` |
| Unit tests | ✅ **1,199 pass · 0 fail · 2 skip** (offline guards) |
| Shadow mode | ✅ `IS_SHADOW_RUN: true` — no live order routing |
| Working tree | ✅ Clean after commit |

### Fixes in this pass

1. **R-1 — STBT underlying optionContract prefix guard** (`trade-journal.service.ts`): Added `console.warn` inside `isShortUnderlyingLeg` when a STBT entry has a non-UNDERLYING `optionContract` — prevents silent wrong-direction PnL computation. Unit test added.

2. **R-2 — Friday Weekend Gate policy document** (`docs/trading-policy/friday-weekend-gate.md`): Formal policy created documenting the asymmetric Friday rule (LONG hard-blocked, SHORT in BEAR regime only), historical gap events, rationale, and review schedule. `overnight.service.ts` comment updated to reference the document.

3. **R-3 — Option lot-size CI staleness test** (`option-lot-size-staleness.test.ts`): Exported `FALLBACK_LOT_SIZES` + `LOT_SIZE_LAST_VERIFIED_CYCLE = 'FAOP70616_OCT2025'`. New test validates all major index lot sizes against FAOP70616 values and fails on next SEBI revision cycle.

4. **R-4 — Server-starter two-tier shutdown documentation** (`server-starter.js`): Added JSDoc comment block distinguishing crash path (500ms stdio flush only) from SIGTERM path (`shutdown-orchestrator.ts` DB/Redis teardown). Eliminates ambiguity about what the 500ms grace period covers.

5. **R-5 — Suppression cooldown BREAKOUT-only fallback** (`breakout-watcher.service.ts`): `recordSuppressionCooldown` fallback when no `alertKind` or `signals` provided now touches BREAKOUT key only (was both BREAKOUT + BREAKDOWN). Prevents cross-contamination of BREAKDOWN cooldown keys during BULLISH gate suppressions. Test updated.

6. **R-6 — Bhavcopy alias CI test** (`market-breadth-alias.test.ts`): New test asserts `AMBUJACEM`, `TATACHEM`, `GMRP&UI` aliases remain in `FNO_SYMBOLS`. Catches silent NSE renames before they silently drop symbols from breadth calculations.

---

## 1. Verified Infrastructure and Code Changes (Pass 18 / Sep 17, 2026)

This pass remediates all validated findings from the comprehensive 2-month deep dive review:

1. **Standalone Server Crash-Handler Bundle Packaging (Finding P1)**:
   - Updated `ops/deploy.ps1` to explicitly bundle `server-starter.js` into `.next/standalone/`, ensuring crash handlers (`uncaughtException`, `unhandledRejection`) and canonical hostname handling execute in production.

2. **Multi-Year Breakout ATH 2-Year History Qualification (Finding P3)**:
   - In `src/services/market-tools/multi-year-breakout.service.ts`, removed global database history size constraint (`historyDays >= tradingDaysAvailable`), allowing post-2016 IPOs with $\ge 2$ years of history to qualify for ATH classification.

3. **Thursday Option Expiry & Holiday-Aware DTE Computation (Findings P4, P11, P17)**:
   - In `src/services/option-suggestion.service.ts`, aligned monthly equity option expiry calculations to the last Thursday of the month with automatic rollback on NSE holidays, and filtered genuine trading days using `isNseTradingDay(cursor)` in business-day iteration.
   - In `src/tests/unit/option-suggestion.test.ts`, updated test cases to validate Thursday expiry dates and holiday rollbacks.

4. **Dynamic F&O Universe Discovery Synchronization (Finding P9)**:
   - In `src/services/market.service.ts`, enhanced `getRawUniverse()` to synthesize and append dynamic F&O symbols fetched from the authoritative NSE list that were not present in the static `STOCK_UNIVERSE` array.

5. **Rate Limit Spoofed Hop Defense (Finding P6)**:
   - In `src/app/api/cpr/calculate/route.ts`, aligned IP extraction to select the last hop of `x-forwarded-for` (and prefer `x-real-ip`) when behind a trusted proxy, preventing rate-limit bypass via spoofed client headers.

6. **Direction-Aware GAP_FAILURE Classification (Finding P8)**:
   - In `src/services/journal/trade-journal.service.ts`, computed `gapPct` accounting for trade direction, correctly classifying STBT underlying gap-up blow-throughs as `GAP_FAILURE`.

7. **Worthless Option Auto-Close at 9:45 AM (Finding P12)**:
   - In `src/services/journal/trade-journal.service.ts`, permitted writing the final 9:45 AM snapshot for options below ₹0.25, ensuring expiring contracts are cleanly auto-closed rather than orphaned.

8. **Weekend & Non-Trading Day Session Isolation (Finding P7)**:
   - In `src/services/overnight/overnight.service.ts`, properly derived `todayCandle` and `yesterdayCandle` on non-trading days when the current day bar is not yet recorded, preventing identical candle evaluation (`todayCandle === yesterdayCandle`).

9. **Telegram Alert HTML Truncation Safety (Finding P13)**:
   - In `src/services/earnings-populator.service.ts`, truncated raw error strings prior to HTML escaping to prevent mid-entity split and Telegram 400 Bad Request rejections.

10. **Index BTST Fee Calibration (Finding P10)**:
    - In `src/services/backtest/backtest.service.ts`, applied index derivative transaction fee rates (`0.002%`) rather than equity delivery rates (`0.03%`) in index BTST backtest simulation.

11. **Historical Provider Current-Session Inclusion (Finding P16)**:
    - In `src/services/backtest/historical.provider.ts`, only skipped today's candle during active market hours (`isMarketOpen()`), allowing post-close evening analyses to ingest the finalized day bar.

12. **CPR Journal Headroom Scaling (Finding P14)**:
    - In `src/services/scheduler/cpr-journal.job.ts`, increased query headroom (`take: Math.max(maxSignals * 10, 50)`) so high-frequency intraday rescans do not starve unique setups.

13. **Memory Watchdog Privilege Fallback (Finding P15)**:
    - In `ops/mem_watchdog.sh`, executed page cache drops using `sudo -n` with fallback to prevent silent command failure.

---

## 2. Verified Infrastructure and Code Changes (Pass 17 / Sep 17, 2026)

This pass integrates and verifies PRs #232 through #241 (Second Code Review Remediation: Findings #1 through #10):

1. **Strict Yahoo Candle Timestamp Validation & Genuine NSE Trading Dates (PR #241 - Finding #10)**:
   - In `src/services/market.service.ts`, invalid or missing Yahoo candle timestamps (`isNaN(candleDate.getTime())`) are skipped with `continue;` rather than fabricating arbitrary calendar dates.
   - Mock/paper stock data replaces calendar day subtraction with `getRecentNseTradingDays(5)` from `src/lib/market-hours.ts`, guaranteeing valid NSE session dates across weekends and market holidays.

2. **Enforce LTP Boundary Checks on RANGE Setups & Extract computeTradeSetup (PR #240 - Finding #9)**:
   - In `src/services/scanner.service.ts`, enforced that RANGE Long targets must strictly exceed current LTP (`target > ltp`), and RANGE Short targets must strictly sit below current LTP (`target < ltp`), preventing already-crossed R1/S1 levels from being suggested as targets.
   - Extracted pure helper `computeTradeSetup` with fallback offsets (`ltp * 1.005` / `ltp * 0.995`) ensuring minimum 1.5 R:R and target beyond LTP.

3. **Momentum Leaders Minimum History Requirement Updated from 22 to 21 Candles (PR #239 - Finding #8)**:
   - In `src/services/market-tools/momentum-leaders.service.ts`, corrected history requirement guard from `< 22` to `< 21`. Since `computeCompoundedReturn(k=21)` slices 21 candles with embedded `prevClose` providing 21 daily returns, 21 candles are mathematically sufficient.

4. **Synchronize Runtime F&O Universe with Authoritative NSE List (PR #238 - Finding #7)**:
   - In `src/lib/fno-universe-updater.ts` and `src/services/market.service.ts`, added runtime synchronization against official NSE F&O participant list with verified static fallback and checksum validation.

5. **Fail-Stale Contract for Missing or Non-Positive computedAt (PR #237 - Finding #6)**:
   - In `src/lib/cache-freshness.ts`, strictly enforced `reportComputedTime <= 0 || !Number.isFinite(reportComputedTime)` triggers `'STALE'` status across all market tools.
   - In `market-tools-cache.ts`, removed fallback to `Date.now()` when cached payload lacks valid `computedAt`.

6. **Distributed Lock Shutdown Retention & Lock TTL Bounding (PR #236 - Finding #5)**:
   - In `src/lib/distributed-lock.ts`, retained active lock tracking during process exit until Redis release confirmation, and added a 50ms fast-retry on transient Redis connection errors.
   - In `src/services/scheduler/cron-run-claim.ts`, bounded default cron lock TTL to 180s with Lua script release validation.

7. **Telegram Delivery Verification Before Earnings Deduplication Lock (PR #235 - Finding #3 / #4)**:
   - In `src/services/earnings-populator.service.ts`, deferred setting the Redis deduplication flag until Telegram message delivery is confirmed successful, preventing silent alert drops on network delivery failures.

8. **Orphan Journal Date Mismatch & overnightSignalId Linkage (PR #234 - Finding #2)**:
   - In `src/services/scheduler/btst-alert.job.ts` (`checkGapFailureExits`), resolved date mismatch by tracking `signalDate` separately from exit `dateKey`, and preferred direct `overnightSignalId` foreign key linkage before falling back to `(symbol, date)` lookup.

9. **Option Fallback Lot Sizes & Tuesday Expiry DTE Alignment (PR #233 - Finding #1)**:
   - In `src/lib/options-pricing.ts` and `src/services/options.service.ts`, updated fallback lot sizes to current NSE contracts (NIFTY 25, BANKNIFTY 15, FINNIFTY 25).
   - Aligned option DTE computation to Tuesday weekly index expiry with NSE trading holiday roll-back to Monday/preceding trading day.

10. **Deduplicate Earnings Populator Failure Alert per Trading Day (PR #232)**:
    - In `src/services/earnings-populator.service.ts`, added per-trading-day deduplication key `earnings_alert_sent:<date>` in Redis with 24-hour TTL to prevent alert flooding during repeated retry intervals.

11. **Final Audit Governance & Architectural Validation**:
    - **ISSUE-012 (Cron Lock TTL vs 240s Precompute Timeout)**: Validated for single-process PM2 deployment. In-process mutex (`tickInFlight = true`) and single-instance `exec_mode: 'fork'` prevent duplicate job executions; documented as a future multi-worker architectural risk.
    - **ISSUE-013 (Future-Dated Cache Timestamps)**: Validated as low-severity theoretical boundary gap; timestamps strictly originate from trusted server clocks.
    - **ISSUE-014 (Coverage Governance Scope)**: Verified as intentional 4-tier architectural boundary design choice.

12. **Verification Metrics (Pass 17 / Sep 17, 2026)**:
    - **TypeScript `tsc --noEmit`:** 0 errors.
    - **ESLint (`npm run lint`):** 0 errors, 0 warnings.
    - **Regression Lock (`npm run regression-lock`):** Constants SHA-256 verified; math benchmark 3.00 ms.
    - **Unit Tests (`npm run test`):** **1,158 tests passed (0 failures) across 56 test files**.
    - **E2E Tests:** **37 tests passed across 17 suites**.
    - **Tiered Coverage (`scripts/check-coverage-tiers.ts`):**
      - **Tier 1 (Core Lib)**: 93.21% lines (req >=90%), 85.62% branches (req >=85%), 97.47% functions (req >=90%) — PASS
      - **Tier 2 (Trading Engine & Alerts)**: 85.81% lines (req >=85%), 81.01% branches (req >=80%), 92.59% functions (req >=90%) — PASS
      - **Tier 3A (Market Tools)**: 69.01% lines (req >=64%), 75.17% branches (req >=70%), 87.75% functions (req >=84%) — PASS
      - **Tier 3B (Backtest Engine)**: 51.44% lines (req >=46%), 67.38% branches (req >=62%), 88.61% functions (req >=79%) — PASS
    - **GitHub Actions CI:** `verify` workflow passed.

---

## 2. Verified Infrastructure and Code Changes (Pass 16 / Sep 14, 2026)

This pass integrates and verifies the 3-week comprehensive review remediation (PRs #205–#225) and follow-up hardening (PRs #227–#230):
- **Overnight & Journal Engine (PRs #205, #207, #214, #215, #228)**: Frozen tick timestamps in scheduler, STBT underlying leg PnL inversion fix, live LTP journal triggers, bounded lookback for orphaned signals.
- **Market Tools & Caching (PRs #206, #208, #222, #227)**: Preserved Redis cache `computedAt` age, unified ATH breakout cascade with 2-year data depth check, API pagination limits, fail-stale on missing/zero timestamps.
- **Scanner & Alert Pipelines (PRs #209, #210, #216, #217, #223, #229, #230)**: ATR-scaled breakout cap, pre-claim suppression cooldowns, direction-isolated suppression keys, Telegram chat ID decoupling, option suggestion timeout tightening, corporate event structural validation.
- **Infrastructure & Concurrency (PRs #211, #218, #219, #224, #225)**: CI Postgres service container, PM2 memory watchdog restart semantics, server crash handler grace period, scanner composite index optimization, distributed lock cleanup retention.
- **Backtest & Quantitative Models (PRs #212, #213, #220, #221)**: Inclusive Rule 5 liquidity boundary, Friday BTST long gate, long-weekend historical gap tightening, strategy mode benchmarking.

---

## 3. Verified Infrastructure and Code Changes (Pass 15 / Sep 11, 2026)

This pass integrates and verifies PRs #201 and #202 on top of the 10-day deep code review remediation and production hardening baseline (PRs #166 through #200):

1. **Atomic Fixed-Window Rate Limiting via Lua Script (PR #202 / Issue D)**:
   - Fixed a sliding-window rate limit regression where missing `NX` flag caused repeated increments to refresh the key's TTL to 15 minutes, resulting in potential indefinite lockout.
   - Replaced Redis multi/pipeline with an atomic Lua script executed via `redis.eval`:
     ```lua
     local count = redis.call('INCR', KEYS[1])
     if redis.call('TTL', KEYS[1]) == -1 then
       redis.call('EXPIRE', KEYS[1], ARGV[1])
     end
     return count
     ```
   - Works across Redis 6 and Redis 7+; sets TTL only when key has no prior expiry (`TTL == -1`).
   - Mock updated in `src/tests/unit/auth-unlock.test.ts` and regression test added in `src/tests/unit/redis.test.ts`.

2. **Public Market Status Route Auth Gating Exemption (PR #201)**:
   - Added `/api/market-status` to public API exemptions in `src/middleware.ts`.
   - Allows unauthenticated public navbar probes and automated headless smoke checks to complete cleanly without requiring auth credentials.

3. **10-Day Deep Code Review Defect Remediation (PR #199)**:
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
