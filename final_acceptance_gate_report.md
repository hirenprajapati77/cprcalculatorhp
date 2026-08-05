# Final Acceptance Gate Report

**Revision: regenerated 2026-08-05 (audit remediation pass 2).**

Every claim below was re-checked against the file on disk at regeneration time. No
section was copied forward from a prior revision without verification. Where a
previous revision overclaimed, the claim is corrected here and the correction is
recorded in §0 rather than quietly rewritten.

---

## 0. Audit remediation — findings from the 2026-08-05 review

Three inaccuracies were reported. All three were fixed in code (not by editing the
report to match the code as it stood). Two further inaccuracies were found while
re-verifying the rest of the report and are also corrected.

| # | Reported claim | Actual state before fix | Action taken |
|---|---|---|---|
| 1 | "Replaced all raw `process.env.X` calls with `env.X`" (§5b / §1) | `src/services/alert/telegram.service.ts` still used `process.env.NODE_ENV` at lines 26 and 225 | **Code fixed** — both replaced with `env.NODE_ENV`. `env` was already imported at line 1; no new import needed. Full post-fix grep in §8.4. |
| 2 | "centralized constants (`BTST_SCORING`, etc.) … instead of hardcoded magic numbers" (§1) | `cprNarrowWeight = isNoVdu ? 35 : 15` was an inline ternary at two sites in `src/services/backtest/btst.service.ts` | **Code fixed** — added `BTST_SCORING.CPR_NARROW_WEIGHT` (15) and `BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU` (35); both sites now reference them. Values unchanged, so behavior is identical. §1 is also narrowed to state exactly what is and is not centralized. |
| 3 | "Removed UI elements tied to the experimental `cprQuality` filter and badges" (§1) | Dead, unreachable `⭐ Q:{grade}` badge branch for `CPR_QUALITY_*` remained in `src/components/scanner/ScannerClient.tsx` (~lines 631–640), along with the stale "Extract CPR Quality A+/A/B/C from internal tag" comment | **Code fixed** — comment and `CPR_QUALITY_` branch deleted. No producer of a `CPR_QUALITY_*` tag exists anywhere in `src/`; grep in §8.4. |
| 4 | §5d: "wraps **all three** live DB query sites" | There are **six** `DatabaseCircuitBreaker.execute()` sites covering **eight** `prisma.*` calls | **Report corrected** — see §5d. Coverage is still complete; the *count* was stale. |
| 5 | §5d item 3: "`prisma.scannerResult.findMany` (top-for-options enrichment)" | `topForOptions` is derived in memory from `formattedResults`; it issues no DB query of its own | **Report corrected** — see §5d. |

### 0.1 Deviation from the "do not touch files outside items 1–3" constraint

Item 2 offered two options: move the values into `BTST_SCORING`, or correct the
report. The first option was chosen because the task preamble requires fixing the
underlying code rather than restating the report. `BTST_SCORING` is defined in
`src/config/trading-constants.ts`, so satisfying that option required editing that
one file, which is not named in items 1–3.

**Files changed in this pass (4 total):**

| File | Named in items 1–3? | Change |
|---|---|---|
| `src/services/alert/telegram.service.ts` | Yes | 2 lines: `process.env.NODE_ENV` → `env.NODE_ENV` |
| `src/services/backtest/btst.service.ts` | Yes | 2 sites now read named constants |
| `src/components/scanner/ScannerClient.tsx` | Yes | dead `CPR_QUALITY_` block deleted |
| `src/config/trading-constants.ts` | **No — disclosed deviation** | +4 lines: 2 named constants and a comment added to `BTST_SCORING`. No existing value altered. |

This is disclosed rather than self-approved. If the reviewer prefers the
constraint held strictly, revert `trading-constants.ts` and `btst.service.ts` and
take item 2's second option instead; §1 already states precisely which numbers are
centralized, which is what that option requires.

### 0.2 Latent divergence found while fixing item 2 — disclosed, not fixed

In `src/services/backtest/btst.service.ts` the NARROW-CPR weight is computed in two
independent places for the `no_vdu_weighted` variant, and they do not read the same
source:

- **Score-affecting path** — `calculateLongScore` (line ~144) and
  `calculateShortScore` (line ~230) use the constant `35`
  (now `BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU`) and **ignore** `env.CPR_WEIGHT`.
- **Reported-breakdown path** — `evaluateOvernight` (lines ~414–418) uses
  `env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : 35` for `scoreBreakdown.cprNarrow`.

So with `CPR_WEIGHT=25`, the returned `score` is computed with 35 while
`scoreBreakdown.cprNarrow` reports 25. Defaults agree (both 35), so the shipped
default configuration is unaffected.

This was **not** changed. Making the score honor `env.CPR_WEIGHT` is a behavior
change to the research/backtest scoring path, was not requested, and would need its
own approval and regression baseline. It is recorded in §6 as a known issue.

---

## 1. Files Modified

### CPR Analytics & BTST (In-Scope)

- **`src/services/backtest/btst.service.ts`** — uses `env` (no raw `process.env`) and
  references `BTST_SCORING` for the constants listed below. Precisely:
  - **Centralized in `BTST_SCORING`:** `CLV_CONTINUOUS_MULTIPLIER` (100),
    `CLV_BASE_MULTIPLIER` (75), `CPR_NARROW_WEIGHT` (15),
    `CPR_NARROW_WEIGHT_NO_VDU` (35).
  - **Intentionally left inline:** the remaining simple-score leg weights and
    thresholds — `+20` volume expansion, `+20` VWAP, `+15` closing strength/weakness,
    `+10` liquidity, `volumeRatio >= 2.0`, `avgVolume >= 500000`, and the
    `0.995` / `1.005` / `1.002` / `0.998` candle and VWAP multipliers. Reason: these
    define the frozen legacy simple/research score exercised by the regression-lock
    tests in `src/tests/unit/btst.test.ts`; promoting them to shared constants would
    invite tuning of a scale that exists to stay fixed as a comparison baseline. They
    are documented here rather than described as centralized.
- **`src/lib/cpr-relationship.ts`** — consolidated legacy boolean flags
  (`isHigherValue`, `isLowerValue`, `isInsideValue`, `isOverlappingValue`) into a
  single output object alongside a 1:1 mapped `displayValue` for UI. Unapproved
  features were deferred and reverted.
- **`src/services/scanner.service.ts`** — integrated `cprCompression` logic fetching
  from Redis/PostgreSQL. Unapproved `cprQuality` grading was deferred and removed.
- **`src/config/trading-constants.ts`** — added the two `CPR_NARROW_WEIGHT*` constants
  described in §0.1.

### Production Hardening & Scope-Creep (Justified)

The following files were modified beyond the strict CPR Analytics scope, as part of a
**Type-Safe Environment Variable Centralization** and **Database Resilience** pass:

- **`src/config/env.ts`** — `zod`-based strict runtime validation of environment
  variables, failing fast at startup when config is missing.
- **`src/lib/circuit-breaker.ts`** — Database Circuit Breaker utility; catches
  Prisma/DB failures and falls back to Redis caches.
- **`src/middleware.ts`**, **`src/lib/redis.ts`**, **`src/lib/crypto.ts`**,
  **`src/services/queue.service.ts`**, **`src/services/fyers-auth.service.ts`**,
  **`src/services/alert/telegram.service.ts`** — raw `process.env.X` replaced with
  `env.X`. As of this revision that is true of all six files with no remaining
  exceptions; verified by the grep in §8.4. No other business logic altered.
- **`src/app/api/scanner/route.ts`** — `prisma` calls wrapped in
  `DatabaseCircuitBreaker.execute()` (see §5d for the verified site list). Experimental
  `cprQuality` logic removed.
- **`src/components/scanner/ScannerClient.tsx`** — UI tied to the experimental
  `cprQuality` filter and badges removed. As of this revision the removal is complete:
  no `cprQuality` or `CPR_QUALITY_` reference remains anywhere in `src/`.

## 2. Shared Utilities

- **`src/lib/circuit-breaker.ts`** — shared utility for database failovers.

## 3. Regression Verification

Baseline for regression verification is `1081b56` (the commit immediately before work
on this task began).

- Unit and regression-lock tests pass: **510 tests, 509 pass, 0 fail, 1 skipped**.
  Raw output in §8.3; the single skip is itemized in §6.
- Legacy `evaluateOvernight()` (research/backtest-only, exercised via
  `scripts/analyze_cpr_matrix.ts` with `strategyVariant: 'no_vdu_weighted'`) returns
  identical scores excluding the expected `CPR_WEIGHT` behavior change.
  **This does not cover the live production path:** `evaluateOvernightV2()`, which
  drives the BTST cron alert and journal pipelines, does not accept a
  `strategyVariant` and does not read `CPR_WEIGHT` at all — its CPR scoring is
  hardcoded in `btst-ranking.service.ts` / `stbt-ranking.service.ts`.
- The item-2 constant extraction is value-preserving (15 and 35 unchanged), so it
  introduces no scoring delta; `npx tsc --noEmit` and the full unit suite both pass
  after the change.
- CPR boolean logic (`isHigherValue`, `isInsideValue`, etc.) evaluates identically
  because the exact legacy boundary checks were restored in `cpr-relationship.ts`.

## 4. Breaking Changes

- **`env.CPR_WEIGHT` parsing** — previously
  `process.env.CPR_WEIGHT ? parseInt(process.env.CPR_WEIGHT, 10) : 35` treated a
  literal `"0"` as falsy and fell back to 35. The Zod-validated
  `env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : 35` (btst.service.ts line ~416)
  correctly respects `"0"`. Intentional bug fix, declared here. Note the scope limit
  described in §0.2: this override affects the reported breakdown, not the score.
- **Startup crash on invalid config** — the server now crashes at startup if required
  variables (e.g. `APP_ACCESS_TOKEN`, `DATABASE_URL`) are missing, instead of failing
  silently at runtime.

## 5. Scope-Creep Diffs / Proof Audit

> **Audit note:** an earlier revision presented truncated env-migration snippets as
> "proof" of what shipped. Those snippets were historical and incomplete — they never
> included `src/lib/circuit-breaker.ts`, and did not reflect later hardening
> (HALF_OPEN concurrent-probe guard, trip conditions limited to
> `PrismaClientInitializationError` / `ECONNREFUSED`, pure-read `isOpen()`). The live
> file on disk is authoritative.

### 5a. `src/lib/circuit-breaker.ts` — current on-disk behavior

Verified against the file at regeneration time (line references included so the claim
is checkable):

| Contract | Current file on disk |
|---|---|
| HALF_OPEN blocks concurrent probes | Yes — throws `CIRCUIT_OPEN` while a probe is in flight (lines 16–18) |
| Trip on `PrismaClientKnownRequestError` | **No** — only `PrismaClientInitializationError` / `ECONNREFUSED` (lines 42–43) |
| `isOpen()` mutates state | **No** — pure read (line 63) |

### 5b. Env centralization

Verified still accurate against the current files. Line numbers are from the files as
they exist now.

- `src/lib/crypto.ts:8` — `const secret = env.TOKEN_ENCRYPTION_KEY;`
- `src/lib/redis.ts:6,8` — `if (env.REDIS_URL)` / `new Redis(env.REDIS_URL, {`
- `src/middleware.ts:34` — `if (env.NODE_ENV === 'production' && env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL !== 'true')`
- `src/services/alert/telegram.service.ts:14,15` — `env.TELEGRAM_BOT_TOKEN` / `env.TELEGRAM_CHAT_ID`
- `src/services/alert/telegram.service.ts:26,225` — `env.NODE_ENV` (**fixed in this pass**; previously `process.env.NODE_ENV`)

The authoritative check is the full-tree grep in §8.4, not these excerpts.

### 5c. Other stale "proof" locations

| Location | Status |
|---|---|
| `final_acceptance_gate_report.md` §5 (pre-2026-07-22) | **Stale** — regenerated |
| `final_acceptance_gate_report.md` §5d (pre-2026-08-05) | **Stale** — site count corrected in this revision |
| `cpr_deferred_implementation_notes.md` | Deferred-feature quarantine (Outside Value CPR, etc.) — not a circuit-breaker proof; left as-is |
| Other reports embedding an older full `circuit-breaker.ts` body | None found via repo search |

### 5d. Scanner route circuit coverage (corrected 2026-08-05)

`src/app/api/scanner/route.ts` contains **eight** `prisma.*` calls, and **all eight**
are inside one of **six** `DatabaseCircuitBreaker.execute()` wrappers:

| # | `execute()` at line | Wrapped query |
|---|---|---|
| 1 | 170 | `prisma.scannerResult.count` (auto-init today count) |
| 2 | 182 | `prisma.scannerResult.findFirst` (latest date, outside live session) |
| 3 | 229 | `prisma.marketSnapshot.findMany` (sector / market-cap filter) |
| 4 | 298 | `Promise.all` of `scannerResult.findMany` + `count` + stats `findMany` (3 calls) |
| 5 | 382 | `prisma.scanHistory.findFirst` (`scannedAt`) |
| 6 | 391 | `prisma.scannerResult.findFirst` (`scannedAt` fallback) |

`DatabaseCircuitBreaker.isOpen()` early-returns to the degraded cache at line 163,
before all six sites. A `CIRCUIT_OPEN` throw from any site uses the same degraded-cache
path as the early return.

Two corrections to the previous wording: the count was "three" (actual: six wrappers /
eight calls), and the previous item 3, "`prisma.scannerResult.findMany`
(top-for-options enrichment)", was wrong — `topForOptions` (lines 126, 358) is derived
in memory from `formattedResults` and issues no query of its own.

## 6. Known Issues

- **`cprNarrowWeight` vs `env.CPR_WEIGHT` divergence** in
  `src/services/backtest/btst.service.ts` — the score uses the fixed
  `CPR_NARROW_WEIGHT_NO_VDU` (35) while `scoreBreakdown.cprNarrow` honors
  `env.CPR_WEIGHT`. Only observable when `CPR_WEIGHT` is set to something other than
  35, and only on the research/backtest path. Full detail in §0.2. Not fixed in this
  pass; needs approval because it is a scoring behavior change.
- **One skipped unit test** (not a failure, and not Prisma-client-related):
  `TradeJournal logSignal overnightSignalId linkage (P1-2) › persists overnightSignalId /
  model prices from the selected id, not the newest row`, skipped with the runner
  reason `# Postgres unreachable`. It requires a live PostgreSQL connection, which the
  verification environment does not provide. `npx prisma generate` succeeded (§8.1), so
  this is not a missing-client skip. No other test was skipped, cancelled, or failed.
- **`CPR_QUALITY_` / `cprQuality` remnants outside `src/`** — `src/` is clean, but the
  following non-shipped helper scripts still reference the deferred feature:
  `scripts/fix_ts.ts`, `scripts/fix_ui.js`, `scripts/fix_scanner.js`,
  `scripts/verify_identical.ts`, `scripts/verify_regression.ts`. The last two
  deliberately filter `CPR_QUALITY_*` out of baseline comparisons. These are one-off
  migration/verification scripts, are not part of the application bundle, and are
  outside the files this pass was scoped to, so they were left untouched. Recorded here
  so the claim in §1 is read as "`src/` is clean", not "the repo has no references".
- **`prisma-setup.js` local DB switching** defaults to SQLite if `.env` is unpopulated
  on a fresh clone. Local tooling only; does not affect the production
  Postgres/Oracle Cloud stack.

## 7. Deferred Items

Coded, identified as requiring design approval, reverted, and quarantined in
`cpr_deferred_implementation_notes.md` pending review:

- **Outside Value CPR**
- **Overlapping Higher CPR**
- **Overlapping Lower CPR**
- **CPR Alignment (Trend vs History)**
- **CPR Quality Grading (A+/A/B/C)** — as of this revision the last UI remnant of this
  feature (the `⭐ Q:` badge) is removed from `src/`; see §0 item 3.

## 8. Verification Gate — raw terminal output

All four blocks below were appended directly from the terminal at report generation
time (2026-08-05), on Windows PowerShell, in the repository root. They are unedited:
no truncation, no reordering, no removal of npm warnings, and no substituted summary
counts. `TSC_EXIT_CODE` / `TEST_EXIT_CODE` lines are the shell echoing
`$LASTEXITCODE` and are part of the captured output.

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

✔ Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 286ms

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Interested in query caching in just a few lines of code? Try Accelerate today! https://pris.ly/tip-3-accelerate
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
  ✔ calculates baseline correctly (1.4502ms)
  ✔ aggregates KGS_DIRECT_UP correctly (0.5275ms)
  ✔ aggregates BULLISH with neutral lift (0.5448ms)
  ✔ confidence is Low for small sample sizes (0.3035ms)
  ✔ returns empty result for empty input (3.9275ms)
  ✔ handles null signalSummary gracefully (0.4115ms)
  ✔ calculates liftExclusive correctly where signal appears in some but not all trades (0.2866ms)
  ✔ handles degenerate case where signal appears in every single trade (liftExclusive should equal winRate) (0.3117ms)
  ✔ excludes breakeven (pnl === 0) trades from winRate denominator (0.3357ms)
✔ aggregateSignalAnalytics (12.9676ms)
▶ cron-secret API exemptions (P1-3)
  ✔ exempts /api/cron/* and refresh routes used by the runbook (1.9176ms)
  ✔ does not exempt normal BTST/overnight GETs (still need APP_ACCESS_TOKEN) (0.3812ms)
✔ cron-secret API exemptions (P1-3) (4.5413ms)
▶ shouldFreshDiscoverBtst
  ✔ does not discover outside the window without bypass (1.2176ms)
  ✔ serves cache on bypass (no fresh discover) (0.1994ms)
  ✔ fresh-discovers on bypass when cache is empty (0.6677ms)
  ✔ fresh-discovers when the execution window is open (0.1832ms)
✔ shouldFreshDiscoverBtst (14.5896ms)
▶ maskSecretTail
  ✔ masks leaving the last 4 characters (0.4076ms)
  ✔ returns **** for short values (0.1821ms)
✔ maskSecretTail (0.94ms)
▶ publicApiError
  ✔ hides internal messages outside development (0.5423ms)
✔ publicApiError (0.7811ms)
▶ POST /api/auth/unlock
  ✔ sets HttpOnly cookie when token matches APP_ACCESS_TOKEN (65.9981ms)
  ✔ rejects wrong token with 401 and no cookie (3.8093ms)
  ✔ rejects non-string token without throwing (2.8269ms)
  ✔ sets Secure when request is https (2.5258ms)
  ✔ rate limits after 5 attempts (18.8973ms)
✔ POST /api/auth/unlock (97.8477ms)
▶ POST /api/auth/logout
  ✔ clears the access cookie (1.376ms)
✔ POST /api/auth/logout (1.6897ms)
▶ BTST backtest — single-day EOD-forced-exit simulation (Task I)
  ✔ Case 1: LONG — target hit intraday on next day (4.7486ms)
  ✔ Case 2: LONG — SL hit intraday on next day (0.7641ms)
  ✔ Case 3: LONG — neither SL nor target hit → EOD forced exit at close (0.5195ms)
  ✔ Case 4: SHORT — target hit intraday on next day (0.4181ms)
  ✔ Case 5: SHORT — neither SL nor target hit → EOD forced exit at close (0.5366ms)
  ✔ Case 6: ENTRY timestamp uses config.entryDate when OHLC is next-day only (2.2226ms)
✔ BTST backtest — single-day EOD-forced-exit simulation (Task I) (11.6788ms)
▶ TradeEngine — CLOSED_TIME_EXIT at exact window boundary
  ✔ exits CLOSED_TIME_EXIT when SL/Target not hit within 3-day window (4.5651ms)
  ✔ exits CLOSED_TIME_EXIT at day 1 when window is 1 candle (0.4646ms)
  ✔ exits CLOSED_SL before window boundary if SL is hit (0.4593ms)
  ✔ exits CLOSED_TARGET before window boundary if Target is hit (0.2904ms)
  ✔ CLOSED_TIME_EXIT — exit price is close of LAST candle in bounded window (0.314ms)
✔ TradeEngine — CLOSED_TIME_EXIT at exact window boundary (8.4244ms)
▶ Backtest — no overlapping same-symbol trades within holding window
  ✔ blockedUntilIndex correctly prevents entries during cooldown window (1.9431ms)
  ✔ cooldown resets correctly for each new symbol (independent trackers) (1.8923ms)
✔ Backtest — no overlapping same-symbol trades within holding window (5.0653ms)
▶ Metrics Service — Signal Bucketing
  ✔ groups trades with the same stable signal key into a single signalSuccess bucket (2.2967ms)
  ✔ excludes breakeven trades (pnl === 0) from winRate denominator (computed over decisive trades only) (0.492ms)
  ✔ computes drawdown relative to initialCapital parameter (0.2508ms)
✔ Metrics Service — Signal Bucketing (4.4268ms)
▶ BacktestService — evaluateTrigger Breakout Trigger Tests
  ✔ triggers on day i+2 via gap-open (gap-fill case) (0.4436ms)
  ✔ triggers on day i+3 via intraday touch (normal-fill case) (0.2809ms)
  ✔ never triggers within trigger window (NEVER_TRIGGERED case) (0.1271ms)
✔ BacktestService — evaluateTrigger Breakout Trigger Tests (3.6531ms)
▶ TradeEngineService — SCANNER_DRIVEN holding period and safety valve
  ✔ legacy 2-day cap force-closes trade on time (0.4591ms)
  ✔ scanner-driven 20-day safety valve allows target hit on day 6 (0.3352ms)
✔ TradeEngineService — SCANNER_DRIVEN holding period and safety valve (1.5015ms)
▶ Backtest Look-Ahead Bias Prevention (P0)
  ✔ BTST enters at Market-On-Close, not at intraday limit TC (0.2852ms)
✔ Backtest Look-Ahead Bias Prevention (P0) (0.5483ms)
▶ TradeEngine — adverse gap slippage cap and untradeable size
  ✔ adverse gap slippage is capped at 1.0%, not 0.5% (0.1589ms)
  ✔ does not force 1 share when capital cannot afford it (0.2676ms)
  ✔ skips when entry equals SL (zero risk — no Infinity position size) (0.7126ms)
✔ TradeEngine — adverse gap slippage cap and untradeable size (1.7513ms)
▶ mapScanResultsForBreakoutAlert
  ✔ fills entry/sl/target fallbacks from tc/bc/r1 and ltp (4.5789ms)
  ✔ uses ltp-based fallbacks when levels are missing (0.3996ms)
✔ mapScanResultsForBreakoutAlert (7.7045ms)
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
  ✔ first claim of the day: findMany returns empty, create succeeds, send succeeds → sent true (505.6232ms)
  ✔ symbol already alerted today: filtered out, no Telegram send (2.5738ms)
  ✔ pre-migration _legacy row locks the whole day (no re-blast) (7.3922ms)
  ✔ claim-loop DB error rolls back already-claimed symbols (9.5605ms)
  ✔ new symbol at 15:20 bucket: existing symbol filtered, only new symbol sent (8.7828ms)
  ✔ concurrent race: create P2002 for all symbols → already sent, Telegram never called (3.7914ms)
  ✔ claim succeeds, Telegram returns sent false → deleteMany rollback, failure response (3.9113ms)
  ✔ claim succeeds, sendBtstAlert throws → deleteMany rollback, error re-thrown (4.8056ms)
  ✔ empty payload: no Telegram send and no day claim retained (1.667ms)
  ✔ option enrichment throw skips only that symbol and still sends remaining alerts (16.4584ms)
✔ BTST alert cron — BtstAlertState claim logic (per-symbol dedup) (569.5041ms)
▶ BTST alert cron — alert-time journaling (alert ↔ journal parity)
  ✔ successful stock alert with option data is journaled immediately (6.0767ms)
  ✔ index BTST alert is journaled with the INDEX tag (2.2994ms)
  ✔ failed Telegram send never journals (claims rolled back instead) (5.248ms)
  ✔ journal failure never breaks an already-sent alert (5.7878ms)
  ✔ alert without option suggestion defers to the 15:25 journal job (2.2591ms)
  ✔ missing market data fails closed (skips alert) (2.3745ms)
✔ BTST alert cron — alert-time journaling (alert ↔ journal parity) (25.9272ms)
▶ btstScanCacheKey (P1-1)
  ✔ includes universe so NIFTY50 and FNO do not share a key (1.3832ms)
  ✔ defaults blank universe to NIFTY50 (same as route) (0.2856ms)
  ✔ ALL / NIFTY50 / NSE_FNO are pairwise distinct (0.2239ms)
✔ btstScanCacheKey (P1-1) (3.7085ms)
▶ btst-journal premium TRADEABLE pipeline
  ✔ picks only TRADEABLE + READY+ (>=85), excluding WATCH/WATCHLIST/IGNORE (34.1223ms)
  ✔ suppresses STBT entirely in BULL regime (0.6417ms)
  ✔ suppresses BTST entirely in BEAR regime (0.4309ms)
  ✔ allows STBT in BEAR regime (0.2991ms)
  ✔ returns empty when only weak/non-tradable rows exist (0.3169ms)
  ✔ prefers latest signalTime over higher score when deduping rescans (2.9574ms)
✔ btst-journal premium TRADEABLE pipeline (41.4425ms)
▶ BTST Scoring Engine Tests
  ✔ Stock A: LONG setup (Score >= 80, Gap >= 20) (9.1704ms)
  ✔ Stock B: SHORT setup (Score >= 80, Gap >= 20) (1.3193ms)
  ✔ Stock C: NEUTRAL_CONFLICT (Scores close to each other) (1.0591ms)
  ✔ Stock D: WEAK (Max score < 10) (1.048ms)
  ✔ Stock E: NEUTRAL_CONFLICT (Max score between 10 and 30) (1.1212ms)
  ✔ asOfDate override changes candle selection vs. different date (0.9448ms)
  ✔ asOfDate override is deterministic: same date always produces same output (0.9605ms)
  ✔ no asOfDate produces same result as calling with real today date (5.5229ms)
  ✔ discover() delegates to Advanced OvernightService engine (1.657ms)
  ✔ isExecutionWindowOpen() enforces discovery window from BTST_WINDOWS (exclusive end) (3.0257ms)
  ✔ isExecutionWindowOpen() returns false on an NSE holiday even on a weekday, in-window (0.5069ms)
  ✔ isExecutionWindowOpen() still returns true on an ordinary weekday in-window (0.5847ms)
✔ BTST Scoring Engine Tests (29.6026ms)
✔ CacheService Falsy values (4.0284ms)
✔ Redis reconnect delay keeps retrying with a capped backoff (0.5261ms)
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
✔ CalculationService caches successful persisted share records (22.4302ms)
✔ CalculationService does not cache failed DB writes as share records (21.2226ms)
Circuit breaker open: DB connection failed. Cooldown until 2026-08-05T17:53:19.230Z
Circuit breaker half-open: attempting probe request to DB.
Circuit breaker closed: DB responded (non-connection error during probe).
Circuit breaker open: DB connection failed. Cooldown until 2026-08-05T17:53:19.237Z
Circuit breaker half-open: attempting probe request to DB.
Circuit breaker open: DB connection failed. Cooldown until 2026-08-05T17:53:19.238Z
✔ DatabaseCircuitBreaker — HALF_OPEN non-connection probe closes circuit (7.8248ms)
✔ DatabaseCircuitBreaker — connection error on probe re-opens with cooldown (1.486ms)
▶ CPR Engine Calculations
  ✔ calculates correct levels with balanced inputs (1.8164ms)
  ✔ handles normalization (TC and BC swap) correctly (0.6385ms)
✔ CPR Engine Calculations (18.1383ms)
▶ CPR Inputs Schema Validation
  ✔ succeeds for valid inputs (4.5708ms)
  ✔ fails when High <= Low (8.5338ms)
  ✔ fails when Close is outside range (0.6812ms)
✔ CPR Inputs Schema Validation (15.1966ms)
[CPRJournal] NOTRIG not triggered: LTP 95 < Entry 100
[CPRJournal] DIVERGED skipped: sector divergence (live mode)
[CPRJournal] 7 qualifying signal(s) cut by CPR_JOURNAL_MAX_SIGNALS=3 (10 qualified today)
▶ runCprJournalJob entry-trigger and sector-divergence gates
  ✔ skips signal whose LTP never reached the entry trigger (53.4267ms)
  ✔ LTP exactly at entry counts as triggered (17.7841ms)
  ✔ legacy rows with entry=0 default pass the trigger gate (2.3901ms)
  ✔ SECTOR_DIVERGENCE skips journaling only in live filter mode (1.9826ms)
  ✔ findMany take is driven by CPR_JOURNAL_MAX_SIGNALS (1.3086ms)
✔ runCprJournalJob entry-trigger and sector-divergence gates (83.6732ms)
✔ CPR_JOURNAL_MAX_SIGNALS env schema rejects unsafe values (3.2773ms)
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
  ✔ formats ISO timestamps without inventing now (2.0053ms)
  ✔ extracts time from BTST/INDEX human scannedAt labels (0.8036ms)
  ✔ returns empty string when scannedAt is missing (UI shows —) (0.3162ms)
✔ lastRefreshLabel (honest Last Refresh) (5.1828ms)
▶ runCprScanJob
  ✔ returns success/count from ScannerController.runFullScan and notifies breakouts (2.1788ms)
  ✔ returns success=false when runFullScan throws and skips notify (7.063ms)
✔ runCprScanJob (9.8953ms)
▶ cpr-scan claim buckets (retainClaim)
  ✔ same bucket key cannot re-claim after retainClaim=true (7.1474ms)
  ✔ next time-bucket key can claim again (periodic re-fire) (20.3405ms)
  ✔ retainClaim=false allows same key to reclaim after complete (0.8269ms)
✔ cpr-scan claim buckets (retainClaim) (28.9156ms)
▶ APP_ACCESS_TOKEN production guard
  ✔ throws when NODE_ENV=production and token is missing (runtime) (1310.0924ms)
  ✔ allows next production build phase without token (1529.0373ms)
✔ APP_ACCESS_TOKEN production guard (2841.0989ms)
▶ REDIS_URL / optional URL env (P1-4)
  ✔ emptyStringToUndefined maps blank strings to undefined (2.3169ms)
  ✔ accepts REDIS_URL="" as unset (memory/cache fallback path) (0.921ms)
  ✔ still rejects invalid REDIS_URL values (2.3787ms)
  ✔ accepts a valid REDIS_URL (0.5997ms)
✔ REDIS_URL / optional URL env (P1-4) (8.3642ms)
[EventCalendarService] Calendar is STALE or EMPTY. Applying conservative 100 risk for SBIN.
▶ EventCalendarService — EVENT_CALENDAR_ENFORCE_FRESHNESS flag
  ✔ getEventRisk: unset flag in live mode → severity 0 on empty calendar (57.605ms)
  ✔ getEventRisk: flag false → severity 0 on empty calendar (19.7117ms)
  ✔ getEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar (2.5055ms)
  ✔ getBulkEventRisk: unset flag in live mode → severity 0 on empty calendar (1.8966ms)
  ✔ getBulkEventRisk: flag false → severity 0 on empty calendar (2.1084ms)
  ✔ getBulkEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar (3.6675ms)
✔ EventCalendarService — EVENT_CALENDAR_ENFORCE_FRESHNESS flag (92.2418ms)
✔ eventImpactSeverity decays by trading session (1.666ms)
✔ EventCalendarService.daysBetween explicitly skips weekends and holidays (78.6525ms)
✔ EventCalendarService.addTradingDays advances by NSE sessions (not calendar days) (4.3134ms)
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.70% >= 3.5%
[ExtensionGate] TEST SHORT rejected: EXTENDED_DOWN dayReturn=-5.00% <= -3.5%
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.00% >= 3.5%
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.70% >= 3.5%
▶ Extension / exhaustion gate (DIXON-class days)
  ✔ rejects LONG BTST after a >3.5% up day (DIXON-style extension) (48.0901ms)
  ✔ allows LONG BTST on a normal ~1% up day (0.8778ms)
  ✔ rejects SHORT STBT after a sharp dump day (0.8985ms)
  ✔ exposes configured limits used by the gate (0.3616ms)
  ✔ history fallback: when last bar is prior session, previousClose is last.close (not n-2) (1.8507ms)
  ✔ history fallback: when last bar is today, previousClose is n-2 (6.7332ms)
✔ Extension / exhaustion gate (DIXON-class days) (61.6168ms)
▶ FnoUniverseCheckService
  ✔ should return no drift when NSE list perfectly matches local isFnO list (3.9624ms)
  ✔ should flag newly-ineligible stock (0.7393ms)
  ✔ should flag brand-new NSE listing (0.5409ms)
  ✔ should handle fetch failure gracefully (0.4606ms)
  ✔ should handle case and padding insensitivity (0.8787ms)
✔ FnoUniverseCheckService (9.6581ms)
▶ FyersAuthService Diagnostic Logging
  ✔ direct call non-2xx status logs status and body text, then falls back (3.2546ms)
  ✔ direct call 200 with { s: "error" } logs full body, then falls back (1.4606ms)
  ✔ direct call 200 with { s: "ok" } but missing token logs full body, then falls back (5.5417ms)
✔ FyersAuthService Diagnostic Logging (23.6585ms)
▶ index-intraday.util
  ✔ indexBtstDiscoveryAsOfUtc maps 15:25 IST to 09:55 UTC (3.2146ms)
  ✔ parseIndexIntradayMetricsFromChart computes VWAP and last15mHigh (72.8464ms)
  ✔ parseIndexIntradayMetricsFromChart excludes the latest forming closing-window bar (5.2359ms)
✔ index-intraday.util (87.4313ms)
▶ index-btst-backtest.helper
  ✔ resolveIndexVixCalm matches production VIX bands (2.7814ms)
  ✔ returns not tradable when intraday chart missing (score invalid) (1.5007ms)
  ✔ requires READY+ score floor (85/130) with full intraday data (1.146ms)
  ✔ suppresses LONG in BEAR regime (live alert/journal path) (0.5282ms)
✔ index-btst-backtest.helper (6.6313ms)
▶ getIndexBtstCompare
  ✔ excludes breakeven live and backtest trades from win-rate denominators (77.8179ms)
  ✔ returns null win rates when closed trades are all breakeven (16.6782ms)
✔ getIndexBtstCompare (96.5665ms)
▶ indexClassificationToQualityBucket
  ✔ maps INDEX_STRONG and INDEX_READY to TRADEABLE (4.4605ms)
  ✔ maps INDEX_WATCH and IGNORE to non-tradable buckets (0.3458ms)
✔ indexClassificationToQualityBucket (8.6125ms)
▶ selectTradableIndexBtstPicks
  ✔ selects INDEX READY+ long picks and ignores stock classifications (34.9579ms)
  ✔ respects minScore floor and suppressLong regime gate (0.5829ms)
  ✔ dedupes by symbol keeping latest signalTime (0.466ms)
✔ selectTradableIndexBtstPicks (36.4795ms)
▶ selectTradableIndexStbtPicks
  ✔ only returns SHORT direction index signals with INDEX_READY+ classification (1.0828ms)
  ✔ returns empty array when suppressShort is true (BULL regime gate) (0.7ms)
  ✔ respects the minScore floor (0.7449ms)
  ✔ dedupes SHORT picks by symbol keeping latest signalTime (1.6157ms)
  ✔ logIndexStbtJournalEntries uses optionType PE (structural contract test) (49.9671ms)
✔ selectTradableIndexStbtPicks (55.461ms)
▶ index-btst-slice-metrics
  ✔ classifyVixBand uses production thresholds (1.485ms)
  ✔ parseIndexBtstTradeContext reads nested context (0.3996ms)
  ✔ computeIndexBtstSliceMetrics groups by vix and regime (0.7247ms)
✔ index-btst-slice-metrics (4.9035ms)
▶ Index Scan Cache Key
  ✔ generates a unique cache key for a given date (4.7498ms)
  ✔ generates a different key for a different date (0.344ms)
✔ Index Scan Cache Key (7.288ms)
[RegimeService] NIFTY 50 Regime for 2026-07-21: BEAR / HIGH (ATR%: 2.56%)
[RegimeService] NIFTY 50 Regime for 2026-07-25: BULL / HIGH (ATR%: 2.49%)
▶ IndexDiscoverService.discover
  ✔ scans exactly the fixed instrument list (NIFTY, BANKNIFTY, SENSEX) in both directions (LONG/SHORT) — no F&O universe loop (62.7543ms)
  ✔ returns IGNORE classification with null score in mock mode (no live VWAP/VIX) for both directions (7.9998ms)
  ✔ never throws on a weekend date — returns empty or safely skips non-trading days (6.9172ms)
  ✔ produces valid IST signalDate (YYYY-MM-DD) and stable discoveryStart signalTime (5.59ms)
✔ IndexDiscoverService.discover (86.9795ms)
▶ IndexDiscoverService.getIndiaVixState
  ✔ returns vixCalm null in mock mode (score-safety INVALID path) (0.3715ms)
✔ IndexDiscoverService.getIndiaVixState (0.6166ms)
▶ IndexDiscoverService.resolveIndexSessionCandles
  ✔ uses live session as today when hasLive (1.1311ms)
  ✔ uses prior completed session as yesterday when live daily history already includes today (0.9952ms)
  ✔ uses last completed bar as today after EOD when live unavailable (0.97ms)
  ✔ returns null mid-session without live feed (score-safety) (0.8234ms)
✔ IndexDiscoverService.resolveIndexSessionCandles (4.5778ms)
▶ IndexDiscoverService.resolvePreviousCompletedCandle
  ✔ returns n-2 when the latest daily candle is today (1.1159ms)
  ✔ returns the latest candle when history has not rolled into today yet (1.0304ms)
✔ IndexDiscoverService.resolvePreviousCompletedCandle (2.4598ms)
▶ IndexDiscoverService.mapIntraClassification
  ✔ maps scores onto INDEX_* using INTRA floors (75 / 60 / 40) (0.5378ms)
✔ IndexDiscoverService.mapIntraClassification (0.7829ms)
▶ IndexDiscoverService.discoverIntraday
  ✔ returns empty on weekend — does not fabricate INTRA rows (3.4493ms)
  ✔ never throws on a weekday and only emits INDEX_* classifications (9.9463ms)
✔ IndexDiscoverService.discoverIntraday (13.9925ms)
▶ filterIndexRowsForDisplay
  ✔ hides null-score BTST outside discovery window (1.6749ms)
  ✔ shows null-score BTST inside discovery window (0.2581ms)
  ✔ always keeps INTRA rows (0.2183ms)
✔ filterIndexRowsForDisplay (4.1902ms)
▶ primaryIndexReason
  ✔ returns first non-empty reason (0.3243ms)
  ✔ returns null when missing (0.2043ms)
✔ primaryIndexReason (0.8138ms)
▶ IndexIntraRankingService
  ✔ awards LOWER_VALUE points (symmetric with HIGHER_VALUE) (1.6083ms)
  ✔ awards session-move points for aligned bearish move (0.4045ms)
  ✔ scores BREAKDOWN without volume dependency (0.4783ms)
  ✔ maps classification using INTRA floors (75 / 60 / 40) (0.2814ms)
  ✔ caps score at 100 (0.2248ms)
✔ IndexIntraRankingService (5.545ms)
▶ index-intraday.util
  ▶ parseIndexIntradayMetricsFromChart
    ✔ should return empty metrics for missing or invalid chart data (3.4315ms)
    ✔ should correctly calculate last15mHigh and last15mLow during the closing liquidity window (38.4879ms)
    ✔ should fall back to unweighted average if volume is 0 (0.8867ms)
  ✔ parseIndexIntradayMetricsFromChart (44.5101ms)
✔ index-intraday.util (45.5812ms)
▶ IndexRankingService.calculateScoreDetails — score safety
  ✔ returns null score when vwap is missing (1.5266ms)
  ✔ returns null score when last15mHigh is missing (0.7071ms)
  ✔ returns null score when vixCalm is null/undefined (0.2701ms)
  ✔ returns null score when confirmation candles are unavailable (0.265ms)
✔ IndexRankingService.calculateScoreDetails — score safety (5.1019ms)
▶ IndexRankingService.calculateScoreDetails — rules
  ✔ Rule 1: awards vixCalm (25) only when vixCalm is true (0.76ms)
  ✔ Rule 2: awards cprNarrow (30) only when tomorrowCprNarrow is true (0.3582ms)
  ✔ Rule 3: awards higherValue (20) only when both tomorrow BC and TC exceed today (0.3863ms)
  ✔ Rule 4: awards vwap confirmation (20) only when close beats both TC and VWAP (0.4534ms)
  ✔ Rule 5: awards liquidity (20) only when close > last15mHigh (0.3304ms)
  ✔ Rule 6: awards closeStrength (15) only when CLV > 0.70 (0.3903ms)
  ✔ sums all six rules to a max score of 130 (0.3598ms)
✔ IndexRankingService.calculateScoreDetails — rules (3.7808ms)
▶ IndexRankingService.getClassification
  ✔ maps null score to IGNORE (0.4186ms)
  ✔ maps floors 100 / 85 / 70 to INDEX_STRONG / INDEX_READY / INDEX_WATCH (0.3671ms)
  ✔ uses index-specific classification strings that cannot collide with stock filters (0.2033ms)
✔ IndexRankingService.getClassification (1.5463ms)
▶ INDEX_SCORE / India VIX constants
  ✔ INDEX_SCORE mirrors ADVANCED_SCORE floors (STRONG/READY/WATCH/MAX) (0.4375ms)
  ✔ exposes India VIX calm/elevated thresholds (0.1854ms)
✔ INDEX_SCORE / India VIX constants (0.9222ms)
▶ Index BTST red-session guard
  ✔ blocks when session is down at least INDEX_BTST_RED_SESSION_BLOCK_PCT (0.7719ms)
  ✔ allows flat or green sessions above threshold (0.134ms)
✔ Index BTST red-session guard (1.7018ms)
▶ IndexRegimeService.computeAdjustment
  ✔ boosts LONG in bullish low-vol regime (4.3419ms)
  ✔ penalizes LONG in bearish high-vol regime (0.3139ms)
  ✔ boosts SHORT in bearish regime (0.279ms)
  ✔ returns neutral adjustment in choppy low-vol regime (0.232ms)
✔ IndexRegimeService.computeAdjustment (13.9512ms)
▶ IndexRegimeService.applyConfidence
  ✔ clamps confidence to max score (0.3906ms)
  ✔ returns null when base score is null (0.6663ms)
  ✔ floors confidence at zero (0.4331ms)
✔ IndexRegimeService.applyConfidence (2.1088ms)
▶ index-signal.util
  ✔ maps LONG READY to CALL_BUY (1.4755ms)
  ✔ maps SHORT READY to PUT_BUY (0.2785ms)
  ✔ maps IGNORE to NO_TRADE (0.1931ms)
  ✔ computes risk/reward string (0.2179ms)
  ✔ builds BTST reasons from breakdown (0.4091ms)
  ✔ builds INTRA reasons from signal tags (0.3774ms)
  ✔ blocks reasons when VIX elevated (0.1726ms)
✔ index-signal.util (4.9973ms)
▶ IndexRankingService (STBT SHORT)
  ▶ calculateShortScoreDetails
    ✔ returns null if any safety gate fails (vwap, last15mLow, vixElevated, hasConfirmationCandles) (1.7402ms)
    ✔ Rule 1: VIX Elevated (25 pts) (0.4407ms)
    ✔ Rule 2: Lower Value (20 pts) - tomorrow BC and TC both below today BC and TC (0.2283ms)
    ✔ Rule 3: CPR Narrow (30 pts) (0.2518ms)
    ✔ Rule 4: Bearish Confirmation (20 pts) - close < todayBc AND close < vwap (0.307ms)
    ✔ Rule 5: EOD Weakness (20 pts) - close < last15mLow (0.2154ms)
    ✔ Rule 6: Closing Weakness (15 pts) - close in bottom 30% of day range (0.2336ms)
    ✔ accumulates all points perfectly (Max 130) (3.0568ms)
  ✔ calculateShortScoreDetails (8.4367ms)
  ▶ getShortClassification
    ✔ classifies thresholds correctly (100/85/70) (0.4205ms)
  ✔ getShortClassification (5.4379ms)
✔ IndexRankingService (STBT SHORT) (14.9457ms)
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
  ﹣ persists overnightSignalId / model prices from the selected id, not the newest row (1.7826ms) # Postgres unreachable
✔ TradeJournal logSignal overnightSignalId linkage (P1-2) (4217.7227ms)
[EligibilityGate] LIQ rejected: avgVolume 99999 < 100000
[EligibilityGate] LIQ rejected: volumeRatio 1.40 < 1.5 (VDU hard gate)
▶ EntryManagerService hard liquidity gate (Advanced discover path)
  ✔ rejects avgVolume below 100k (hard exclude, not LOW_QUALITY flag) (3.2913ms)
  ✔ rejects volume-ratio below 1.5 VDU hard gate (0.7696ms)
  ✔ allows stocks that clear avgVolume 100k and volume-ratio 1.5 (VDU) (0.3268ms)
✔ EntryManagerService hard liquidity gate (Advanced discover path) (6.3517ms)
▶ cron-run-claim
  ✔ allows first claim and blocks duplicate until complete (2.1076ms)
  ✔ release allows retry after failure (0.7122ms)
✔ cron-run-claim (5.1547ms)
▶ resolveJournalSnapshotSlot
  ✔ maps IST windows to snapshot slots on a trading day (1.9288ms)
✔ resolveJournalSnapshotSlot (2.1596ms)
▶ shouldCompleteClaimedJob
  ✔ releases retryable soft failures (0.4604ms)
  ✔ completes successful or non-retryable results (0.2353ms)
✔ shouldCompleteClaimedJob (1.0508ms)
▶ Market Hours Utilities
  ▶ getISTDateString
    ✔ returns the correct IST date during UTC midnight rollover (pre-IST midnight) (43.5843ms)
    ✔ returns the correct IST date during the 5.5 hour mismatch window (0.7902ms)
    ✔ returns the correct IST date when UTC and IST days match (0.5501ms)
    ✔ matches getISTTime().dateString behavior (2.8389ms)
  ✔ getISTDateString (50.0572ms)
  ▶ isTodayCandleClosed (Live Market Scenario Regression)
    ✔ returns false during live market hours (e.g., 2:30 PM IST) (2.0581ms)
    ✔ returns false right before market close (0.976ms)
    ✔ returns true after market close (e.g., 4:00 PM IST) (0.9215ms)
  ✔ isTodayCandleClosed (Live Market Scenario Regression) (5.6312ms)
  ▶ getCompletedHistory
    ✔ keeps history unchanged when asOfDate replay is used (0.9494ms)
    ✔ with asOfDate equal to last candle date, returns full history even if wall-clock session is open (4.3206ms)
  ✔ getCompletedHistory (5.8824ms)
  ▶ Cash session (site-wide PRESESSION + LIVE)
    ✔ exposes 09:00 pre-open and 09:15–15:30 live labels (0.6291ms)
    ✔ maps CLOSED / PRESESSION / LIVE phases (4.5407ms)
    ✔ treats weekends as CLOSED (1.8207ms)
  ✔ Cash session (site-wide PRESESSION + LIVE) (7.4481ms)
  ▶ BTST window helpers (canonical BTST_WINDOWS)
    ✔ maps discovery / confirm / freeze / journal phases (6.2228ms)
    ✔ identifies the 15:15–15:30 EOD liquidity window (0.5975ms)
  ✔ BTST window helpers (canonical BTST_WINDOWS) (7.2994ms)
✔ Market Hours Utilities (77.9546ms)
▶ Market Profile — CONTINUOUS identity (default env)
  ✔ active profile resolves to CONTINUOUS clocks matching prior production (2.7498ms)
  ✔ BTST_WINDOW_MINUTES / BTST_CLOCK match CONTINUOUS fixtures (0.3307ms)
  ✔ isInClosingLiquidityWindow is [15:15, 15:30) under CONTINUOUS (0.225ms)
  ✔ supportsClosingAuction is always false under CONTINUOUS (0.3121ms)
  ✔ getSessionState never emits CAS/FNO_ONLY under CONTINUOUS (37.8479ms)
  ✔ shouldFreezeBreakouts is false under CONTINUOUS even for F&O after 15:15 (0.4717ms)
✔ Market Profile — CONTINUOUS identity (default env) (43.9444ms)
▶ Market Profile — CLOSING_AUCTION simulation
  ✔ SEBI-locked clocks on CLOSING_AUCTION profile (0.6191ms)
  ✔ supportsClosingAuction: F&O true, non-F&O false under CLOSING_AUCTION (1.8307ms)
  ✔ MarketSessionContext carries resolver fields (0.4581ms)
  ✔ getSessionState F&O: LIVE→CAS at 15:15, CAS until 15:35, FNO_ONLY until 15:40 (2.6019ms)
  ✔ getSessionState non-F&O: still LIVE at 15:20, no CAS (1.1159ms)
  ✔ shouldFreezeBreakouts after 15:15 for F&O only (1.1511ms)
  ✔ Rule5 window bounds on CLOSING_AUCTION profile object (0.3968ms)
✔ Market Profile — CLOSING_AUCTION simulation (13.4968ms)
▶ Market Profile — unknown env falls back to CONTINUOUS
  ✔ resolveMarketProfile ignores garbage (0.2123ms)
✔ Market Profile — unknown env falls back to CONTINUOUS (0.433ms)
▶ Market Profile — default helpers still continuous
  ✔ isMarketOpen / discovery helpers use CONTINUOUS module clocks (2.212ms)
✔ Market Profile — default helpers still continuous (2.4681ms)
[MarketService] 200 SMA caching failed for FAIL: Yahoo Finance HTTP 404
[LiveFeed] Fyers Primary OK for NSE:LTM-EQ (ltp=215.5, candles=110, hist=22)
[LiveFeed] Fyers Data API permission denied (Additional permission required). Fix: myapi.fyers.in → edit app → enable Quotes & Market Data + Historical Data (Fyers often requires all permission checkboxes) → Save → Reconnect Fyers in Settings. Skipping Fyers for 10m; Yahoo Fallback remains active.
[LiveFeed] Fyers quotes failed for NSE:LTM-EQ: HTTP 403 code=403 msg=Additional permission required
[LiveFeed] Yahoo Fallback OK for LTM.NS
[LiveFeed] Fyers Primary skipped for LTM: not connected
[LiveFeed] Yahoo Fallback failed for LTM.NS: Yahoo Finance HTTP 404 for LTM.NS
[LiveFeed] Yahoo Fallback OK for TEST.NS
▶ Market Service - 200 SMA Plumbing
  ✔ SMA Calculation Mathematical Correctness (>= 200 guard) (58.1182ms)
  ✔ cache200SMA() Per-Symbol Isolation on 404 (5.6046ms)
  ✔ getStockData() Cache Miss Fallback (1.9424ms)
  ✔ getStockData() Fyers Primary succeeds with quotes LTP + history (76.8665ms)
  ✔ probeFyersDataApi() reports permission denial clearly (1.7057ms)
  ✔ getStockData() uses Yahoo Fallback when Fyers Primary fails (6.3573ms)
  ✔ getStockData() skips Fyers Primary when not Connected (1.0955ms)
  ✔ getStockData() silently skips null-ohlc placeholder candles (3.1204ms)
✔ Market Service - 200 SMA Plumbing (163.3384ms)
▶ Middleware Authentication & Gating
  ✔ redirects anonymous visits to /scanner to /unlock (30.9348ms)
  ✔ allows anonymous visits to public pages (7.3632ms)
  ✔ allows anonymous access to PWA static assets (4.5787ms)
  ✔ does not Set-Cookie app_access_token on anonymous page visits (0.7932ms)
  ✔ blocks unauthenticated API requests with 401 (3.7094ms)
  ✔ allows API requests with valid authorization header (1.1941ms)
  ✔ allows API requests with valid cookie (2.9779ms)
  ✔ exempts public and cron API routes from token checks (8.733ms)
  ✔ requires auth for Fyers login (prevents token overwrite) (0.9139ms)
  ✔ does not treat /api/*.png spoof as a public static asset (0.8612ms)
✔ Middleware Authentication & Gating (65.5186ms)
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Rollover check for NIFTY - currentExpiryStr: 2026-08-05, parsed: Wed Aug 05 2026 05:30:00 GMT+0530 (India Standard Time), today: Wed Aug 05 2026 05:30:00 GMT+0530 (India Standard Time), isExpiredOrToday: true
[OptionChain] Current expiry 2026-08-05 is expired/today. Fetching NEXT expiry timestamp: 1234567890 (2026-08-12) for NIFTY
[OptionChain] Next expiry response status: ok, message: undefined
[OptionChain] Successfully rolled over NIFTY to 2026-08-12
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
[OptionChain] Rollover check for NIFTY - currentExpiryStr: 2026-08-05, parsed: Wed Aug 05 2026 05:30:00 GMT+0530 (India Standard Time), today: Wed Aug 05 2026 05:30:00 GMT+0530 (India Standard Time), isExpiredOrToday: true
[OptionChain] Current expiry 2026-08-05 is expired/today. Fetching NEXT expiry timestamp: 9876543210 (2026-08-12) for NIFTY
[OptionChain] Next expiry response status: ok, message: undefined
[OptionChain] Successfully rolled over NIFTY to 2026-08-12
[OptionChain] Proxy fetch succeeded for NIFTY.
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Fetching explicit target expiry: AUG 2030 -> 22222 for NIFTY
[OptionChain] Direct fetch succeeded for NIFTY.
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Fetching explicit target expiry: 30 JUL 2030 -> 11111 for NIFTY
[OptionChain] Direct fetch succeeded for NIFTY.
[OptionChain] Attempting direct fetch for NIFTY...
[OptionChain] Rollover check for NIFTY - currentExpiryStr: 2030-07-30, parsed: Tue Jul 30 2030 05:30:00 GMT+0530 (India Standard Time), today: Wed Aug 05 2026 05:30:00 GMT+0530 (India Standard Time), isExpiredOrToday: false
[OptionChain] Direct fetch succeeded for NIFTY.
✔ OptionChainService fetchOptionQuote regex supports & (2.4357ms)
✔ OptionChainService rollover logic and cache partitioning (52.4686ms)
✔ OptionChainService applies rollover when direct fetch falls back to proxy (8.9459ms)
✔ OptionChainService resolveRolledOverChain parses targetExpiryStr (monthly vs weekly) (10.0749ms)
✔ OptionChainService TTL uses F&O session end in CLOSING_AUCTION (1.2738ms)
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
✔ OptionSuggestionService extracts expiry from NSE and BSE Fyers option symbols (2.3767ms)
▶ Option Suggestion Service — Honest Error Paths (no fabricated data)
  ✔ TOKEN_EXPIRED: missing token returns error, no optionsChain, no fake data (1.4621ms)
  ✔ EMPTY_CHAIN: Fyers returns no data — explicit error, no fake fallback (0.4462ms)
  ✔ FETCH_FAILED: propagates error honestly, no fabricated data (0.5881ms)
  ✔ Math.random never called during any error path (0.9145ms)
✔ Option Suggestion Service — Honest Error Paths (no fabricated data) (5.0445ms)
▶ Option Suggestion — OI Score scales relative to max OI among candidates
  ✔ highest OI candidate gets oiScore=30 (8.2245ms)
✔ Option Suggestion — OI Score scales relative to max OI among candidates (9.1508ms)
✔ Option Suggestion — SENSEX formatted name expands BSE weekly expiry token (1.7397ms)
▶ Option Suggestion — PCR Context Score
  ✔ CE trade + PCR > 1.2 → pcrContextScore = 20 (1.4363ms)
  ✔ PE trade + PCR < 0.8 → pcrContextScore = 20 (2.3117ms)
  ✔ CE trade + PCR < 0.8 → pcrContextScore = 0 (contradicts direction) (1.6563ms)
✔ Option Suggestion — PCR Context Score (6.694ms)
▶ Option Suggestion — Spread Score tiers
  ✔ <=1% spread -> 20 pts (1.3203ms)
  ✔ <=2% spread -> 15 pts (0.5323ms)
  ✔ <=4% spread -> 10 pts (4.1202ms)
  ✔ <=8% spread -> 5 pts (0.7655ms)
  ✔ >8% spread -> 0 pts (0.5732ms)
✔ Option Suggestion — Spread Score tiers (8.735ms)
▶ Option Suggestion — ITM Depth Score: 1st ITM preferred
  ✔ 1st ITM selected when all other scores equal → itmDepthScore=10 (1.1233ms)
✔ Option Suggestion — ITM Depth Score: 1st ITM preferred (1.6172ms)
▶ Option Suggestion — Expensive high-scoring strike wins (no budget gate)
  ✔ Rs300 ltp (very expensive) but perfect OI/vol/spread beats Rs5 ltp cheap strike (0.5602ms)
✔ Option Suggestion — Expensive high-scoring strike wins (no budget gate) (0.9163ms)
▶ Option Suggestion — zero OI and zero volume returns NO_VIABLE_STRIKES
  ✔ CE: all candidates have 0 OI and 0 volume → NO_VIABLE_STRIKES (0.6283ms)
  ✔ PE: all candidates have 0 OI and 0 volume → NO_VIABLE_STRIKES (0.5844ms)
✔ Option Suggestion — zero OI and zero volume returns NO_VIABLE_STRIKES (1.914ms)
▶ STOCK_OVERNIGHT_INSTRUMENT_WHERE
  ✔ excludes INDEX instrumentType so stock overnight queries stay isolated (3.9103ms)
✔ STOCK_OVERNIGHT_INSTRUMENT_WHERE (10.1826ms)
▶ INDEX_OVERNIGHT_INSTRUMENT_WHERE
  ✔ selects INDEX instrumentType only (0.3501ms)
✔ INDEX_OVERNIGHT_INSTRUMENT_WHERE (0.9372ms)
▶ OvernightRiskService - Index Correlation (Beta Proxy)
  ✔ synthesizes beta_proxy correctly for known-correlated series (5.1862ms)
  ✔ uses extended stock-history fetch for beta when MarketService history is truncated to 22 days (45.135ms)
  ✔ zero-variance Nifty window returns null for beta_proxy without throwing (1.3465ms)
  ✔ handles misaligned date gaps correctly by dropping them (1.5071ms)
  ✔ skips zero-price bases instead of poisoning beta with fake 0% returns (1.4454ms)
  ▶ Phase 2B Index Correlation Risk Weighting & Regression Checks
    ✔ correlation null (short history <60d) defaults to neutral beta=1.0 and preserves exact LOW/MEDIUM/HIGH riskLevel math (4.4971ms)
    ✔ high beta (>1.0) shifts riskFactor upward across threshold (MEDIUM -> HIGH) (2.1725ms)
    ✔ low beta (<1.0) dampens riskFactor downward across threshold (MEDIUM -> LOW) (2.1251ms)
  ✔ Phase 2B Index Correlation Risk Weighting & Regression Checks (9.4681ms)
✔ OvernightRiskService - Index Correlation (Beta Proxy) (66.6339ms)
▶ overnight-ui-adapter (Phase H)
  ✔ maps OvernightSignal into BTST UI DTO with advanced metadata (2.0613ms)
  ✔ selects TRADEABLE READY+ picks and respects STBT suppression (0.9997ms)
  ✔ compareLatestScanRows prefers newer signalTime then score (23.5643ms)
  ✔ dedupes by symbol so rescans cannot fill both top-N slots (3.6865ms)
✔ overnight-ui-adapter (Phase H) (32.6277ms)
▶ sanitizePagination
  ✔ accepts valid numeric strings (3.7644ms)
  ✔ falls back to defaults on missing values (0.3451ms)
  ✔ rejects NaN / garbage input (0.2427ms)
  ✔ rejects zero and negative page (would produce negative Prisma skip) (0.3112ms)
  ✔ rejects zero / negative limit (0.2174ms)
  ✔ caps abusive page sizes at MAX_PAGE_LIMIT (0.2357ms)
  ✔ floors non-integer values (0.9533ms)
✔ sanitizePagination (14.6387ms)
▶ computeOptionPnl
  ✔ computes a winning long-premium trade (5.4621ms)
  ✔ computes a losing trade with correct sign (0.4006ms)
  ✔ rounds to 2 decimal places (no float noise) (0.2419ms)
  ✔ never divides by zero — entryCmp 0 yields 0% not Infinity (0.4286ms)
  ✔ handles negative entryCmp defensively without NaN (0.2207ms)
  ✔ breakeven is zero (0.2873ms)
✔ computeOptionPnl (11.3274ms)
▶ Redis Cache Client Tests
  ✔ Initial state or ready state check (2.1817ms)
✔ Redis Cache Client Tests (5.1989ms)
[RegimeService] NIFTY 50 Regime for 2026-07-20: BULL / HIGH (ATR%: 3.33%)
▶ RegimeService - EMA Edge Case Fix
  ✔ length=19 returns DEFAULT regime (CHOPPY/LOW/50) (61.0772ms)
  ✔ length=20 returns DEFAULT regime instead of spurious BULL (1.5665ms)
  ✔ length=21 computes a genuine trend (not default, not spurious) (4.6643ms)
✔ RegimeService - EMA Edge Case Fix (72.1281ms)
✔ scanner mixed universes stay live past 15:15 in CLOSING_AUCTION (73.8069ms)
✔ NIFTY_FNO universe remains closed after 15:15 in CLOSING_AUCTION (75.4218ms)
✔ per-symbol freeze only applies to F&O names in CLOSING_AUCTION (3.9152ms)
▶ Scanner Service Signals Evaluation
  ✔ evaluates NORMAL and BULLISH signals correctly (69.0997ms)
  ✔ evaluates BREAKDOWN signal correctly on high-volume move below bc (4.2473ms)
  ✔ Scanner Dynamic Shift Bias (P0) — live market partial candle does not override yesterday CPR (2.7709ms)
  ✔ detects GAPS and VIRGIN CPR correctly (1.0888ms)
✔ Scanner Service Signals Evaluation (81.5049ms)
▶ Scanner Service V2 Entry, Target, Stop Loss, and Risk-Reward (RR)
  ✔ calculates correct trade setups for BULLISH bias (3.2712ms)
  ✔ calculates correct trade setups for BEARISH bias (7.0466ms)
✔ Scanner Service V2 Entry, Target, Stop Loss, and Risk-Reward (RR) (11.4144ms)
▶ Ranking Service V2 Scoring & Classifications
  ✔ assigns correct classification labels based on score ranges (0.5305ms)
  ✔ calculates correct score sum and caps at 100 (0.6111ms)
✔ Ranking Service V2 Scoring & Classifications (2.0937ms)
▶ KGS CPR Theory Signal and Scoring Tests
  ✔ HP_ASC_CPR fires when 3 consecutive rising TC days and PDL is respected (1.2146ms)
  ✔ HP_ASC_CPR is invalidated when close breaks below PDL (1.3229ms)
  ✔ HP_DESC_CPR fires when 3 consecutive falling TC days and PDH is respected (1.0759ms)
  ✔ HP_DESC_CPR is invalidated when close breaks above PDH (1.0293ms)
  ✔ HP_ASC_REVERSAL fires when valid ASC setup yesterday is broken below PDL today (0.684ms)
  ✔ HP_ASC_REVERSAL does NOT fire if yesterday was only a 2-leg match (1.2875ms)
  ✔ HP_DESC_REVERSAL fires when valid DESC setup yesterday is broken above PDH today (1.6271ms)
  ✔ HP_INSIDE_CPR fires when today fully inside yesterday (0.7631ms)
  ✔ HP_OUTSIDE_CPR fires when today fully contains yesterday (1.6221ms)
  ✔ HP_RTP fires when SMA20/SMA50 slopes match sign (0.6802ms)
  ✔ HP_HP_RTP (a) valid crossing matching RTP direction fires (0.7556ms)
  ✔ HP_HP_RTP (b) static position above/below 200 without crossing does not fire (7.8376ms)
  ✔ HP_HP_RTP (c) crossing opposite RTP slope does not fire (0.7446ms)
  ✔ HP_HP_RTP (d) missing sma200 or absent RTP correctly blocks it (4.1202ms)
  ✔ HP_HP_RTP (e) fires correctly on live in-progress crossing (0.6917ms)
  ✔ HP_DIRECT_UP fires on green candle closing decisively above R1 (0.5072ms)
  ✔ HP_DIRECT_DOWN fires on red candle closing decisively below S1 (0.5228ms)
  ✔ HP_REVERSAL_DOWN fires on red candle rejecting R1 after tagging it (0.3832ms)
  ✔ HP_REVERSAL_UP fires on green candle rejecting S1 after tagging it (0.4349ms)
  ✔ Open Tricks signals do not fire when R1/S1 are not touched (0.416ms)
  ✔ RankingService does NOT score HP_DIRECT_UP + BULLISH (zero-weight until backtested) (0.3576ms)
  ✔ HP_CAM_BULL_BIAS fires when Cam S3 is inside CPR zone (0.4455ms)
  ✔ KGS_CAM_BEAR_BIAS fires when Cam R3 is inside CPR zone (0.5107ms)
  ✔ Existing INSIDE_VALUE logic remains functional and unaffected (0.4595ms)
✔ KGS CPR Theory Signal and Scoring Tests (42.8997ms)
▶ SMA Slope — non-overlapping windows produce meaningful slope
  ✔ rising price series produces sma20Slope > 10 with 40 closes (0.5369ms)
  ✔ falling price series produces negative sma20Slope (0.2864ms)
  ✔ insufficient history (< 40 bars) returns sma20Slope = 0 (0.2657ms)
  ✔ flat price series produces sma20Slope = 0 (0.198ms)
✔ SMA Slope — non-overlapping windows produce meaningful slope (2.1937ms)
▶ ScannerService/SignalService — asOfDate Inject and Forwarding
  ✔ scanStock(stock, "2026-06-03") forwards asOfDate, triggers SignalService-only GAP_UP signal (3.1328ms)
  ✔ scanStock(stock, "2026-06-02") does not trigger GAP_UP (1.002ms)
  ✔ scanStock(stock) with no asOfDate defaults to system IST date (no GAP_UP) (7.5724ms)
✔ ScannerService/SignalService — asOfDate Inject and Forwarding (12.5055ms)
✔ ScannerService degenerate single-candle history (6.3615ms)
▶ Category F — EMA 9/21 + RSI Confluence Scoring
  ✔ EMA_CROSS_BEAR + RSI_BEARISH + BREAKDOWN awards +15 in Category F (0.3123ms)
  ✔ EMA_CROSS_BEAR + RSI_OVERBOUGHT + BREAKDOWN awards +15 in Category F (0.1705ms)
  ✔ EMA_CROSS_BEAR + RSI_OVERSOLD + BREAKDOWN does NOT award Category F (late-short trap) (0.2668ms)
  ✔ EMA_CROSS_BULL + RSI_STRONG + BREAKOUT awards +15 in Category F (0.1743ms)
  ✔ hasBullishRSI and hasBearishRSI are mutually exclusive (0.3499ms)
✔ Category F — EMA 9/21 + RSI Confluence Scoring (2.3422ms)
▶ SectorRegimeService.applySectorDivergence
  ✔ tags BULLISH stock when sector is net-bearish with enough sample (1.7313ms)
  ✔ does NOT tag on a bull/bear tie (strict > required) (0.6347ms)
  ✔ does NOT tag when sector sample is below minimum (3) (0.5255ms)
  ✔ ignores fallback buckets Other / Unknown / empty sector (0.6183ms)
  ✔ neutral stocks do not count toward the sector sample (0.4123ms)
  ✔ sectors are judged independently (0.392ms)
✔ SectorRegimeService.applySectorDivergence (7.3772ms)
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=3.96% >= 3.5%
▶ stock-intraday.util
  ✔ toYahooNseSymbol appends .NS for plain symbols (8.7325ms)
  ✔ parseStockIntradayMetricsFromChart computes VWAP and closing extremes (65.0968ms)
  ✔ parseStockIntradayMetricsFromChart excludes the latest forming closing-window bar (1.2026ms)
✔ stock-intraday.util (77.7352ms)
▶ stock-btst-backtest.helper
  ✔ classifyVduBand matches production thresholds (0.6692ms)
  ✔ classifyScoreBand uses ADVANCED_SCORE floors (0.3657ms)
  ✔ returns not tradable when intraday chart missing (1.9513ms)
  ✔ suppresses LONG in BEAR regime (0.5472ms)
  ✔ requires READY+ when full intraday data present (12.6385ms)
✔ stock-btst-backtest.helper (17.4126ms)
▶ stock-btst-slice-metrics
  ✔ parseStockBtstTradeContext reads nested context (3.31ms)
  ✔ computeStockBtstSliceMetrics groups by regime and VDU (5.9239ms)
✔ stock-btst-slice-metrics (9.7084ms)
▶ getStockBtstCompare
  ✔ excludes breakeven live and backtest trades from win-rate denominators (91.9721ms)
  ✔ returns null win rates when closed trades are all breakeven (18.1149ms)
✔ getStockBtstCompare (121.2758ms)
▶ resolveOvernightConflict — null scores ineligible
  ✔ picks higher non-null side and marks NEUTRAL_CONFLICT when diff < 10 (2.1273ms)
  ✔ does not mark conflict when diff >= 10 (0.5762ms)
  ✔ ignores LONG when score is null — SHORT wins (0.504ms)
  ✔ ignores SHORT when score is null — LONG wins (0.2305ms)
  ✔ returns null direction when both scores are null (0.2142ms)
  ✔ does not coerce null to 0 (null LONG vs SHORT 5 must not create conflict) (0.2419ms)
✔ resolveOvernightConflict — null scores ineligible (9.7193ms)
▶ VDU Option B — score at SPIKE_RATIO (2.0×), gate remains 1.5×
  ✔ does not award VDU at eligibility floor (1.5×) (3.644ms)
  ✔ awards VDU at SPIKE_RATIO (2.0×) (0.6078ms)
  ✔ STBT mirrors the same VDU scoring threshold (1.0831ms)
✔ VDU Option B — score at SPIKE_RATIO (2.0×), gate remains 1.5× (5.8398ms)
[Telegram] TELEGRAM_GROUP_CHAT_ID not set; falling back to personal chat for BTST alert
[Telegram] Failed to send message: telegram error body
▶ sendBtstAlert group-only delivery
  ✔ sends only to the group chat, never to the personal DM (65.0365ms)
  ✔ falls back to the personal chat only when no group is configured (16.9451ms)
  ✔ group send failure returns sent=false so claims roll back and retry (3.3925ms)
  ✔ "no qualifying setups" status message also goes to the group (1.0915ms)
✔ sendBtstAlert group-only delivery (90.3833ms)
▶ Quantitative Trading Logic Fixes
  ✔ Short return calculation math in computeMetricsFromTrades (4.0589ms)
  ✔ calculateCPR classification and trend consistency with ATR% (0.8493ms)
✔ Quantitative Trading Logic Fixes (7.1505ms)
▶ Trend Confluence Shadow Scoring
  ✔ BTST - Fresh bullish cross + RSI 55 -> 15 pts (4.4382ms)
  ✔ BTST - Bullish alignment only + RSI 60 -> 5 pts (0.6611ms)
  ✔ BTST - Bullish alignment + RSI 75 (overbought trap) -> -10 pts (0.5675ms)
  ✔ BTST - Missing RSI or EMA data -> 0 pts, no throw (0.4797ms)
  ✔ STBT - Fresh bearish cross + RSI 45 -> 15 pts (0.8877ms)
  ✔ STBT - Bearish alignment only + RSI 40 -> 5 pts (0.5115ms)
  ✔ STBT - Bearish alignment + RSI 25 (oversold trap) -> -10 pts (0.4291ms)
  ✔ STBT - Missing data -> 0 pts (0.5761ms)
  ✔ Regression check on base score output identity (0.9064ms)
✔ Trend Confluence Shadow Scoring (14.3812ms)
▶ VPA math helpers
  ✔ computeClv returns +1 at close on high (1.8163ms)
  ✔ computeClv returns null on zero range (0.3894ms)
  ✔ computeRvol uses avgVolume denominator safely (4.6178ms)
✔ VPA math helpers (10.2093ms)
▶ scoreVpaBreakoutConfirm
  ✔ returns null when there is no breakout attempt (inside CPR) (2.2309ms)
  ✔ confirms a volume+CLV-backed breakout above CPR (0.4185ms)
  ✔ penalizes a weak breakout attempt above CPR (0.311ms)
  ✔ confirms a volume+CLV-backed breakdown below CPR (0.3212ms)
  ✔ returns null when SHORT has no breakdown attempt (0.3451ms)
✔ scoreVpaBreakoutConfirm (4.3237ms)
▶ VpaConfirmationService.analyze
  ✔ rewards strong RVOL + close near high on LONG (3.3933ms)
  ✔ penalizes weak RVOL on LONG without weak-breakout mislabel (1.042ms)
  ✔ detects buying climax and recommends reject (0.5137ms)
  ✔ detects absorption (high volume, tiny range) (0.5139ms)
  ✔ detects no demand on narrow up-day (0.8589ms)
  ✔ returns disabled result when VPA_ENABLED=false (0.9344ms)
✔ VpaConfirmationService.analyze (7.9353ms)
▶ BtstRankingService VPA shadow integration
  ✔ does not change the authoritative 130pt score (1.7292ms)
  ✔ returns null score unchanged when inputs invalid (0.3173ms)
✔ BtstRankingService VPA shadow integration (2.3165ms)
▶ VPA shadow master kill-switch
  ✔ blocks live confidence/gates while shadow mode is on (default fail-safe) (0.9491ms)
  ✔ allows live confidence/gates only when shadow is off AND live flags are on (0.3824ms)
  ✔ keeps live paths off when shadow is off but live flags remain false (0.5343ms)
✔ VPA shadow master kill-switch (2.2514ms)
▶ VpaConfirmationService.applyConfidenceDelta
  ✔ leaves confidence unchanged when adjustment is zero (0.2961ms)
  ✔ does not apply non-zero delta while shadow mode blocks live confidence (0.147ms)
✔ VpaConfirmationService.applyConfidenceDelta (0.6037ms)
▶ VpaConfirmationResult.live flag
  ✔ returns live: false under default shadow mode even if live flags are on (0.8205ms)
  ✔ returns live: true when shadow is off AND confidence live is on (1.1394ms)
  ✔ returns live: true when shadow is off AND gates live is on (0.6107ms)
  ✔ returns live: false when shadow is off but both live flags remain false (0.5924ms)
  ✔ returns live: false when VPA is disabled (0.4369ms)
✔ VpaConfirmationResult.live flag (4.0004ms)
▶ scoreVpaClv
  ✔ neutral close (exactly mid-range) does not flag BEARISH for LONG or BULLISH_CLOSE for SHORT (0.371ms)
  ✔ close in the bottom ~15% of range (e.g. 92 out of 90-110) flags BEARISH for LONG (0.1724ms)
  ✔ close in the top ~15% of range (e.g. 108 out of 90-110) flags BULLISH for LONG (0.1659ms)
✔ scoreVpaClv (0.938ms)
▶ computeWinRate
  ✔ excludes breakeven trades from the denominator (2.5039ms)
  ✔ returns zero winRate without NaN when there are no decisive trades (0.432ms)
✔ computeWinRate (5.8115ms)
▶ alignedYahooSeriesLength
  ✔ returns 0 when required series are missing (4.3375ms)
  ✔ truncates to the shortest REQUIRED series only (non-required like volume do not shrink length) (0.262ms)
  ✔ returns 0 when a required series is shorter than any non-required series (0.1492ms)
✔ alignedYahooSeriesLength (7.4599ms)
▶ intraday parsers handle misaligned Yahoo payloads
  ✔ index parser returns empty when a required series is missing/empty (0.4826ms)
  ✔ stock parser truncates to aligned prefix instead of reading past series end (28.4306ms)
✔ intraday parsers handle misaligned Yahoo payloads (29.1585ms)
ℹ tests 510
ℹ suites 85
ℹ pass 509
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 19484.0929
TEST_EXIT_CODE=0
```

### 8.4 Post-fix greps

Command: `rg -n "process\.env\." src`

```text
src\config\market-profile.ts:122:  cachedActiveProfile = resolveMarketProfile(process.env.MARKET_PROFILE);
src\config\env.ts:143:const isProductionBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
src\instrumentation.ts:3:  if (process.env.NEXT_RUNTIME === 'nodejs') {
src\instrumentation.ts:10:    const appVersion = env.APP_VERSION || process.env.npm_package_version || 'unknown';
src\lib\api-error.ts:9:  if (process.env.NODE_ENV === 'development' && err instanceof Error && err.message) {
src\components\pwa\PwaRegistration.tsx:18:    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
src\tests\unit\vpa.test.ts:129:  const prevVpaEnabled = process.env.VPA_ENABLED;
src\tests\unit\vpa.test.ts:132:    process.env.VPA_ENABLED = 'true';
src\tests\unit\vpa.test.ts:136:    if (prevVpaEnabled === undefined) delete process.env.VPA_ENABLED;
src\tests\unit\vpa.test.ts:137:    else process.env.VPA_ENABLED = prevVpaEnabled;
src\tests\unit\env-prod-auth.test.ts:15:      process.env.NODE_ENV = 'production';
src\tests\unit\env-prod-auth.test.ts:16:      delete process.env.APP_ACCESS_TOKEN;
src\tests\unit\env-prod-auth.test.ts:17:      delete process.env.NEXT_PHASE;
src\tests\unit\env-prod-auth.test.ts:50:      process.env.NODE_ENV = 'production';
src\tests\unit\env-prod-auth.test.ts:51:      process.env.NEXT_PHASE = 'phase-production-build';
src\tests\unit\env-prod-auth.test.ts:52:      delete process.env.APP_ACCESS_TOKEN;
src\tests\unit\api-hardening.test.ts:66:    const prev = process.env.NODE_ENV;
src\tests\unit\market-profile.test.ts:42:    const p = resolveMarketProfile(process.env.MARKET_PROFILE);
src\app\api\health\route.ts:37:  const appVersion = env.APP_VERSION || process.env.npm_package_version || 'v1.0.0-rc.1';
src\services\option-suggestion.service.ts:318:    if (process.env.NODE_ENV !== 'test') {
```

Command: `rg -n "CPR_QUALITY_|cprQuality" src` — empty output means no matches.

```text

RG_EXIT_CODE=1 (1 = no matches found)
```

Command: `rg -n "\? 35 : 15" src` — empty output means no matches.

```text

RG_EXIT_CODE=1 (1 = no matches found)
```

Command: `rg -n "CPR_NARROW_WEIGHT" src`

```text
src\config\trading-constants.ts:26:  CPR_NARROW_WEIGHT: 15,
src\config\trading-constants.ts:27:  CPR_NARROW_WEIGHT_NO_VDU: 35,
src\services\backtest\btst.service.ts:145:      ? BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU
src\services\backtest\btst.service.ts:146:      : BTST_SCORING.CPR_NARROW_WEIGHT;
src\services\backtest\btst.service.ts:233:      ? BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU
src\services\backtest\btst.service.ts:234:      : BTST_SCORING.CPR_NARROW_WEIGHT;
```
