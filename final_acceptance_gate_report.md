# Final Acceptance Gate Report

**Revision: regenerated 2026-08-06 (audit remediation pass 4).**

Pass 4 is a **test cleanup** submission. The stale unit test added in `4a6a082` to
validate the rejected score-path `env.CPR_WEIGHT` unification was **deleted** (not
weakened). The verification gate in §8 was re-run against the **post-deletion** file
bytes fingerprinted in §7.5.

**First pass with a fully green gate:** `npx prisma generate`, `npx tsc --noEmit`, and
`npm run test:unit` all exit **0** (§8). **510 tests, 509 pass, 0 fail, 1 skipped.**
No known-failing tests remain.

**Disclosed-but-unfixed items still open** (not gate blockers): see §6.

---

## 0. Audit remediation history

### 0.A Pass 2 fixes (2026-08-05) — in place, re-verified pass 4

| # | Finding | Action | Pass 4 check |
|---|---|---|---|
| 1 | `telegram.service.ts` used `process.env.NODE_ENV` | `env.NODE_ENV` at lines 26 and 225 | **Checked — matches** (fingerprint unchanged) |
| 2 | Inline `isNoVdu ? 35 : 15` ternaries | `BTST_SCORING.CPR_NARROW_WEIGHT*` constants | **Checked — matches** |
| 3 | Dead `CPR_QUALITY_` badge | Deleted from `ScannerClient.tsx` | **Checked — matches** |
| 4–5 | §5d scanner DB site count | Report corrected | **Checked — matches** |

### 0.B Pass 3 — unauthorized score-path unification reverted (PR #86)

Reverted `calculateLongScore` / `calculateShortScore` to fixed constants only; line ~420
(`scoreBreakdown`) still honors `env.CPR_WEIGHT`. **Re-verified pass 4 — unchanged**
(fingerprint `01d25608cb22e869d136bfd41143179b`).

### 0.C Pass 4 — stale test deleted

**Action:** Deleted entire test block in `src/tests/unit/btst.test.ts`:

`test('no_vdu_weighted strategyVariant honors env.CPR_WEIGHT override', ...)`

(lines 313–341 in pre-pass-4 file; included `try/finally` and both `longScore` and
`scoreBreakdown` assertions).

**Reason:** Test premise is the rejected design — that `longScore` honors
`env.CPR_WEIGHT` on the score-affecting path. Pass 3 reverted that behavior. Keeping
the test (even with weakened assertions) would invite the same unauthorized fix to
reappear.

**Also removed:** unused `import { env } from '../../config/env'` (only consumer was
deleted test).

**Dependency grep (pass 4):** `rg "honors env.CPR_WEIGHT|CPR_WEIGHT override|no_vdu_weighted strategyVariant"` across `src/` — **zero matches** after deletion.

**Files touched pass 4:** `src/tests/unit/btst.test.ts` only (per constraints).

### 0.2 Latent divergence — disclosed, not fixed (unchanged)

Score path (lines 144–146, 232–234): fixed `BTST_SCORING` constants, ignores
`env.CPR_WEIGHT`. Breakdown path (lines 420–421): honors `env.CPR_WEIGHT`. With
`CPR_WEIGHT=25`, `longScore` is 35 while `scoreBreakdown.cprNarrow` is 25. Defaults
agree. Pending separate approval to unify.

---

## 1. Files Modified

### Pass 4 (this submission)

- **`src/tests/unit/btst.test.ts`** — deleted stale `CPR_WEIGHT` override test; removed
  unused `env` import.

### Prior passes (unchanged in pass 4)

- **`src/services/backtest/btst.service.ts`** — pass 2 constants + pass 3 revert.
- **`src/services/alert/telegram.service.ts`**, **`src/config/trading-constants.ts`**,
  **`src/components/scanner/ScannerClient.tsx`** — pass 2 fixes.
- Production hardening files — pass 2; re-verified, fingerprints unchanged.

---

## 2. Shared Utilities

Unchanged (`src/lib/circuit-breaker.ts`).

## 3. Regression Verification

Baseline: `1081b56`.

| Command | Exit code | Result |
|---|---|---|
| `npx prisma generate` | **0** | §8.1 |
| `npx tsc --noEmit` | **0** | §8.2 |
| `npm run test:unit` | **0** | §8.3 — **510 tests, 509 pass, 0 fail, 1 skipped** |

This is the **first pass** where all three gate commands exit 0 with **no failing
tests**. The single skip is environment-only (Postgres unreachable) — see §6.

## 4. Breaking Changes

Unchanged from pass 2 §4.

## 5. Scope-Creep Diffs / Proof Audit

Unchanged from pass 3 §5; re-verified pass 4 (no edits to audited files).

## 6. Known Issues (remaining — not gate blockers)

| Item | Status |
|---|---|
| `cprNarrowWeight` vs `env.CPR_WEIGHT` divergence (§0.2) | **Open** — disclosed; needs separate approval |
| Stale CPR_WEIGHT override test | **Closed** — deleted pass 4 |
| Postgres skip (`TradeJournal … overnightSignalId linkage`) | **Open** — env limitation; 1 skipped test |
| `CPR_QUALITY_` in `scripts/` | **Open** — outside `src/` bundle |
| `prisma-setup.js` SQLite default | **Open** — local tooling only |

## 7. Deferred Items

Unchanged (`cpr_deferred_implementation_notes.md`).

## 7.5 Proof-of-work file fingerprints (mandatory)

Gate §8 executed **after** pass 4 test deletion. Zip must contain files with **identical
MD5** to this table.

| File | MD5 | Bytes | Pass | Changed pass 4? |
|---|---|---|---|---|
| `src/tests/unit/btst.test.ts` | `69fe7294f6c9afb10d68379edcc080ab` | 13431 | **4** | **Yes** |
| `src/services/backtest/btst.service.ts` | `01d25608cb22e869d136bfd41143179b` | 21421 | 3 | No — matches pass 3 |
| `src/services/alert/telegram.service.ts` | `6b1f259b3c51855f28b70b7ea6df5e39` | 12467 | 2 | No — matches pass 3 |
| `src/components/scanner/ScannerClient.tsx` | `75e3a8c7aaf51be45111ad149c39b9c6` | 208287 | 2 | No — matches pass 3 |
| `src/config/trading-constants.ts` | `961f2379ecf78d70dba9942311d5c95a` | 3449 | 2 | No — matches pass 3 |

`final_acceptance_gate_report.md` fingerprint is recorded in §8.5 after §8 raw output is
appended (report bytes change when §8 is written).

Working tree: uncommitted on `main` (HEAD `7c7d418`). **Not committed to main** per
constraints.

---

## 8. Verification Gate — raw terminal output

Captured 2026-08-06 after pass 4, against `btst.test.ts` md5 `69fe7294f6c9afb10d68379edcc080ab`.

### 8.1 `npx prisma generate`

```text
node.exe : npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm 
help npmrc` for supported config options.
At line:1 char:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (npm warn Unknow...config options.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma

✔ Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 230ms

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Need your database queries to be 1000x faster? Accelerate offers you that and more: https://pris.ly/tip-2-accelerate
PRISMA_EXIT_CODE=0
```

### 8.2 `npx tsc --noEmit`

```text
node.exe : npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm 
help npmrc` for supported config options.
At line:1 char:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (npm warn Unknow...config options.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
TSC_EXIT_CODE=0
```

### 8.3 `npm run test:unit`

```text
node.exe : npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm 
help npmrc` for supported config options.
At line:1 char:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (npm warn Unknow...config options.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 

> cpr-calculator-platform@0.1.0 test:unit
> node --import ./scripts/set-test-env.mjs --import tsx --test --test-force-exit src/tests/unit/**/*.test.ts

▶ aggregateSignalAnalytics
  ✔ calculates baseline correctly (1.1012ms)
  ✔ aggregates KGS_DIRECT_UP correctly (0.3465ms)
  ✔ aggregates BULLISH with neutral lift (0.2313ms)
  ✔ confidence is Low for small sample sizes (0.1742ms)
  ✔ returns empty result for empty input (3.8068ms)
  ✔ handles null signalSummary gracefully (0.3943ms)
  ✔ calculates liftExclusive correctly where signal appears in some but not all trades (0.281ms)
  ✔ handles degenerate case where signal appears in every single trade (liftExclusive should equal winRate) (0.3285ms)
  ✔ excludes breakeven (pnl === 0) trades from winRate denominator (0.3328ms)
✔ aggregateSignalAnalytics (12.9216ms)
▶ cron-secret API exemptions (P1-3)
  ✔ exempts /api/cron/* and refresh routes used by the runbook (1.7644ms)
  ✔ does not exempt normal BTST/overnight GETs (still need APP_ACCESS_TOKEN) (0.4594ms)
✔ cron-secret API exemptions (P1-3) (4.9649ms)
▶ shouldFreshDiscoverBtst
  ✔ does not discover outside the window without bypass (1.1301ms)
  ✔ serves cache on bypass (no fresh discover) (0.1996ms)
  ✔ fresh-discovers on bypass when cache is empty (0.138ms)
  ✔ fresh-discovers when the execution window is open (0.1504ms)
✔ shouldFreshDiscoverBtst (19.8613ms)
▶ maskSecretTail
  ✔ masks leaving the last 4 characters (0.3951ms)
  ✔ returns **** for short values (0.2227ms)
✔ maskSecretTail (0.9587ms)
▶ publicApiError
  ✔ hides internal messages outside development (0.6182ms)
✔ publicApiError (0.8649ms)
▶ POST /api/auth/unlock
  ✔ sets HttpOnly cookie when token matches APP_ACCESS_TOKEN (53.4684ms)
  ✔ rejects wrong token with 401 and no cookie (15.2189ms)
  ✔ rejects non-string token without throwing (1.6212ms)
  ✔ sets Secure when request is https (1.7467ms)
  ✔ rate limits after 5 attempts (4.8896ms)
✔ POST /api/auth/unlock (79.3583ms)
▶ POST /api/auth/logout
  ✔ clears the access cookie (1.5009ms)
✔ POST /api/auth/logout (1.7836ms)
▶ BTST backtest — single-day EOD-forced-exit simulation (Task I)
  ✔ Case 1: LONG — target hit intraday on next day (2.7038ms)
  ✔ Case 2: LONG — SL hit intraday on next day (0.447ms)
  ✔ Case 3: LONG — neither SL nor target hit → EOD forced exit at close (0.3635ms)
  ✔ Case 4: SHORT — target hit intraday on next day (0.2929ms)
  ✔ Case 5: SHORT — neither SL nor target hit → EOD forced exit at close (0.4593ms)
  ✔ Case 6: ENTRY timestamp uses config.entryDate when OHLC is next-day only (3.2724ms)
✔ BTST backtest — single-day EOD-forced-exit simulation (Task I) (22.5498ms)
▶ TradeEngine — CLOSED_TIME_EXIT at exact window boundary
  ✔ exits CLOSED_TIME_EXIT when SL/Target not hit within 3-day window (3.2377ms)
  ✔ exits CLOSED_TIME_EXIT at day 1 when window is 1 candle (0.3934ms)
  ✔ exits CLOSED_SL before window boundary if SL is hit (0.3683ms)
  ✔ exits CLOSED_TARGET before window boundary if Target is hit (0.2795ms)
  ✔ CLOSED_TIME_EXIT — exit price is close of LAST candle in bounded window (0.3013ms)
✔ TradeEngine — CLOSED_TIME_EXIT at exact window boundary (6.65ms)
▶ Backtest — no overlapping same-symbol trades within holding window
  ✔ blockedUntilIndex correctly prevents entries during cooldown window (1.4774ms)
  ✔ cooldown resets correctly for each new symbol (independent trackers) (0.4008ms)
✔ Backtest — no overlapping same-symbol trades within holding window (2.6284ms)
▶ Metrics Service — Signal Bucketing
  ✔ groups trades with the same stable signal key into a single signalSuccess bucket (1.7563ms)
  ✔ excludes breakeven trades (pnl === 0) from winRate denominator (computed over decisive trades only) (0.3938ms)
  ✔ computes drawdown relative to initialCapital parameter (0.2446ms)
✔ Metrics Service — Signal Bucketing (3.2082ms)
▶ BacktestService — evaluateTrigger Breakout Trigger Tests
  ✔ triggers on day i+2 via gap-open (gap-fill case) (0.4993ms)
  ✔ triggers on day i+3 via intraday touch (normal-fill case) (0.2331ms)
  ✔ never triggers within trigger window (NEVER_TRIGGERED case) (0.1348ms)
✔ BacktestService — evaluateTrigger Breakout Trigger Tests (1.4816ms)
▶ TradeEngineService — SCANNER_DRIVEN holding period and safety valve
  ✔ legacy 2-day cap force-closes trade on time (0.2801ms)
  ✔ scanner-driven 20-day safety valve allows target hit on day 6 (0.2343ms)
✔ TradeEngineService — SCANNER_DRIVEN holding period and safety valve (1.0163ms)
▶ Backtest Look-Ahead Bias Prevention (P0)
  ✔ BTST enters at Market-On-Close, not at intraday limit TC (0.2376ms)
✔ Backtest Look-Ahead Bias Prevention (P0) (0.4917ms)
▶ TradeEngine — adverse gap slippage cap and untradeable size
  ✔ adverse gap slippage is capped at 1.0%, not 0.5% (0.189ms)
  ✔ does not force 1 share when capital cannot afford it (0.271ms)
  ✔ skips when entry equals SL (zero risk — no Infinity position size) (0.4159ms)
✔ TradeEngine — adverse gap slippage cap and untradeable size (1.3026ms)
▶ mapScanResultsForBreakoutAlert
  ✔ fills entry/sl/target fallbacks from tc/bc/r1 and ltp (4.3566ms)
  ✔ uses ltp-based fallbacks when levels are missing (0.3444ms)
✔ mapScanResultsForBreakoutAlert (6.383ms)
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] TEST alerted without option suggestion; deferring journal to btst-journal job
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] NEW_STOCK alerted without option suggestion; deferring journal to btst-journal job
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] TEST already claimed by concurrent run; skipping
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] BAD LONG option enrichment failed; skipping symbol: Error: option chain unavailable
    at OptionSuggestionService.suggestOptionForBtst (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst-alert-claim.test.ts:440:17)
    at enrichBtstPick (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\scheduler\btst-alert.job.ts:60:52)
    at <anonymous> (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\scheduler\btst-alert.job.ts:197:24)
    at Array.map (<anonymous>)
    at buildEnrichedPicks (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\scheduler\btst-alert.job.ts:197:11)
    at runBtstAlertJob (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\scheduler\btst-alert.job.ts:284:31)
    at async withDiscoveryClock (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst-alert-claim.test.ts:41:12)
    at async TestContext.<anonymous> (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst-alert-claim.test.ts:452:22)
    at async Test.run (node:internal/test_runner/test:1208:7)
    at async TestContext.<anonymous> (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst-alert-claim.test.ts:431:3)
[BtstAlert] GOOD alerted without option suggestion; deferring journal to btst-journal job
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] Alert-time journal failed for TEST: Error: journal db down
    at Object.logSignal (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst-alert-claim.test.ts:564:39)
    at TradeJournalService.import_trade_journal.TradeJournalService.logSignal (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst-alert-claim.test.ts:184:23)
    at journalClaimedAlerts (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\scheduler\btst-alert.job.ts:172:48)
    at async runBtstAlertJob (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\scheduler\btst-alert.job.ts:432:23)
    at async withDiscoveryClock (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst-alert-claim.test.ts:41:12)
    at async TestContext.<anonymous> (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst-alert-claim.test.ts:568:22)
    at async Test.run (node:internal/test_runner/test:1208:7)
    at async TestContext.<anonymous> (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst-alert-claim.test.ts:556:3)
    at async Test.run (node:internal/test_runner/test:1208:7)
    at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
[BtstAlert] TEST alerted without option suggestion; deferring journal to btst-journal job
[BtstAlert] TEST market data unavailable; failing closed (skipping alert)
[BtstAlert] Refreshing Index BTST/STBT OvernightSignal for 2026-07-20.
▶ BTST alert cron — BtstAlertState claim logic (per-symbol dedup)
  ✔ first claim of the day: findMany returns empty, create succeeds, send succeeds → sent true (484.1931ms)
  ✔ symbol already alerted today: filtered out, no Telegram send (2.5599ms)
  ✔ pre-migration _legacy row locks the whole day (no re-blast) (2.2303ms)
  ✔ claim-loop DB error rolls back already-claimed symbols (14.6301ms)
  ✔ new symbol at 15:20 bucket: existing symbol filtered, only new symbol sent (6.7573ms)
  ✔ concurrent race: create P2002 for all symbols → already sent, Telegram never called (4.1233ms)
  ✔ claim succeeds, Telegram returns sent false → deleteMany rollback, failure response (2.4262ms)
  ✔ claim succeeds, sendBtstAlert throws → deleteMany rollback, error re-thrown (2.4487ms)
  ✔ empty payload: no Telegram send and no day claim retained (1.1476ms)
  ✔ option enrichment throw skips only that symbol and still sends remaining alerts (11.8887ms)
✔ BTST alert cron — BtstAlertState claim logic (per-symbol dedup) (536.1063ms)
▶ BTST alert cron — alert-time journaling (alert ↔ journal parity)
  ✔ successful stock alert with option data is journaled immediately (4.3263ms)
  ✔ index BTST alert is journaled with the INDEX tag (2.3912ms)
  ✔ failed Telegram send never journals (claims rolled back instead) (2.3276ms)
  ✔ journal failure never breaks an already-sent alert (5.1361ms)
  ✔ alert without option suggestion defers to the 15:25 journal job (1.8269ms)
  ✔ missing market data fails closed (skips alert) (1.0373ms)
✔ BTST alert cron — alert-time journaling (alert ↔ journal parity) (18.2953ms)
▶ btstScanCacheKey (P1-1)
  ✔ includes universe so NIFTY50 and FNO do not share a key (1.3828ms)
  ✔ defaults blank universe to NIFTY50 (same as route) (0.2607ms)
  ✔ ALL / NIFTY50 / NSE_FNO are pairwise distinct (0.4509ms)
✔ btstScanCacheKey (P1-1) (3.7705ms)
▶ btst-journal premium TRADEABLE pipeline
  ✔ picks only TRADEABLE + READY+ (>=85), excluding WATCH/WATCHLIST/IGNORE (23.911ms)
  ✔ suppresses STBT entirely in BULL regime (0.6315ms)
  ✔ suppresses BTST entirely in BEAR regime (0.3085ms)
  ✔ allows STBT in BEAR regime (0.441ms)
  ✔ returns empty when only weak/non-tradable rows exist (2.2615ms)
  ✔ prefers latest signalTime over higher score when deduping rescans (4.8347ms)
✔ btst-journal premium TRADEABLE pipeline (34.9386ms)
▶ BTST Scoring Engine Tests
  ✔ Stock A: LONG setup (Score >= 80, Gap >= 20) (9.7784ms)
  ✔ Stock B: SHORT setup (Score >= 80, Gap >= 20) (1.5526ms)
  ✔ Stock C: NEUTRAL_CONFLICT (Scores close to each other) (2.8236ms)
  ✔ Stock D: WEAK (Max score < 10) (1.9495ms)
  ✔ Stock E: NEUTRAL_CONFLICT (Max score between 10 and 30) (12.221ms)
  ✔ asOfDate override changes candle selection vs. different date (2.4749ms)
  ✔ asOfDate override is deterministic: same date always produces same output (1.1254ms)
  ✔ no asOfDate produces same result as calling with real today date (2.5921ms)
  ✔ discover() delegates to Advanced OvernightService engine (1.4912ms)
  ✔ isExecutionWindowOpen() enforces discovery window from BTST_WINDOWS (exclusive end) (7.2528ms)
  ✔ isExecutionWindowOpen() returns false on an NSE holiday even on a weekday, in-window (0.5445ms)
  ✔ isExecutionWindowOpen() still returns true on an ordinary weekday in-window (0.6566ms)
✔ BTST Scoring Engine Tests (51.3667ms)
✔ CacheService Falsy values (3.35ms)
✔ Redis reconnect delay keeps retrying with a capped backoff (0.43ms)
[CalculationService] Database write failed: Error: database unavailable
    at Proxy.import_db.prisma.calculation.create (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\calculation-service.test.ts:61:11)
    at CalculationService.calculateAndSave (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\calculation.service.ts:22:50)
    at TestContext.<anonymous> (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\calculation-service.test.ts:69:64)
    at Test.runInAsyncScope (node:async_hooks:227:14)
    at Test.run (node:internal/test_runner/test:1201:25)
    at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
    at Test.postRun (node:internal/test_runner/test:1330:19)
    at Test.run (node:internal/test_runner/test:1258:12)
    at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)
✔ CalculationService caches successful persisted share records (13.0105ms)
✔ CalculationService does not cache failed DB writes as share records (101.1322ms)
Circuit breaker open: DB connection failed. Cooldown until 2026-08-06T07:37:05.379Z
Circuit breaker half-open: attempting probe request to DB.
Circuit breaker closed: DB responded (non-connection error during probe).
Circuit breaker open: DB connection failed. Cooldown until 2026-08-06T07:37:05.388Z
Circuit breaker half-open: attempting probe request to DB.
Circuit breaker open: DB connection failed. Cooldown until 2026-08-06T07:37:05.389Z
✔ DatabaseCircuitBreaker — HALF_OPEN non-connection probe closes circuit (9.9463ms)
✔ DatabaseCircuitBreaker — connection error on probe re-opens with cooldown (1.3208ms)
▶ CPR Engine Calculations
  ✔ calculates correct levels with balanced inputs (1.5197ms)
  ✔ handles normalization (TC and BC swap) correctly (0.5405ms)
✔ CPR Engine Calculations (3.9299ms)
▶ CPR Inputs Schema Validation
  ✔ succeeds for valid inputs (3.0237ms)
  ✔ fails when High <= Low (0.9712ms)
  ✔ fails when Close is outside range (0.4842ms)
✔ CPR Inputs Schema Validation (5.3597ms)
[CPRJournal] NOTRIG not triggered: LTP 95 < Entry 100
[CPRJournal] DIVERGED skipped: sector divergence (live mode)
[CPRJournal] 7 qualifying signal(s) cut by CPR_JOURNAL_MAX_SIGNALS=3 (10 qualified today)
▶ runCprJournalJob entry-trigger and sector-divergence gates
  ✔ skips signal whose LTP never reached the entry trigger (61.3613ms)
  ✔ LTP exactly at entry counts as triggered (12.5201ms)
  ✔ legacy rows with entry=0 default pass the trigger gate (1.0211ms)
  ✔ SECTOR_DIVERGENCE skips journaling only in live filter mode (1.4711ms)
  ✔ findMany take is driven by CPR_JOURNAL_MAX_SIGNALS (1.0694ms)
✔ runCprJournalJob entry-trigger and sector-divergence gates (80.4691ms)
✔ CPR_JOURNAL_MAX_SIGNALS env schema rejects unsafe values (3.4751ms)
[CprScanJob] Failed for universe=NIFTY_FNO, market=NSE: Error: boom
    at ScannerController.import_scanner_controller.ScannerController.runFullScan (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\cpr-scan-job.test.ts:62:13)
    at runCprScanJob (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\scheduler\cpr-scan.job.ts:22:45)
    at TestContext.<anonymous> (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\cpr-scan-job.test.ts:69:28)
    at Test.runInAsyncScope (node:async_hooks:227:14)
    at Test.run (node:internal/test_runner/test:1201:25)
    at Suite.processPendingSubtests (node:internal/test_runner/test:831:18)
    at Test.postRun (node:internal/test_runner/test:1330:19)
    at Test.run (node:internal/test_runner/test:1258:12)
    at async Promise.all (index 0)
    at async Suite.run (node:internal/test_runner/test:1619:7)
▶ lastRefreshLabel (honest Last Refresh)
  ✔ formats ISO timestamps without inventing now (1.8729ms)
  ✔ extracts time from BTST/INDEX human scannedAt labels (0.4721ms)
  ✔ returns empty string when scannedAt is missing (UI shows —) (0.2212ms)
✔ lastRefreshLabel (honest Last Refresh) (4.4626ms)
▶ runCprScanJob
  ✔ returns success/count from ScannerController.runFullScan and notifies breakouts (1.5302ms)
  ✔ returns success=false when runFullScan throws and skips notify (4.0574ms)
✔ runCprScanJob (5.9268ms)
▶ cpr-scan claim buckets (retainClaim)
  ✔ same bucket key cannot re-claim after retainClaim=true (0.7907ms)
  ✔ next time-bucket key can claim again (periodic re-fire) (0.2243ms)
  ✔ retainClaim=false allows same key to reclaim after complete (0.3003ms)
✔ cpr-scan claim buckets (retainClaim) (4.7748ms)
▶ APP_ACCESS_TOKEN production guard
  ✔ throws when NODE_ENV=production and token is missing (runtime) (885.618ms)
  ✔ allows next production build phase without token (1003.2918ms)
✔ APP_ACCESS_TOKEN production guard (1890.9532ms)
▶ REDIS_URL / optional URL env (P1-4)
  ✔ emptyStringToUndefined maps blank strings to undefined (1.6124ms)
  ✔ accepts REDIS_URL="" as unset (memory/cache fallback path) (1.2551ms)
  ✔ still rejects invalid REDIS_URL values (1.848ms)
  ✔ accepts a valid REDIS_URL (1.1024ms)
✔ REDIS_URL / optional URL env (P1-4) (8.2415ms)
[EventCalendarService] Calendar is STALE or EMPTY. Applying conservative 100 risk for SBIN.
▶ EventCalendarService — EVENT_CALENDAR_ENFORCE_FRESHNESS flag
  ✔ getEventRisk: unset flag in live mode → severity 0 on empty calendar (49.7445ms)
  ✔ getEventRisk: flag false → severity 0 on empty calendar (12.8752ms)
  ✔ getEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar (2.3242ms)
  ✔ getBulkEventRisk: unset flag in live mode → severity 0 on empty calendar (1.6967ms)
  ✔ getBulkEventRisk: flag false → severity 0 on empty calendar (1.2567ms)
  ✔ getBulkEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar (2.2177ms)
✔ EventCalendarService — EVENT_CALENDAR_ENFORCE_FRESHNESS flag (73.0213ms)
✔ eventImpactSeverity decays by trading session (1.4896ms)
✔ EventCalendarService.daysBetween explicitly skips weekends and holidays (39.7258ms)
✔ EventCalendarService.addTradingDays advances by NSE sessions (not calendar days) (4.0147ms)
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.70% >= 3.5%
[ExtensionGate] TEST SHORT rejected: EXTENDED_DOWN dayReturn=-5.00% <= -3.5%
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.00% >= 3.5%
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.70% >= 3.5%
▶ Extension / exhaustion gate (DIXON-class days)
  ✔ rejects LONG BTST after a >3.5% up day (DIXON-style extension) (63.1338ms)
  ✔ allows LONG BTST on a normal ~1% up day (0.7166ms)
  ✔ rejects SHORT STBT after a sharp dump day (0.6772ms)
  ✔ exposes configured limits used by the gate (0.3341ms)
  ✔ history fallback: when last bar is prior session, previousClose is last.close (not n-2) (1.08ms)
  ✔ history fallback: when last bar is today, previousClose is n-2 (12.4492ms)
✔ Extension / exhaustion gate (DIXON-class days) (80.3738ms)
▶ FnoUniverseCheckService
  ✔ should return no drift when NSE list perfectly matches local isFnO list (3.1494ms)
  ✔ should flag newly-ineligible stock (0.5747ms)
  ✔ should flag brand-new NSE listing (0.4646ms)
  ✔ should handle fetch failure gracefully (0.3341ms)
  ✔ should handle case and padding insensitivity (0.5684ms)
✔ FnoUniverseCheckService (7.5996ms)
▶ FyersAuthService Diagnostic Logging
  ✔ direct call non-2xx status logs status and body text, then falls back (2.6881ms)
  ✔ direct call 200 with { s: "error" } logs full body, then falls back (0.9638ms)
  ✔ direct call 200 with { s: "ok" } but missing token logs full body, then falls back (0.9084ms)
✔ FyersAuthService Diagnostic Logging (6.9283ms)
▶ index-intraday.util
  ✔ indexBtstDiscoveryAsOfUtc maps 15:25 IST to 09:55 UTC (8.6558ms)
  ✔ parseIndexIntradayMetricsFromChart computes VWAP and last15mHigh (34.2444ms)
  ✔ parseIndexIntradayMetricsFromChart excludes the latest forming closing-window bar (0.7633ms)
✔ index-intraday.util (47.0026ms)
▶ index-btst-backtest.helper
  ✔ resolveIndexVixCalm matches production VIX bands (1.682ms)
  ✔ returns not tradable when intraday chart missing (score invalid) (2.4521ms)
  ✔ requires READY+ score floor (85/130) with full intraday data (1.5782ms)
  ✔ suppresses LONG in BEAR regime (live alert/journal path) (0.5876ms)
✔ index-btst-backtest.helper (6.9151ms)
▶ getIndexBtstCompare
  ✔ excludes breakeven live and backtest trades from win-rate denominators (45.9895ms)
  ✔ returns null win rates when closed trades are all breakeven (13.0722ms)
✔ getIndexBtstCompare (60.6967ms)
▶ indexClassificationToQualityBucket
  ✔ maps INDEX_STRONG and INDEX_READY to TRADEABLE (1.1836ms)
  ✔ maps INDEX_WATCH and IGNORE to non-tradable buckets (0.2645ms)
✔ indexClassificationToQualityBucket (2.975ms)
▶ selectTradableIndexBtstPicks
  ✔ selects INDEX READY+ long picks and ignores stock classifications (21.9196ms)
  ✔ respects minScore floor and suppressLong regime gate (0.3894ms)
  ✔ dedupes by symbol keeping latest signalTime (0.3519ms)
✔ selectTradableIndexBtstPicks (23.0403ms)
▶ selectTradableIndexStbtPicks
  ✔ only returns SHORT direction index signals with INDEX_READY+ classification (0.8249ms)
  ✔ returns empty array when suppressShort is true (BULL regime gate) (0.2514ms)
  ✔ respects the minScore floor (0.2182ms)
  ✔ dedupes SHORT picks by symbol keeping latest signalTime (0.2692ms)
  ✔ logIndexStbtJournalEntries uses optionType PE (structural contract test) (23.8496ms)
✔ selectTradableIndexStbtPicks (25.944ms)
▶ index-btst-slice-metrics
  ✔ classifyVixBand uses production thresholds (1.2521ms)
  ✔ parseIndexBtstTradeContext reads nested context (0.334ms)
  ✔ computeIndexBtstSliceMetrics groups by vix and regime (0.6489ms)
✔ index-btst-slice-metrics (4.0597ms)
▶ Index Scan Cache Key
  ✔ generates a unique cache key for a given date (1.1779ms)
  ✔ generates a different key for a different date (1.9284ms)
✔ Index Scan Cache Key (5.0042ms)
[RegimeService] NIFTY 50 Regime for 2026-07-21: BEAR / HIGH (ATR%: 2.56%)
[RegimeService] NIFTY 50 Regime for 2026-07-25: BULL / HIGH (ATR%: 2.49%)
▶ IndexDiscoverService.discover
  ✔ scans exactly the fixed instrument list (NIFTY, BANKNIFTY, SENSEX) in both directions (LONG/SHORT) — no F&O universe loop (59.8058ms)
  ✔ returns IGNORE classification with null score in mock mode (no live VWAP/VIX) for both directions (5.8565ms)
  ✔ never throws on a weekend date — returns empty or safely skips non-trading days (3.9635ms)
  ✔ produces valid IST signalDate (YYYY-MM-DD) and stable discoveryStart signalTime (4.0618ms)
✔ IndexDiscoverService.discover (75.4531ms)
▶ IndexDiscoverService.getIndiaVixState
  ✔ returns vixCalm null in mock mode (score-safety INVALID path) (0.3333ms)
✔ IndexDiscoverService.getIndiaVixState (0.5315ms)
▶ IndexDiscoverService.resolveIndexSessionCandles
  ✔ uses live session as today when hasLive (0.943ms)
  ✔ uses prior completed session as yesterday when live daily history already includes today (5.3931ms)
  ✔ uses last completed bar as today after EOD when live unavailable (0.8332ms)
  ✔ returns null mid-session without live feed (score-safety) (0.7371ms)
✔ IndexDiscoverService.resolveIndexSessionCandles (8.5132ms)
▶ IndexDiscoverService.resolvePreviousCompletedCandle
  ✔ returns n-2 when the latest daily candle is today (0.6238ms)
  ✔ returns the latest candle when history has not rolled into today yet (0.4511ms)
✔ IndexDiscoverService.resolvePreviousCompletedCandle (1.2601ms)
▶ IndexDiscoverService.mapIntraClassification
  ✔ maps scores onto INDEX_* using INTRA floors (75 / 60 / 40) (0.3982ms)
✔ IndexDiscoverService.mapIntraClassification (0.5179ms)
▶ IndexDiscoverService.discoverIntraday
  ✔ returns empty on weekend — does not fabricate INTRA rows (2.4326ms)
  ✔ never throws on a weekday and only emits INDEX_* classifications (10.1458ms)
✔ IndexDiscoverService.discoverIntraday (12.8632ms)
▶ filterIndexRowsForDisplay
  ✔ hides null-score BTST outside discovery window (1.3586ms)
  ✔ shows null-score BTST inside discovery window (0.3014ms)
  ✔ always keeps INTRA rows (0.9315ms)
✔ filterIndexRowsForDisplay (4.8354ms)
▶ primaryIndexReason
  ✔ returns first non-empty reason (0.8515ms)
  ✔ returns null when missing (0.2315ms)
✔ primaryIndexReason (1.3649ms)
▶ IndexIntraRankingService
  ✔ awards LOWER_VALUE points (symmetric with HIGHER_VALUE) (1.4047ms)
  ✔ awards session-move points for aligned bearish move (0.5465ms)
  ✔ scores BREAKDOWN without volume dependency (0.2469ms)
  ✔ maps classification using INTRA floors (75 / 60 / 40) (0.2288ms)
  ✔ caps score at 100 (0.2039ms)
✔ IndexIntraRankingService (4.497ms)
▶ index-intraday.util
  ▶ parseIndexIntradayMetricsFromChart
    ✔ should return empty metrics for missing or invalid chart data (3.9466ms)
    ✔ should correctly calculate last15mHigh and last15mLow during the closing liquidity window (37.379ms)
    ✔ should fall back to unweighted average if volume is 0 (0.6388ms)
  ✔ parseIndexIntradayMetricsFromChart (43.4894ms)
✔ index-intraday.util (44.1241ms)
▶ IndexRankingService.calculateScoreDetails — score safety
  ✔ returns null score when vwap is missing (1.3066ms)
  ✔ returns null score when last15mHigh is missing (0.3219ms)
  ✔ returns null score when vixCalm is null/undefined (0.2233ms)
  ✔ returns null score when confirmation candles are unavailable (0.2714ms)
✔ IndexRankingService.calculateScoreDetails — score safety (3.7077ms)
▶ IndexRankingService.calculateScoreDetails — rules
  ✔ Rule 1: awards vixCalm (25) only when vixCalm is true (0.6493ms)
  ✔ Rule 2: awards cprNarrow (30) only when tomorrowCprNarrow is true (0.3405ms)
  ✔ Rule 3: awards higherValue (20) only when both tomorrow BC and TC exceed today (0.2833ms)
  ✔ Rule 4: awards vwap confirmation (20) only when close beats both TC and VWAP (0.2786ms)
  ✔ Rule 5: awards liquidity (20) only when close > last15mHigh (0.3035ms)
  ✔ Rule 6: awards closeStrength (15) only when CLV > 0.70 (0.2653ms)
  ✔ sums all six rules to a max score of 130 (0.5182ms)
✔ IndexRankingService.calculateScoreDetails — rules (5.0167ms)
▶ IndexRankingService.getClassification
  ✔ maps null score to IGNORE (0.4217ms)
  ✔ maps floors 100 / 85 / 70 to INDEX_STRONG / INDEX_READY / INDEX_WATCH (0.1695ms)
  ✔ uses index-specific classification strings that cannot collide with stock filters (0.8107ms)
✔ IndexRankingService.getClassification (1.7503ms)
▶ INDEX_SCORE / India VIX constants
  ✔ INDEX_SCORE mirrors ADVANCED_SCORE floors (STRONG/READY/WATCH/MAX) (0.3201ms)
  ✔ exposes India VIX calm/elevated thresholds (0.2192ms)
✔ INDEX_SCORE / India VIX constants (0.7461ms)
▶ Index BTST red-session guard
  ✔ blocks when session is down at least INDEX_BTST_RED_SESSION_BLOCK_PCT (0.3282ms)
  ✔ allows flat or green sessions above threshold (0.1319ms)
✔ Index BTST red-session guard (0.6098ms)
▶ IndexRegimeService.computeAdjustment
  ✔ boosts LONG in bullish low-vol regime (1.5022ms)
  ✔ penalizes LONG in bearish high-vol regime (0.2682ms)
  ✔ boosts SHORT in bearish regime (0.2113ms)
  ✔ returns neutral adjustment in choppy low-vol regime (0.1691ms)
✔ IndexRegimeService.computeAdjustment (3.8446ms)
▶ IndexRegimeService.applyConfidence
  ✔ clamps confidence to max score (0.3982ms)
  ✔ returns null when base score is null (0.1848ms)
  ✔ floors confidence at zero (0.9387ms)
✔ IndexRegimeService.applyConfidence (2.3348ms)
▶ index-signal.util
  ✔ maps LONG READY to CALL_BUY (2.208ms)
  ✔ maps SHORT READY to PUT_BUY (0.2565ms)
  ✔ maps IGNORE to NO_TRADE (0.1867ms)
  ✔ computes risk/reward string (0.2745ms)
  ✔ builds BTST reasons from breakdown (0.6107ms)
  ✔ builds INTRA reasons from signal tags (1.0559ms)
  ✔ blocks reasons when VIX elevated (0.2588ms)
✔ index-signal.util (7.2212ms)
▶ IndexRankingService (STBT SHORT)
  ▶ calculateShortScoreDetails
    ✔ returns null if any safety gate fails (vwap, last15mLow, vixElevated, hasConfirmationCandles) (5.2265ms)
    ✔ Rule 1: VIX Elevated (25 pts) (0.3437ms)
    ✔ Rule 2: Lower Value (20 pts) - tomorrow BC and TC both below today BC and TC (0.2092ms)
    ✔ Rule 3: CPR Narrow (30 pts) (0.2104ms)
    ✔ Rule 4: Bearish Confirmation (20 pts) - close < todayBc AND close < vwap (0.1963ms)
    ✔ Rule 5: EOD Weakness (20 pts) - close < last15mLow (0.1672ms)
    ✔ Rule 6: Closing Weakness (15 pts) - close in bottom 30% of day range (0.389ms)
    ✔ accumulates all points perfectly (Max 130) (1.4463ms)
  ✔ calculateShortScoreDetails (10.5548ms)
  ▶ getShortClassification
    ✔ classifies thresholds correctly (100/85/70) (0.3288ms)
  ✔ getShortClassification (0.5752ms)
✔ IndexRankingService (STBT SHORT) (12.0972ms)
Redis error: AggregateError [ECONNREFUSED]: 
    at internalConnectMultiple (node:net:1193:18)
    at afterConnectMultiple (node:net:1783:7) {
  code: 'ECONNREFUSED',
  [errors]: [
    Error: connect ECONNREFUSED ::1:6379
        at createConnectionError (node:net:1746:14)
        at afterConnectMultiple (node:net:1776:16) {
      errno: -4078,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '::1',
      port: 6379
    },
    Error: connect ECONNREFUSED 127.0.0.1:6379
        at createConnectionError (node:net:1746:14)
        at afterConnectMultiple (node:net:1776:16) {
      errno: -4078,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '127.0.0.1',
      port: 6379
    }
  ]
}
Redis error: AggregateError [ECONNREFUSED]: 
    at internalConnectMultiple (node:net:1193:18)
    at afterConnectMultiple (node:net:1783:7) {
  code: 'ECONNREFUSED',
  [errors]: [
    Error: connect ECONNREFUSED ::1:6379
        at createConnectionError (node:net:1746:14)
        at afterConnectMultiple (node:net:1776:16) {
      errno: -4078,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '::1',
      port: 6379
    },
    Error: connect ECONNREFUSED 127.0.0.1:6379
        at createConnectionError (node:net:1746:14)
        at afterConnectMultiple (node:net:1776:16) {
      errno: -4078,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '127.0.0.1',
      port: 6379
    }
  ]
}
Redis error: AggregateError [ECONNREFUSED]: 
    at internalConnectMultiple (node:net:1193:18)
    at afterConnectMultiple (node:net:1783:7) {
  code: 'ECONNREFUSED',
  [errors]: [
    Error: connect ECONNREFUSED ::1:6379
        at createConnectionError (node:net:1746:14)
        at afterConnectMultiple (node:net:1776:16) {
      errno: -4078,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '::1',
      port: 6379
    },
    Error: connect ECONNREFUSED 127.0.0.1:6379
        at createConnectionError (node:net:1746:14)
        at afterConnectMultiple (node:net:1776:16) {
      errno: -4078,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '127.0.0.1',
      port: 6379
    }
  ]
}
[journal-overnight-linkage] Skipping — Postgres unreachable
▶ TradeJournal logSignal overnightSignalId linkage (P1-2)
  ﹣ persists overnightSignalId / model prices from the selected id, not the newest row (1.4287ms) # Postgres unreachable
✔ TradeJournal logSignal overnightSignalId linkage (P1-2) (4171.639ms)
[EligibilityGate] LIQ rejected: avgVolume 99999 < 100000
[EligibilityGate] LIQ rejected: volumeRatio 1.40 < 1.5 (VDU hard gate)
▶ EntryManagerService hard liquidity gate (Advanced discover path)
  ✔ rejects avgVolume below 100k (hard exclude, not LOW_QUALITY flag) (2.9433ms)
  ✔ rejects volume-ratio below 1.5 VDU hard gate (0.488ms)
  ✔ allows stocks that clear avgVolume 100k and volume-ratio 1.5 (VDU) (0.2136ms)
✔ EntryManagerService hard liquidity gate (Advanced discover path) (6.0558ms)
▶ cron-run-claim
  ✔ allows first claim and blocks duplicate until complete (1.9841ms)
  ✔ release allows retry after failure (2.5594ms)
✔ cron-run-claim (6.602ms)
▶ resolveJournalSnapshotSlot
  ✔ maps IST windows to snapshot slots on a trading day (1.9056ms)
✔ resolveJournalSnapshotSlot (2.2964ms)
▶ shouldCompleteClaimedJob
  ✔ releases retryable soft failures (0.5448ms)
  ✔ completes successful or non-retryable results (0.3077ms)
✔ shouldCompleteClaimedJob (1.1833ms)
▶ Market Hours Utilities
  ▶ getISTDateString
    ✔ returns the correct IST date during UTC midnight rollover (pre-IST midnight) (32.1118ms)
    ✔ returns the correct IST date during the 5.5 hour mismatch window (0.441ms)
    ✔ returns the correct IST date when UTC and IST days match (1.1506ms)
    ✔ matches getISTTime().dateString behavior (2.2956ms)
  ✔ getISTDateString (37.2807ms)
  ▶ isTodayCandleClosed (Live Market Scenario Regression)
    ✔ returns false during live market hours (e.g., 2:30 PM IST) (1.0258ms)
    ✔ returns false right before market close (0.4878ms)
    ✔ returns true after market close (e.g., 4:00 PM IST) (0.6256ms)
  ✔ isTodayCandleClosed (Live Market Scenario Regression) (2.5507ms)
  ▶ getCompletedHistory
    ✔ keeps history unchanged when asOfDate replay is used (0.7712ms)
    ✔ with asOfDate equal to last candle date, returns full history even if wall-clock session is open (1.0798ms)
  ✔ getCompletedHistory (2.1359ms)
  ▶ Cash session (site-wide PRESESSION + LIVE)
    ✔ exposes 09:00 pre-open and 09:15–15:30 live labels (0.4277ms)
    ✔ maps CLOSED / PRESESSION / LIVE phases (3.4418ms)
    ✔ treats weekends as CLOSED (0.8706ms)
  ✔ Cash session (site-wide PRESESSION + LIVE) (4.9824ms)
  ▶ BTST window helpers (canonical BTST_WINDOWS)
    ✔ maps discovery / confirm / freeze / journal phases (6.7307ms)
    ✔ identifies the 15:15–15:30 EOD liquidity window (0.3128ms)
  ✔ BTST window helpers (canonical BTST_WINDOWS) (7.3216ms)
✔ Market Hours Utilities (55.2791ms)
▶ Market Profile — CONTINUOUS identity (default env)
  ✔ active profile resolves to CONTINUOUS clocks matching prior production (2.4758ms)
  ✔ BTST_WINDOW_MINUTES / BTST_CLOCK match CONTINUOUS fixtures (0.3205ms)
  ✔ isInClosingLiquidityWindow is [15:15, 15:30) under CONTINUOUS (0.2348ms)
  ✔ supportsClosingAuction is always false under CONTINUOUS (0.2716ms)
  ✔ getSessionState never emits CAS/FNO_ONLY under CONTINUOUS (37.6526ms)
  ✔ shouldFreezeBreakouts is false under CONTINUOUS even for F&O after 15:15 (0.4433ms)
✔ Market Profile — CONTINUOUS identity (default env) (50.824ms)
▶ Market Profile — CLOSING_AUCTION simulation
  ✔ SEBI-locked clocks on CLOSING_AUCTION profile (0.5743ms)
  ✔ supportsClosingAuction: F&O true, non-F&O false under CLOSING_AUCTION (0.2365ms)
  ✔ MarketSessionContext carries resolver fields (0.3256ms)
  ✔ getSessionState F&O: LIVE→CAS at 15:15, CAS until 15:35, FNO_ONLY until 15:40 (1.7552ms)
  ✔ getSessionState non-F&O: still LIVE at 15:20, no CAS (0.9516ms)
  ✔ shouldFreezeBreakouts after 15:15 for F&O only (0.807ms)
  ✔ Rule5 window bounds on CLOSING_AUCTION profile object (0.3566ms)
✔ Market Profile — CLOSING_AUCTION simulation (5.637ms)
▶ Market Profile — unknown env falls back to CONTINUOUS
  ✔ resolveMarketProfile ignores garbage (0.1687ms)
✔ Market Profile — unknown env falls back to CONTINUOUS (0.3181ms)
▶ Market Profile — default helpers still continuous
  ✔ isMarketOpen / discovery helpers use CONTINUOUS module clocks (1.2152ms)
✔ Market Profile — default helpers still continuous (1.3842ms)
[MarketService] 200 SMA caching failed for FAIL: Yahoo Finance HTTP 404
[LiveFeed] Fyers Primary OK for NSE:LTM-EQ (ltp=215.5, candles=110, hist=22)
[LiveFeed] Fyers Data API permission denied (Additional permission required). Fix: myapi.fyers.in → edit app → enable Quotes & Market Data + Historical Data (Fyers often requires all permission checkboxes) → Save → Reconnect Fyers in Settings. Skipping Fyers for 10m; Yahoo Fallback remains active.
[LiveFeed] Fyers quotes failed for NSE:LTM-EQ: HTTP 403 code=403 msg=Additional permission required
[LiveFeed] Yahoo Fallback OK for LTM.NS
[LiveFeed] Fyers Primary skipped for LTM: not connected
[LiveFeed] Yahoo Fallback failed for LTM.NS: Yahoo Finance HTTP 404 for LTM.NS
[LiveFeed] Yahoo Fallback OK for TEST.NS
▶ Market Service - 200 SMA Plumbing
  ✔ SMA Calculation Mathematical Correctness (>= 200 guard) (42.7888ms)
  ✔ cache200SMA() Per-Symbol Isolation on 404 (2.3181ms)
  ✔ getStockData() Cache Miss Fallback (1.4664ms)
  ✔ getStockData() Fyers Primary succeeds with quotes LTP + history (56.4625ms)
  ✔ probeFyersDataApi() reports permission denial clearly (1.2842ms)
  ✔ getStockData() uses Yahoo Fallback when Fyers Primary fails (5.0494ms)
  ✔ getStockData() skips Fyers Primary when not Connected (0.9628ms)
  ✔ getStockData() silently skips null-ohlc placeholder candles (11.1911ms)
✔ Market Service - 200 SMA Plumbing (125.1222ms)
▶ Middleware Authentication & Gating
  ✔ redirects anonymous visits to /scanner to /unlock (29.0128ms)
  ✔ allows anonymous visits to public pages (2.9152ms)
  ✔ allows anonymous access to PWA static assets (3.6898ms)
  ✔ does not Set-Cookie app_access_token on anonymous page visits (0.5778ms)
  ✔ blocks unauthenticated API requests with 401 (6.8685ms)
  ✔ allows API requests with valid authorization header (1.4455ms)
  ✔ allows API requests with valid cookie (1.2564ms)
  ✔ exempts public and cron API routes from token checks (1.6444ms)
  ✔ requires auth for Fyers login (prevents token overwrite) (0.7743ms)
  ✔ does not treat /api/*.png spoof as a public static asset (0.7524ms)
✔ Middleware Authentication & Gating (51.6611ms)
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Rollover check for NIFTY - currentExpiryStr: 2026-08-06, parsed: Thu Aug 06 2026 05:30:00 GMT+0530 (India Standard Time), today: Thu Aug 06 2026 05:30:00 GMT+0530 (India Standard Time), isExpiredOrToday: true
[OptionChain] Current expiry 2026-08-06 is expired/today. Fetching NEXT expiry timestamp: 1234567890 (2026-08-13) for NIFTY
[OptionChain] Next expiry response status: ok, message: undefined
[OptionChain] Successfully rolled over NIFTY to 2026-08-13
[OptionChain] Direct fetch succeeded for NIFTY.
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Direct fetch succeeded for NIFTY.
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Direct call failed for NIFTY: Error: direct unavailable
    at OptionChainService.import_option_chain.OptionChainService.fetchWithRetry (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\option-chain-service.test.ts:128:11)
    at OptionChainService.getOptionChain (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\option-chain.service.ts:127:46)
    at async TestContext.<anonymous> (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\option-chain-service.test.ts:168:20)
    at async Test.run (node:internal/test_runner/test:1208:7)
    at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
[OptionChain] Attempting proxy fetch for NIFTY via https://proxy.example.test...
[OptionChain] Rollover check for NIFTY - currentExpiryStr: 2026-08-06, parsed: Thu Aug 06 2026 05:30:00 GMT+0530 (India Standard Time), today: Thu Aug 06 2026 05:30:00 GMT+0530 (India Standard Time), isExpiredOrToday: true
[OptionChain] Current expiry 2026-08-06 is expired/today. Fetching NEXT expiry timestamp: 9876543210 (2026-08-13) for NIFTY
[OptionChain] Next expiry response status: ok, message: undefined
[OptionChain] Successfully rolled over NIFTY to 2026-08-13
[OptionChain] Proxy fetch succeeded for NIFTY.
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Fetching explicit target expiry: AUG 2030 -> 22222 for NIFTY
[OptionChain] Direct fetch succeeded for NIFTY.
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Fetching explicit target expiry: 30 JUL 2030 -> 11111 for NIFTY
[OptionChain] Direct fetch succeeded for NIFTY.
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Rollover check for NIFTY - currentExpiryStr: 2030-07-30, parsed: Tue Jul 30 2030 05:30:00 GMT+0530 (India Standard Time), today: Thu Aug 06 2026 05:30:00 GMT+0530 (India Standard Time), isExpiredOrToday: false
[OptionChain] Direct fetch succeeded for NIFTY.
✔ OptionChainService fetchOptionQuote regex supports & (2.0475ms)
✔ OptionChainService rollover logic and cache partitioning (42.2152ms)
✔ OptionChainService applies rollover when direct fetch falls back to proxy (10.5613ms)
✔ OptionChainService resolveRolledOverChain parses targetExpiryStr (monthly vs weekly) (3.8522ms)
✔ OptionChainService TTL uses F&O session end in CLOSING_AUCTION (1.0507ms)
[OptionSuggestion] SBIN chain PCR: 0.7 (Bearish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 2,
    score: 66,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 0,
      volumeScore: 20,
      spreadScore: 10,
      itmDepthScore: 6
    }
  },
  {
    strike: 800,
    depth: 1,
    score: 60,
    breakdown: {
      oiScore: 24,
      pcrContextScore: 0,
      volumeScore: 16,
      spreadScore: 10,
      itmDepthScore: 10
    }
  },
  {
    strike: 780,
    depth: 3,
    score: 33,
    breakdown: {
      oiScore: 18,
      pcrContextScore: 0,
      volumeScore: 12,
      spreadScore: 0,
      itmDepthScore: 3
    }
  }
]
[OptionSuggestion] SENSEX chain PCR: 0.4211 (Bearish bias)
[OptionSuggestion] SENSEX CE scored candidates: [
  {
    strike: 75200,
    depth: 2,
    score: 71,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 0,
      volumeScore: 20,
      spreadScore: 15,
      itmDepthScore: 6
    }
  },
  {
    strike: 75300,
    depth: 1,
    score: 65,
    breakdown: {
      oiScore: 27,
      pcrContextScore: 0,
      volumeScore: 18,
      spreadScore: 10,
      itmDepthScore: 10
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 3 (Bullish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 2,
    score: 86,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 20,
      volumeScore: 20,
      spreadScore: 10,
      itmDepthScore: 6
    }
  },
  {
    strike: 800,
    depth: 1,
    score: 80,
    breakdown: {
      oiScore: 24,
      pcrContextScore: 20,
      volumeScore: 16,
      spreadScore: 10,
      itmDepthScore: 10
    }
  },
  {
    strike: 780,
    depth: 3,
    score: 53,
    breakdown: {
      oiScore: 18,
      pcrContextScore: 20,
      volumeScore: 12,
      spreadScore: 0,
      itmDepthScore: 3
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 0.3333 (Bearish bias)
[OptionSuggestion] SBIN PE scored candidates: [
  {
    strike: 810,
    depth: 2,
    score: 86,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 20,
      volumeScore: 20,
      spreadScore: 10,
      itmDepthScore: 6
    }
  },
  {
    strike: 800,
    depth: 1,
    score: 80,
    breakdown: {
      oiScore: 24,
      pcrContextScore: 20,
      volumeScore: 16,
      spreadScore: 10,
      itmDepthScore: 10
    }
  },
  {
    strike: 820,
    depth: 3,
    score: 53,
    breakdown: {
      oiScore: 18,
      pcrContextScore: 20,
      volumeScore: 12,
      spreadScore: 0,
      itmDepthScore: 3
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 0.3333 (Bearish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 2,
    score: 66,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 0,
      volumeScore: 20,
      spreadScore: 10,
      itmDepthScore: 6
    }
  },
  {
    strike: 800,
    depth: 1,
    score: 60,
    breakdown: {
      oiScore: 24,
      pcrContextScore: 0,
      volumeScore: 16,
      spreadScore: 10,
      itmDepthScore: 10
    }
  },
  {
    strike: 780,
    depth: 3,
    score: 33,
    breakdown: {
      oiScore: 18,
      pcrContextScore: 0,
      volumeScore: 12,
      spreadScore: 0,
      itmDepthScore: 3
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 0.6111 (Bearish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 1,
    score: 80,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 0,
      volumeScore: 20,
      spreadScore: 20,
      itmDepthScore: 10
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 0.6111 (Bearish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 1,
    score: 75,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 0,
      volumeScore: 20,
      spreadScore: 15,
      itmDepthScore: 10
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 0.6111 (Bearish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 1,
    score: 70,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 0,
      volumeScore: 20,
      spreadScore: 10,
      itmDepthScore: 10
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 0.6111 (Bearish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 1,
    score: 65,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 0,
      volumeScore: 20,
      spreadScore: 5,
      itmDepthScore: 10
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 0.6111 (Bearish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 1,
    score: 60,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 0,
      volumeScore: 20,
      spreadScore: 0,
      itmDepthScore: 10
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 1.4 (Bullish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 2,
    score: 86,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 20,
      volumeScore: 20,
      spreadScore: 10,
      itmDepthScore: 6
    }
  },
  {
    strike: 800,
    depth: 1,
    score: 80,
    breakdown: {
      oiScore: 24,
      pcrContextScore: 20,
      volumeScore: 16,
      spreadScore: 10,
      itmDepthScore: 10
    }
  },
  {
    strike: 780,
    depth: 3,
    score: 53,
    breakdown: {
      oiScore: 18,
      pcrContextScore: 20,
      volumeScore: 12,
      spreadScore: 0,
      itmDepthScore: 3
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 1.1579 (Neutral)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 780,
    depth: 1,
    score: 80,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 10,
      volumeScore: 20,
      spreadScore: 10,
      itmDepthScore: 10
    }
  },
  {
    strike: 770,
    depth: 2,
    score: 61,
    breakdown: {
      oiScore: 18,
      pcrContextScore: 10,
      volumeScore: 12,
      spreadScore: 15,
      itmDepthScore: 6
    }
  },
  {
    strike: 760,
    depth: 3,
    score: 38,
    breakdown: {
      oiScore: 9,
      pcrContextScore: 10,
      volumeScore: 6,
      spreadScore: 10,
      itmDepthScore: 3
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 0.4975 (Bearish bias)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 790,
    depth: 2,
    score: 76,
    breakdown: {
      oiScore: 30,
      pcrContextScore: 0,
      volumeScore: 20,
      spreadScore: 20,
      itmDepthScore: 6
    }
  },
  {
    strike: 800,
    depth: 1,
    score: 39,
    breakdown: {
      oiScore: 15,
      pcrContextScore: 0,
      volumeScore: 4,
      spreadScore: 10,
      itmDepthScore: 10
    }
  },
  {
    strike: 780,
    depth: 3,
    score: 3,
    breakdown: {
      oiScore: 0,
      pcrContextScore: 0,
      volumeScore: 0,
      spreadScore: 0,
      itmDepthScore: 3
    }
  }
]
[OptionSuggestion] SBIN chain PCR: 1 (Neutral)
[OptionSuggestion] SBIN CE scored candidates: [
  {
    strike: 800,
    depth: 1,
    score: 30,
    breakdown: {
      oiScore: 0,
      pcrContextScore: 10,
      volumeScore: 0,
      spreadScore: 10,
      itmDepthScore: 10
    }
  },
  {
    strike: 790,
    depth: 2,
    score: 26,
    breakdown: {
      oiScore: 0,
      pcrContextScore: 10,
      volumeScore: 0,
      spreadScore: 10,
      itmDepthScore: 6
    }
  },
  {
    strike: 780,
    depth: 3,
    score: 18,
    breakdown: {
      oiScore: 0,
      pcrContextScore: 10,
      volumeScore: 0,
      spreadScore: 5,
      itmDepthScore: 3
    }
  }
]
[OptionSuggestion] Rejected candidate NSE:SBIN26JUN800CE: OI and Volume scores are both 0. Missing data?
[OptionSuggestion] SBIN chain PCR: 1 (Neutral)
[OptionSuggestion] SBIN PE scored candidates: [
  {
    strike: 810,
    depth: 1,
    score: 30,
    breakdown: {
      oiScore: 0,
      pcrContextScore: 10,
      volumeScore: 0,
      spreadScore: 10,
      itmDepthScore: 10
    }
  },
  {
    strike: 820,
    depth: 2,
    score: 16,
    breakdown: {
      oiScore: 0,
      pcrContextScore: 10,
      volumeScore: 0,
      spreadScore: 0,
      itmDepthScore: 6
    }
  }
]
[OptionSuggestion] Rejected candidate NSE:SBIN26JUN810PE: OI and Volume scores are both 0. Missing data?
✔ OptionSuggestionService extracts expiry from NSE and BSE Fyers option symbols (3.4796ms)
▶ Option Suggestion Service — Honest Error Paths (no fabricated data)
  ✔ TOKEN_EXPIRED: missing token returns error, no optionsChain, no fake data (1.2461ms)
  ✔ EMPTY_CHAIN: Fyers returns no data — explicit error, no fake fallback (0.3075ms)
  ✔ FETCH_FAILED: propagates error honestly, no fabricated data (0.2768ms)
  ✔ Math.random never called during any error path (0.4266ms)
✔ Option Suggestion Service — Honest Error Paths (no fabricated data) (3.4893ms)
▶ Option Suggestion — OI Score scales relative to max OI among candidates
  ✔ highest OI candidate gets oiScore=30 (3.5075ms)
✔ Option Suggestion — OI Score scales relative to max OI among candidates (3.9662ms)
✔ Option Suggestion — SENSEX formatted name expands BSE weekly expiry token (1.3045ms)
▶ Option Suggestion — PCR Context Score
  ✔ CE trade + PCR > 1.2 → pcrContextScore = 20 (1.2736ms)
  ✔ PE trade + PCR < 0.8 → pcrContextScore = 20 (1.0229ms)
  ✔ CE trade + PCR < 0.8 → pcrContextScore = 0 (contradicts direction) (0.8247ms)
✔ Option Suggestion — PCR Context Score (4.005ms)
▶ Option Suggestion — Spread Score tiers
  ✔ <=1% spread -> 20 pts (0.8086ms)
  ✔ <=2% spread -> 15 pts (0.3397ms)
  ✔ <=4% spread -> 10 pts (0.3993ms)
  ✔ <=8% spread -> 5 pts (0.4ms)
  ✔ >8% spread -> 0 pts (0.3738ms)
✔ Option Suggestion — Spread Score tiers (3.1124ms)
▶ Option Suggestion — ITM Depth Score: 1st ITM preferred
  ✔ 1st ITM selected when all other scores equal → itmDepthScore=10 (0.9897ms)
✔ Option Suggestion — ITM Depth Score: 1st ITM preferred (1.3446ms)
▶ Option Suggestion — Expensive high-scoring strike wins (no budget gate)
  ✔ Rs300 ltp (very expensive) but perfect OI/vol/spread beats Rs5 ltp cheap strike (0.6425ms)
✔ Option Suggestion — Expensive high-scoring strike wins (no budget gate) (0.9733ms)
▶ Option Suggestion — zero OI and zero volume returns NO_VIABLE_STRIKES
  ✔ CE: all candidates have 0 OI and 0 volume → NO_VIABLE_STRIKES (0.6562ms)
  ✔ PE: all candidates have 0 OI and 0 volume → NO_VIABLE_STRIKES (0.6623ms)
✔ Option Suggestion — zero OI and zero volume returns NO_VIABLE_STRIKES (1.7671ms)
▶ STOCK_OVERNIGHT_INSTRUMENT_WHERE
  ✔ excludes INDEX instrumentType so stock overnight queries stay isolated (3.5662ms)
✔ STOCK_OVERNIGHT_INSTRUMENT_WHERE (5.0917ms)
▶ INDEX_OVERNIGHT_INSTRUMENT_WHERE
  ✔ selects INDEX instrumentType only (0.2568ms)
✔ INDEX_OVERNIGHT_INSTRUMENT_WHERE (0.4529ms)
▶ OvernightRiskService - Index Correlation (Beta Proxy)
  ✔ synthesizes beta_proxy correctly for known-correlated series (6.462ms)
  ✔ uses extended stock-history fetch for beta when MarketService history is truncated to 22 days (32.135ms)
  ✔ zero-variance Nifty window returns null for beta_proxy without throwing (1.2408ms)
  ✔ handles misaligned date gaps correctly by dropping them (1.168ms)
  ✔ skips zero-price bases instead of poisoning beta with fake 0% returns (1.0713ms)
  ▶ Phase 2B Index Correlation Risk Weighting & Regression Checks
    ✔ correlation null (short history <60d) defaults to neutral beta=1.0 and preserves exact LOW/MEDIUM/HIGH riskLevel math (3.3536ms)
    ✔ high beta (>1.0) shifts riskFactor upward across threshold (MEDIUM -> HIGH) (1.7399ms)
    ✔ low beta (<1.0) dampens riskFactor downward across threshold (MEDIUM -> LOW) (3.5855ms)
  ✔ Phase 2B Index Correlation Risk Weighting & Regression Checks (9.1617ms)
✔ OvernightRiskService - Index Correlation (Beta Proxy) (54.5944ms)
▶ overnight-ui-adapter (Phase H)
  ✔ maps OvernightSignal into BTST UI DTO with advanced metadata (1.5271ms)
  ✔ selects TRADEABLE READY+ picks and respects STBT suppression (0.9155ms)
  ✔ compareLatestScanRows prefers newer signalTime then score (19.6422ms)
  ✔ dedupes by symbol so rescans cannot fill both top-N slots (1.7122ms)
✔ overnight-ui-adapter (Phase H) (25.4504ms)
▶ sanitizePagination
  ✔ accepts valid numeric strings (2.3784ms)
  ✔ falls back to defaults on missing values (0.8571ms)
  ✔ rejects NaN / garbage input (0.2479ms)
  ✔ rejects zero and negative page (would produce negative Prisma skip) (0.6432ms)
  ✔ rejects zero / negative limit (0.4298ms)
  ✔ caps abusive page sizes at MAX_PAGE_LIMIT (0.3168ms)
  ✔ floors non-integer values (0.2275ms)
✔ sanitizePagination (8.4726ms)
▶ computeOptionPnl
  ✔ computes a winning long-premium trade (0.9354ms)
  ✔ computes a losing trade with correct sign (0.282ms)
  ✔ rounds to 2 decimal places (no float noise) (0.2155ms)
  ✔ never divides by zero — entryCmp 0 yields 0% not Infinity (0.1946ms)
  ✔ handles negative entryCmp defensively without NaN (0.1791ms)
  ✔ breakeven is zero (0.1623ms)
✔ computeOptionPnl (3.677ms)
▶ Redis Cache Client Tests
  ✔ Initial state or ready state check (1.3935ms)
✔ Redis Cache Client Tests (2.7184ms)
[RegimeService] NIFTY 50 Regime for 2026-07-20: BULL / HIGH (ATR%: 3.33%)
▶ RegimeService - EMA Edge Case Fix
  ✔ length=19 returns DEFAULT regime (CHOPPY/LOW/50) (53.4504ms)
  ✔ length=20 returns DEFAULT regime instead of spurious BULL (0.8881ms)
  ✔ length=21 computes a genuine trend (not default, not spurious) (2.3087ms)
✔ RegimeService - EMA Edge Case Fix (61.1301ms)
✔ scanner mixed universes stay live past 15:15 in CLOSING_AUCTION (44.7481ms)
✔ NIFTY_FNO universe remains closed after 15:15 in CLOSING_AUCTION (39.9248ms)
✔ per-symbol freeze only applies to F&O names in CLOSING_AUCTION (2.5978ms)
▶ Scanner Service Signals Evaluation
  ✔ evaluates NORMAL and BULLISH signals correctly (45.5084ms)
  ✔ evaluates BREAKDOWN signal correctly on high-volume move below bc (2.7125ms)
  ✔ Scanner Dynamic Shift Bias (P0) — live market partial candle does not override yesterday CPR (2.1889ms)
  ✔ detects GAPS and VIRGIN CPR correctly (1.499ms)
✔ Scanner Service Signals Evaluation (54.0966ms)
▶ Scanner Service V2 Entry, Target, Stop Loss, and Risk-Reward (RR)
  ✔ calculates correct trade setups for BULLISH bias (2.2515ms)
  ✔ calculates correct trade setups for BEARISH bias (2.3702ms)
✔ Scanner Service V2 Entry, Target, Stop Loss, and Risk-Reward (RR) (5.3246ms)
▶ Ranking Service V2 Scoring & Classifications
  ✔ assigns correct classification labels based on score ranges (0.4475ms)
  ✔ calculates correct score sum and caps at 100 (0.6995ms)
✔ Ranking Service V2 Scoring & Classifications (1.8818ms)
▶ KGS CPR Theory Signal and Scoring Tests
  ✔ HP_ASC_CPR fires when 3 consecutive rising TC days and PDL is respected (0.8644ms)
  ✔ HP_ASC_CPR is invalidated when close breaks below PDL (1.4575ms)
  ✔ HP_DESC_CPR fires when 3 consecutive falling TC days and PDH is respected (1.7453ms)
  ✔ HP_DESC_CPR is invalidated when close breaks above PDH (1.2731ms)
  ✔ HP_ASC_REVERSAL fires when valid ASC setup yesterday is broken below PDL today (0.9928ms)
  ✔ HP_ASC_REVERSAL does NOT fire if yesterday was only a 2-leg match (1.0303ms)
  ✔ HP_DESC_REVERSAL fires when valid DESC setup yesterday is broken above PDH today (0.7011ms)
  ✔ HP_INSIDE_CPR fires when today fully inside yesterday (2.0244ms)
  ✔ HP_OUTSIDE_CPR fires when today fully contains yesterday (0.611ms)
  ✔ HP_RTP fires when SMA20/SMA50 slopes match sign (0.4278ms)
  ✔ HP_HP_RTP (a) valid crossing matching RTP direction fires (0.4816ms)
  ✔ HP_HP_RTP (b) static position above/below 200 without crossing does not fire (0.4224ms)
  ✔ HP_HP_RTP (c) crossing opposite RTP slope does not fire (0.3885ms)
  ✔ HP_HP_RTP (d) missing sma200 or absent RTP correctly blocks it (0.6391ms)
  ✔ HP_HP_RTP (e) fires correctly on live in-progress crossing (0.3727ms)
  ✔ HP_DIRECT_UP fires on green candle closing decisively above R1 (0.3424ms)
  ✔ HP_DIRECT_DOWN fires on red candle closing decisively below S1 (0.8733ms)
  ✔ HP_REVERSAL_DOWN fires on red candle rejecting R1 after tagging it (0.3153ms)
  ✔ HP_REVERSAL_UP fires on green candle rejecting S1 after tagging it (0.3321ms)
  ✔ Open Tricks signals do not fire when R1/S1 are not touched (0.3032ms)
  ✔ RankingService does NOT score HP_DIRECT_UP + BULLISH (zero-weight until backtested) (0.2259ms)
  ✔ HP_CAM_BULL_BIAS fires when Cam S3 is inside CPR zone (0.3886ms)
  ✔ KGS_CAM_BEAR_BIAS fires when Cam R3 is inside CPR zone (0.3717ms)
  ✔ Existing INSIDE_VALUE logic remains functional and unaffected (0.2787ms)
✔ KGS CPR Theory Signal and Scoring Tests (22.5344ms)
▶ SMA Slope — non-overlapping windows produce meaningful slope
  ✔ rising price series produces sma20Slope > 10 with 40 closes (0.8023ms)
  ✔ falling price series produces negative sma20Slope (0.2998ms)
  ✔ insufficient history (< 40 bars) returns sma20Slope = 0 (0.7325ms)
  ✔ flat price series produces sma20Slope = 0 (0.2934ms)
✔ SMA Slope — non-overlapping windows produce meaningful slope (3.2305ms)
▶ ScannerService/SignalService — asOfDate Inject and Forwarding
  ✔ scanStock(stock, "2026-06-03") forwards asOfDate, triggers SignalService-only GAP_UP signal (0.8025ms)
  ✔ scanStock(stock, "2026-06-02") does not trigger GAP_UP (0.6744ms)
  ✔ scanStock(stock) with no asOfDate defaults to system IST date (no GAP_UP) (4.6568ms)
✔ ScannerService/SignalService — asOfDate Inject and Forwarding (6.8269ms)
✔ ScannerService degenerate single-candle history (1.0759ms)
▶ Category F — EMA 9/21 + RSI Confluence Scoring
  ✔ EMA_CROSS_BEAR + RSI_BEARISH + BREAKDOWN awards +15 in Category F (0.2354ms)
  ✔ EMA_CROSS_BEAR + RSI_OVERBOUGHT + BREAKDOWN awards +15 in Category F (0.1795ms)
  ✔ EMA_CROSS_BEAR + RSI_OVERSOLD + BREAKDOWN does NOT award Category F (late-short trap) (0.2351ms)
  ✔ EMA_CROSS_BULL + RSI_STRONG + BREAKOUT awards +15 in Category F (0.1695ms)
  ✔ hasBullishRSI and hasBearishRSI are mutually exclusive (0.1629ms)
✔ Category F — EMA 9/21 + RSI Confluence Scoring (1.7728ms)
▶ SectorRegimeService.applySectorDivergence
  ✔ tags BULLISH stock when sector is net-bearish with enough sample (1.3854ms)
  ✔ does NOT tag on a bull/bear tie (strict > required) (0.3434ms)
  ✔ does NOT tag when sector sample is below minimum (3) (0.2905ms)
  ✔ ignores fallback buckets Other / Unknown / empty sector (0.3772ms)
  ✔ neutral stocks do not count toward the sector sample (0.3072ms)
  ✔ sectors are judged independently (0.3872ms)
✔ SectorRegimeService.applySectorDivergence (6.5262ms)
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=3.96% >= 3.5%
▶ stock-intraday.util
  ✔ toYahooNseSymbol appends .NS for plain symbols (1.1814ms)
  ✔ parseStockIntradayMetricsFromChart computes VWAP and closing extremes (40.7204ms)
  ✔ parseStockIntradayMetricsFromChart excludes the latest forming closing-window bar (0.9029ms)
✔ stock-intraday.util (44.4623ms)
▶ stock-btst-backtest.helper
  ✔ classifyVduBand matches production thresholds (0.6198ms)
  ✔ classifyScoreBand uses ADVANCED_SCORE floors (0.2453ms)
  ✔ returns not tradable when intraday chart missing (1.3601ms)
  ✔ suppresses LONG in BEAR regime (0.4639ms)
  ✔ requires READY+ when full intraday data present (11.3434ms)
✔ stock-btst-backtest.helper (14.6903ms)
▶ stock-btst-slice-metrics
  ✔ parseStockBtstTradeContext reads nested context (0.5489ms)
  ✔ computeStockBtstSliceMetrics groups by regime and VDU (0.9397ms)
✔ stock-btst-slice-metrics (1.7465ms)
▶ getStockBtstCompare
  ✔ excludes breakeven live and backtest trades from win-rate denominators (53.0803ms)
  ✔ returns null win rates when closed trades are all breakeven (10.9781ms)
✔ getStockBtstCompare (65.6826ms)
▶ resolveOvernightConflict — null scores ineligible
  ✔ picks higher non-null side and marks NEUTRAL_CONFLICT when diff < 10 (1.628ms)
  ✔ does not mark conflict when diff >= 10 (0.2889ms)
  ✔ ignores LONG when score is null — SHORT wins (0.2815ms)
  ✔ ignores SHORT when score is null — LONG wins (0.1859ms)
  ✔ returns null direction when both scores are null (0.1872ms)
  ✔ does not coerce null to 0 (null LONG vs SHORT 5 must not create conflict) (0.1799ms)
✔ resolveOvernightConflict — null scores ineligible (4.9736ms)
▶ VDU Option B — score at SPIKE_RATIO (2.0×), gate remains 1.5×
  ✔ does not award VDU at eligibility floor (1.5×) (2.1141ms)
  ✔ awards VDU at SPIKE_RATIO (2.0×) (0.4615ms)
  ✔ STBT mirrors the same VDU scoring threshold (0.8599ms)
✔ VDU Option B — score at SPIKE_RATIO (2.0×), gate remains 1.5× (3.8864ms)
[Telegram] TELEGRAM_GROUP_CHAT_ID not set; falling back to personal chat for BTST alert
[Telegram] Failed to send message: telegram error body
▶ sendBtstAlert group-only delivery
  ✔ sends only to the group chat, never to the personal DM (46.8824ms)
  ✔ falls back to the personal chat only when no group is configured (14.4363ms)
  ✔ group send failure returns sent=false so claims roll back and retry (1.4815ms)
  ✔ "no qualifying setups" status message also goes to the group (0.7642ms)
✔ sendBtstAlert group-only delivery (65.8234ms)
▶ Quantitative Trading Logic Fixes
  ✔ Short return calculation math in computeMetricsFromTrades (3.7488ms)
  ✔ calculateCPR classification and trend consistency with ATR% (0.6696ms)
✔ Quantitative Trading Logic Fixes (6.0693ms)
▶ Trend Confluence Shadow Scoring
  ✔ BTST - Fresh bullish cross + RSI 55 -> 15 pts (2.3883ms)
  ✔ BTST - Bullish alignment only + RSI 60 -> 5 pts (0.3319ms)
  ✔ BTST - Bullish alignment + RSI 75 (overbought trap) -> -10 pts (0.2167ms)
  ✔ BTST - Missing RSI or EMA data -> 0 pts, no throw (0.2262ms)
  ✔ STBT - Fresh bearish cross + RSI 45 -> 15 pts (0.3484ms)
  ✔ STBT - Bearish alignment only + RSI 40 -> 5 pts (0.1912ms)
  ✔ STBT - Bearish alignment + RSI 25 (oversold trap) -> -10 pts (0.2761ms)
  ✔ STBT - Missing data -> 0 pts (0.1909ms)
  ✔ Regression check on base score output identity (0.3469ms)
✔ Trend Confluence Shadow Scoring (6.8501ms)
▶ VPA math helpers
  ✔ computeClv returns +1 at close on high (0.7617ms)
  ✔ computeClv returns null on zero range (0.1198ms)
  ✔ computeRvol uses avgVolume denominator safely (0.1317ms)
✔ VPA math helpers (2.0069ms)
▶ scoreVpaBreakoutConfirm
  ✔ returns null when there is no breakout attempt (inside CPR) (0.9057ms)
  ✔ confirms a volume+CLV-backed breakout above CPR (0.1479ms)
  ✔ penalizes a weak breakout attempt above CPR (0.1427ms)
  ✔ confirms a volume+CLV-backed breakdown below CPR (0.1227ms)
  ✔ returns null when SHORT has no breakdown attempt (0.1404ms)
✔ scoreVpaBreakoutConfirm (1.7733ms)
▶ VpaConfirmationService.analyze
  ✔ rewards strong RVOL + close near high on LONG (1.5715ms)
  ✔ penalizes weak RVOL on LONG without weak-breakout mislabel (0.7601ms)
  ✔ detects buying climax and recommends reject (0.5548ms)
  ✔ detects absorption (high volume, tiny range) (0.419ms)
  ✔ detects no demand on narrow up-day (0.2766ms)
  ✔ returns disabled result when VPA_ENABLED=false (0.2455ms)
✔ VpaConfirmationService.analyze (4.2124ms)
▶ BtstRankingService VPA shadow integration
  ✔ does not change the authoritative 130pt score (0.5186ms)
  ✔ returns null score unchanged when inputs invalid (0.1079ms)
✔ BtstRankingService VPA shadow integration (0.7068ms)
▶ VPA shadow master kill-switch
  ✔ blocks live confidence/gates while shadow mode is on (default fail-safe) (0.2375ms)
  ✔ allows live confidence/gates only when shadow is off AND live flags are on (0.1267ms)
  ✔ keeps live paths off when shadow is off but live flags remain false (0.1677ms)
✔ VPA shadow master kill-switch (0.6443ms)
▶ VpaConfirmationService.applyConfidenceDelta
  ✔ leaves confidence unchanged when adjustment is zero (0.1312ms)
  ✔ does not apply non-zero delta while shadow mode blocks live confidence (0.0605ms)
✔ VpaConfirmationService.applyConfidenceDelta (0.2645ms)
▶ VpaConfirmationResult.live flag
  ✔ returns live: false under default shadow mode even if live flags are on (0.3044ms)
  ✔ returns live: true when shadow is off AND confidence live is on (0.3507ms)
  ✔ returns live: true when shadow is off AND gates live is on (0.2146ms)
  ✔ returns live: false when shadow is off but both live flags remain false (0.1855ms)
  ✔ returns live: false when VPA is disabled (0.1799ms)
✔ VpaConfirmationResult.live flag (1.3881ms)
▶ scoreVpaClv
  ✔ neutral close (exactly mid-range) does not flag BEARISH for LONG or BULLISH_CLOSE for SHORT (0.1323ms)
  ✔ close in the bottom ~15% of range (e.g. 92 out of 90-110) flags BEARISH for LONG (0.076ms)
  ✔ close in the top ~15% of range (e.g. 108 out of 90-110) flags BULLISH for LONG (0.0804ms)
✔ scoreVpaClv (0.3788ms)
▶ computeWinRate
  ✔ excludes breakeven trades from the denominator (1.2024ms)
  ✔ returns zero winRate without NaN when there are no decisive trades (0.3765ms)
✔ computeWinRate (3.0795ms)
▶ alignedYahooSeriesLength
  ✔ returns 0 when required series are missing (0.8704ms)
  ✔ truncates to the shortest REQUIRED series only (non-required like volume do not shrink length) (0.1595ms)
  ✔ returns 0 when a required series is shorter than any non-required series (0.1157ms)
✔ alignedYahooSeriesLength (2.9027ms)
▶ intraday parsers handle misaligned Yahoo payloads
  ✔ index parser returns empty when a required series is missing/empty (0.3274ms)
  ✔ stock parser truncates to aligned prefix instead of reading past series end (26.7537ms)
✔ intraday parsers handle misaligned Yahoo payloads (27.3288ms)
ℹ tests 510
ℹ suites 85
ℹ pass 509
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 12517.0512
TEST_EXIT_CODE=0
```

### 8.4 Dependency grep (pass 4)

Command: `rg "honors env.CPR_WEIGHT|CPR_WEIGHT override|no_vdu_weighted strategyVariant" src`

```text

RG_EXIT_CODE=1 (1 = no matches)
```

### 8.5 Report fingerprint (post-§8 append)

```text


Algorithm : MD5
Hash      : 080E8F13DAEAB8054A6BAF450AF3C003
Path      : C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\final_acceptance_gate_report.md
BYTES=76614
```
