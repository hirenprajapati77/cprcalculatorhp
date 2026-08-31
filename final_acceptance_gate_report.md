# Final Acceptance Gate Report

**Repo:** cprcalculatorhp / cpr-calculator-platform  
**Branch:** `main`  
**Report pass:** 12 (Post-PR #150 — ETF Exclusion Gaps & Database Migration Fixes)  
**Report generated:** 2026-08-31  
**Acceptance declaration:** **VERIFIED & PASSED.** Full clean gate run completed on August 31, 2026.

---

## 1. Verified Infrastructure and Code Changes (Pass 12 / Aug 31, 2026)

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
