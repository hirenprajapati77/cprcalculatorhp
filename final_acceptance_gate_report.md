# Final Acceptance Gate Report

**Revision: regenerated 2026-08-06 (audit remediation pass 3).**

Pass 3 is a **revert-only** submission. One unauthorized scoring change (introduced
after pass 2 verification, in commit `4a6a082`) was removed so shipped code again
matches §0.2 / §6 as originally written. The verification gate in §8 was re-run
against the **post-revert** file bytes fingerprinted in §7.5 — not against the
pre-revert tree.

---

## 0. Audit remediation history

### 0.A Pass 2 fixes (2026-08-05) — still in place, re-verified pass 3

| # | Finding | Action | Pass 3 check |
|---|---|---|---|
| 1 | `telegram.service.ts` used `process.env.NODE_ENV` | Replaced with `env.NODE_ENV` at lines 26 and 225 | **Checked — matches** (§0.4 row 1) |
| 2 | Inline `isNoVdu ? 35 : 15` ternaries | Centralized into `BTST_SCORING.CPR_NARROW_WEIGHT` / `CPR_NARROW_WEIGHT_NO_VDU` | **Checked — matches** (§0.4 rows 2–3) |
| 3 | Dead `CPR_QUALITY_` badge in `ScannerClient.tsx` | Deleted unreachable block | **Checked — matches** (§0.4 row 4) |
| 4–5 | §5d scanner DB site count / top-for-options claim | Report text corrected | **Checked — matches** (§0.4 row 8) |

Pass 2 changed four files (`telegram.service.ts`, `btst.service.ts`, `ScannerClient.tsx`,
`trading-constants.ts`). Pass 3 changed **one file only** (`btst.service.ts`, revert).

### 0.B Pass 3 blocking finding — unauthorized change reverted

**What went wrong:** After pass 2 merged (`38c66c0` / PR #85), commit `4a6a082`
("align no_vdu_weighted narrow weight calculation with env.CPR_WEIGHT") changed
`calculateLongScore` / `calculateShortScore` (lines ~145 and ~233) to:

```typescript
? (env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU)
```

That is the exact unification pass 2 §0.2 explicitly said was **not** made and would
need separate approval. It was merged and deployed without that approval. Pass 2 §8.4
grep output showed the **pre-unification** lines, proving the verification gate was
run against a different file than what later shipped — a blocking internal
inconsistency.

**Pass 3 action (authorized):** Reverted lines ~145 and ~233 to fixed constants only:

```typescript
? BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU
: BTST_SCORING.CPR_NARROW_WEIGHT;
```

Line ~420 (`scoreBreakdown` path) was **not** touched — it still reads `env.CPR_WEIGHT`
as required. No other code changes were made in pass 3.

### 0.2 Latent divergence — disclosed, not fixed (unchanged from pass 2)

In `src/services/backtest/btst.service.ts` the NARROW-CPR weight for
`no_vdu_weighted` is computed in two independent places:

- **Score-affecting path** — `calculateLongScore` (lines 144–146) and
  `calculateShortScore` (lines 232–234): `BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU`
  (35) / `BTST_SCORING.CPR_NARROW_WEIGHT` (15). **Ignores `env.CPR_WEIGHT`.**
- **Reported-breakdown path** — `evaluateOvernight` (lines 420–421):
  `env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : 35` for `scoreBreakdown.cprNarrow`.

With `CPR_WEIGHT=25`, `longScore` is 35 while `scoreBreakdown.cprNarrow` is 25.
Defaults agree (both 35).

This was **not** changed in pass 3 (revert restored this state). Unification remains
a documented Known Issue pending separate approval and its own regression baseline.

### 0.4 Line-by-line report ↔ code verification (pass 3)

Each row was checked by reading the file on disk or running grep at pass 3
regeneration time (2026-08-06). "Matches" means the claim in the cited section is true
of the bytes in this package.

| Section / claim | Verification method | Result |
|---|---|---|
| §0.2 / §6 score path uses fixed constant, ignores `env.CPR_WEIGHT` | Read `btst.service.ts:144–146,232–234` | **Matches** — no `env.CPR_WEIGHT` on score path |
| §0.2 / §6 breakdown path honors `env.CPR_WEIGHT` | Read `btst.service.ts:420–421` | **Matches** — unchanged |
| §1 `telegram.service.ts` uses `env.NODE_ENV` | `rg env.NODE_ENV telegram.service.ts` | **Matches** — lines 26, 225 |
| §1 no raw `process.env` in telegram (migration scope) | `rg process.env telegram.service.ts` | **Matches** — zero hits |
| §1 `CPR_NARROW_WEIGHT` constants in `BTST_SCORING` | Read `trading-constants.ts:26–27` | **Matches** — 15 and 35 |
| §1 `CPR_QUALITY_` / `cprQuality` removed from `src/` | `rg CPR_QUALITY_\|cprQuality src` | **Matches** — zero hits |
| §1 env migration in middleware/crypto/redis | Spot-read lines cited in §5b | **Matches** — unchanged since pass 2 |
| §5d six `execute()` wrappers / eight `prisma.*` calls | `rg DatabaseCircuitBreaker.execute scanner/route.ts` | **Matches** — six sites |
| §5a circuit-breaker contracts | Read `circuit-breaker.ts` lines 16–18, 42–43, 63 | **Matches** — unchanged |
| Pass 2 §8.4 btst grep (showed constant-only lines) | Re-ran same grep post-revert | **Matches** — grep output now agrees with §0.2 |
| `btst.test.ts` CPR_WEIGHT override test | Not modified (out of pass 3 scope) | **Stale test** — fails after revert; see §6 |

No other report ↔ code disagreements were found beyond the reverted `4a6a082` change
and the stale unit test left by that commit.

---

## 1. Files Modified

### Pass 2 (merged PR #85 — unchanged by pass 3 except revert target)

- **`src/services/alert/telegram.service.ts`** — `env.NODE_ENV` at lines 26 and 225.
- **`src/config/trading-constants.ts`** — `BTST_SCORING.CPR_NARROW_WEIGHT` (15),
  `CPR_NARROW_WEIGHT_NO_VDU` (35).
- **`src/components/scanner/ScannerClient.tsx`** — dead `CPR_QUALITY_` badge removed.
- **`src/services/backtest/btst.service.ts`** — constants centralized (pass 2);
  unauthorized `env.CPR_WEIGHT` on score path **reverted** (pass 3).

### CPR Analytics & BTST (original acceptance scope)

- **`src/services/backtest/btst.service.ts`** — uses `env` and `BTST_SCORING`.
  **Centralized:** CLV multipliers and CPR narrow weights (see `trading-constants.ts`).
  **Left inline:** remaining simple-score leg weights/thresholds (frozen regression
  baseline — see pass 2 §1).
- **`src/lib/cpr-relationship.ts`**, **`src/services/scanner.service.ts`** — unchanged
  since pass 2; re-verified pass 3 (no edits).

### Production Hardening (unchanged since pass 2)

- **`src/config/env.ts`**, **`src/lib/circuit-breaker.ts`**, **`src/middleware.ts`**,
  **`src/lib/redis.ts`**, **`src/lib/crypto.ts`**, queue/fyers/telegram services,
  **`src/app/api/scanner/route.ts`** — as documented in pass 2 §1 and §5.

---

## 2. Shared Utilities

- **`src/lib/circuit-breaker.ts`** — database failover utility (unchanged).

## 3. Regression Verification

Baseline: `1081b56`.

- **`npx tsc --noEmit`:** exit 0 (§8.2).
- **`npm run test:unit`:** exit **1** — **511 tests, 509 pass, 1 fail, 1 skipped**
  (§8.3). This is an honest post-revert result, not a summarized pass claim.
- **The one failure** is documented in §6 — it is a stale test from commit `4a6a082`
  asserting score-path unification that pass 3 reverted. Not reclassified.
- **The one skip** is Postgres-unreachable (unchanged from pass 2).
- **`evaluateOvernightV2()`** live path is unaffected (does not read `CPR_WEIGHT`).

## 4. Breaking Changes

Unchanged from pass 2 §4. `env.CPR_WEIGHT` parsing fix applies to breakdown path only
(§0.2 scope limit).

## 5. Scope-Creep Diffs / Proof Audit

Unchanged from pass 2 §5a–5d; re-verified in §0.4. Authoritative on-disk sources:
`src/lib/circuit-breaker.ts`, `src/app/api/scanner/route.ts`, env-migration files in §5b.

## 6. Known Issues

- **`cprNarrowWeight` vs `env.CPR_WEIGHT` divergence** (§0.2) — **not fixed**; revert
  restored pass 2 documented state. Needs separate approval to unify.
- **One failing unit test** (pass 3 gate, not omitted):
  `src/tests/unit/btst.test.ts` › `no_vdu_weighted strategyVariant honors env.CPR_WEIGHT
  override` — added in `4a6a082`, asserts `longScore === 25` when `CPR_WEIGHT=25`.
  After pass 3 revert, `longScore` is 35 (fixed constant) while
  `scoreBreakdown.cprNarrow` is 25 — assertion at line 337 fails (`35 !== 25`). Test
  was **not** modified (pass 3 authorized only the revert). Removing or rewriting this
  test requires a separate pass.
- **One skipped unit test:** `TradeJournal logSignal overnightSignalId linkage (P1-2)`
  — `# Postgres unreachable` (environment limitation).
- **`CPR_QUALITY_` remnants in `scripts/`** — outside `src/` bundle; unchanged.
- **`prisma-setup.js` SQLite default** — local tooling only.

## 7. Deferred Items

Unchanged from pass 2 §7 (`cpr_deferred_implementation_notes.md`).

## 7.5 Proof-of-work file fingerprints (mandatory)

The verification gate in §8 was executed **after** the pass 3 revert, against these
exact byte sequences. The zip submitted with this report contains files with **identical
MD5** to the table below (verified immediately before staging).

| File | MD5 | Bytes | Gate relevance |
|---|---|---|---|
| `src/services/backtest/btst.service.ts` | `01d25608cb22e869d136bfd41143179b` | 21421 | **Primary** — revert target; §8 run against this hash |
| `src/services/alert/telegram.service.ts` | `6b1f259b3c51855f28b70b7ea6df5e39` | 12467 | Pass 2 fix |
| `src/components/scanner/ScannerClient.tsx` | `75e3a8c7aaf51be45111ad149c39b9c6` | 208287 | Pass 2 fix |
| `src/config/trading-constants.ts` | `961f2379ecf78d70dba9942311d5c95a` | 3449 | Pass 2 fix |
| `final_acceptance_gate_report.md` | `634b5687ba0c50bc5c29b8294d1f6c18` | 89204 | This report incl. §8 raw output |

**Key lines in fingerprinted `btst.service.ts` (must match zip):**

```
144:    const cprNarrowWeight = isNoVdu
145:      ? BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU
146:      : BTST_SCORING.CPR_NARROW_WEIGHT;
232:    const cprNarrowWeight = isNoVdu
233:      ? BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU
234:      : BTST_SCORING.CPR_NARROW_WEIGHT;
420:      const cprWeight = env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : 35;
```

Working tree at gate time: uncommitted revert on `main` (HEAD `f806ec3`), one modified
file (`btst.service.ts`) plus this report. **Not committed to main** per constraints.

---

## 8. Verification Gate — raw terminal output

Appended from terminal at **2026-08-06** after pass 3 revert, against fingerprint
`01d25608cb22e869d136bfd41143179b` (`btst.service.ts`). Unedited: no truncation, no
reordering, no substituted summary counts. Exit-code echo lines are part of capture.

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
┌─────────────────────────────────────────────────────────┐
│  Update available 6.19.3 -> 7.9.1                       │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘

✔ Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 176ms

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Want to turn off tips and other hints? https://pris.ly/tip-4-nohints
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
  ✔ calculates baseline correctly (1.0581ms)
  ✔ aggregates KGS_DIRECT_UP correctly (0.3834ms)
  ✔ aggregates BULLISH with neutral lift (0.2508ms)
  ✔ confidence is Low for small sample sizes (0.2201ms)
  ✔ returns empty result for empty input (5.9453ms)
  ✔ handles null signalSummary gracefully (0.4519ms)
  ✔ calculates liftExclusive correctly where signal appears in some but not all trades (0.2925ms)
  ✔ handles degenerate case where signal appears in every single trade (liftExclusive should equal winRate) (0.3555ms)
  ✔ excludes breakeven (pnl === 0) trades from winRate denominator (0.3184ms)
✔ aggregateSignalAnalytics (13.1107ms)
▶ cron-secret API exemptions (P1-3)
  ✔ exempts /api/cron/* and refresh routes used by the runbook (2.7572ms)
  ✔ does not exempt normal BTST/overnight GETs (still need APP_ACCESS_TOKEN) (0.2788ms)
✔ cron-secret API exemptions (P1-3) (4.6782ms)
▶ shouldFreshDiscoverBtst
  ✔ does not discover outside the window without bypass (1.2764ms)
  ✔ serves cache on bypass (no fresh discover) (0.2355ms)
  ✔ fresh-discovers on bypass when cache is empty (0.1397ms)
  ✔ fresh-discovers when the execution window is open (0.1543ms)
✔ shouldFreshDiscoverBtst (3.4237ms)
▶ maskSecretTail
  ✔ masks leaving the last 4 characters (0.2557ms)
  ✔ returns **** for short values (0.1378ms)
✔ maskSecretTail (0.6309ms)
▶ publicApiError
  ✔ hides internal messages outside development (0.4208ms)
✔ publicApiError (0.6184ms)
▶ POST /api/auth/unlock
  ✔ sets HttpOnly cookie when token matches APP_ACCESS_TOKEN (46.51ms)
  ✔ rejects wrong token with 401 and no cookie (5.016ms)
  ✔ rejects non-string token without throwing (1.3762ms)
  ✔ sets Secure when request is https (1.5446ms)
  ✔ rate limits after 5 attempts (16.9681ms)
✔ POST /api/auth/unlock (73.3975ms)
▶ POST /api/auth/logout
  ✔ clears the access cookie (0.8942ms)
✔ POST /api/auth/logout (1.0489ms)
▶ BTST backtest — single-day EOD-forced-exit simulation (Task I)
  ✔ Case 1: LONG — target hit intraday on next day (2.5744ms)
  ✔ Case 2: LONG — SL hit intraday on next day (0.4007ms)
  ✔ Case 3: LONG — neither SL nor target hit → EOD forced exit at close (0.3167ms)
  ✔ Case 4: SHORT — target hit intraday on next day (0.2766ms)
  ✔ Case 5: SHORT — neither SL nor target hit → EOD forced exit at close (0.2611ms)
  ✔ Case 6: ENTRY timestamp uses config.entryDate when OHLC is next-day only (1.5199ms)
✔ BTST backtest — single-day EOD-forced-exit simulation (Task I) (7.4576ms)
▶ TradeEngine — CLOSED_TIME_EXIT at exact window boundary
  ✔ exits CLOSED_TIME_EXIT when SL/Target not hit within 3-day window (4.2045ms)
  ✔ exits CLOSED_TIME_EXIT at day 1 when window is 1 candle (0.5452ms)
  ✔ exits CLOSED_SL before window boundary if SL is hit (0.4052ms)
  ✔ exits CLOSED_TARGET before window boundary if Target is hit (0.4248ms)
  ✔ CLOSED_TIME_EXIT — exit price is close of LAST candle in bounded window (0.3486ms)
✔ TradeEngine — CLOSED_TIME_EXIT at exact window boundary (8.2008ms)
▶ Backtest — no overlapping same-symbol trades within holding window
  ✔ blockedUntilIndex correctly prevents entries during cooldown window (1.563ms)
  ✔ cooldown resets correctly for each new symbol (independent trackers) (0.4026ms)
✔ Backtest — no overlapping same-symbol trades within holding window (2.6533ms)
▶ Metrics Service — Signal Bucketing
  ✔ groups trades with the same stable signal key into a single signalSuccess bucket (1.6549ms)
  ✔ excludes breakeven trades (pnl === 0) from winRate denominator (computed over decisive trades only) (0.426ms)
  ✔ computes drawdown relative to initialCapital parameter (0.2701ms)
✔ Metrics Service — Signal Bucketing (3.1459ms)
▶ BacktestService — evaluateTrigger Breakout Trigger Tests
  ✔ triggers on day i+2 via gap-open (gap-fill case) (0.5038ms)
  ✔ triggers on day i+3 via intraday touch (normal-fill case) (0.2209ms)
  ✔ never triggers within trigger window (NEVER_TRIGGERED case) (0.1558ms)
✔ BacktestService — evaluateTrigger Breakout Trigger Tests (1.4718ms)
▶ TradeEngineService — SCANNER_DRIVEN holding period and safety valve
  ✔ legacy 2-day cap force-closes trade on time (0.2981ms)
  ✔ scanner-driven 20-day safety valve allows target hit on day 6 (0.2057ms)
✔ TradeEngineService — SCANNER_DRIVEN holding period and safety valve (0.9227ms)
▶ Backtest Look-Ahead Bias Prevention (P0)
  ✔ BTST enters at Market-On-Close, not at intraday limit TC (0.2283ms)
✔ Backtest Look-Ahead Bias Prevention (P0) (0.4804ms)
▶ TradeEngine — adverse gap slippage cap and untradeable size
  ✔ adverse gap slippage is capped at 1.0%, not 0.5% (0.308ms)
  ✔ does not force 1 share when capital cannot afford it (0.3192ms)
  ✔ skips when entry equals SL (zero risk — no Infinity position size) (0.5673ms)
✔ TradeEngine — adverse gap slippage cap and untradeable size (1.7748ms)
▶ mapScanResultsForBreakoutAlert
  ✔ fills entry/sl/target fallbacks from tc/bc/r1 and ltp (2.9121ms)
  ✔ uses ltp-based fallbacks when levels are missing (0.4727ms)
✔ mapScanResultsForBreakoutAlert (5.3755ms)
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
  ✔ first claim of the day: findMany returns empty, create succeeds, send succeeds → sent true (448.1478ms)
  ✔ symbol already alerted today: filtered out, no Telegram send (9.3526ms)
  ✔ pre-migration _legacy row locks the whole day (no re-blast) (18.9928ms)
  ✔ claim-loop DB error rolls back already-claimed symbols (10.7269ms)
  ✔ new symbol at 15:20 bucket: existing symbol filtered, only new symbol sent (4.627ms)
  ✔ concurrent race: create P2002 for all symbols → already sent, Telegram never called (2.5905ms)
  ✔ claim succeeds, Telegram returns sent false → deleteMany rollback, failure response (4.1941ms)
  ✔ claim succeeds, sendBtstAlert throws → deleteMany rollback, error re-thrown (15.5905ms)
  ✔ empty payload: no Telegram send and no day claim retained (3.7238ms)
  ✔ option enrichment throw skips only that symbol and still sends remaining alerts (32.3786ms)
✔ BTST alert cron — BtstAlertState claim logic (per-symbol dedup) (555.537ms)
▶ BTST alert cron — alert-time journaling (alert ↔ journal parity)
  ✔ successful stock alert with option data is journaled immediately (5.4891ms)
  ✔ index BTST alert is journaled with the INDEX tag (2.7031ms)
  ✔ failed Telegram send never journals (claims rolled back instead) (2.3167ms)
  ✔ journal failure never breaks an already-sent alert (6.1841ms)
  ✔ alert without option suggestion defers to the 15:25 journal job (1.8954ms)
  ✔ missing market data fails closed (skips alert) (1.2344ms)
✔ BTST alert cron — alert-time journaling (alert ↔ journal parity) (21.0865ms)
▶ btstScanCacheKey (P1-1)
  ✔ includes universe so NIFTY50 and FNO do not share a key (1.3006ms)
  ✔ defaults blank universe to NIFTY50 (same as route) (0.3272ms)
  ✔ ALL / NIFTY50 / NSE_FNO are pairwise distinct (0.2462ms)
✔ btstScanCacheKey (P1-1) (6.1669ms)
▶ btst-journal premium TRADEABLE pipeline
  ✔ picks only TRADEABLE + READY+ (>=85), excluding WATCH/WATCHLIST/IGNORE (27.9988ms)
  ✔ suppresses STBT entirely in BULL regime (1.1142ms)
  ✔ suppresses BTST entirely in BEAR regime (0.5176ms)
  ✔ allows STBT in BEAR regime (0.2827ms)
  ✔ returns empty when only weak/non-tradable rows exist (0.4211ms)
  ✔ prefers latest signalTime over higher score when deduping rescans (2.3261ms)
✔ btst-journal premium TRADEABLE pipeline (35.6996ms)
▶ BTST Scoring Engine Tests
  ✔ Stock A: LONG setup (Score >= 80, Gap >= 20) (4.5034ms)
  ✔ Stock B: SHORT setup (Score >= 80, Gap >= 20) (1.0618ms)
  ✔ Stock C: NEUTRAL_CONFLICT (Scores close to each other) (0.9001ms)
  ✔ Stock D: WEAK (Max score < 10) (0.9096ms)
  ✔ Stock E: NEUTRAL_CONFLICT (Max score between 10 and 30) (1.0645ms)
  ✔ asOfDate override changes candle selection vs. different date (0.8237ms)
  ✔ asOfDate override is deterministic: same date always produces same output (1.3489ms)
  ✔ no asOfDate produces same result as calling with real today date (4.7773ms)
  ✔ discover() delegates to Advanced OvernightService engine (3.6943ms)
  ✔ isExecutionWindowOpen() enforces discovery window from BTST_WINDOWS (exclusive end) (6.6502ms)
  ✔ isExecutionWindowOpen() returns false on an NSE holiday even on a weekday, in-window (0.8667ms)
  ✔ isExecutionWindowOpen() still returns true on an ordinary weekday in-window (0.5889ms)
  ✖ no_vdu_weighted strategyVariant honors env.CPR_WEIGHT override (7.1947ms)
✖ BTST Scoring Engine Tests (37.0598ms)
✔ CacheService Falsy values (3.0005ms)
✔ Redis reconnect delay keeps retrying with a capped backoff (0.3366ms)
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
✔ CalculationService caches successful persisted share records (25.4734ms)
✔ CalculationService does not cache failed DB writes as share records (15.5028ms)
Circuit breaker open: DB connection failed. Cooldown until 2026-08-06T07:26:00.749Z
Circuit breaker half-open: attempting probe request to DB.
Circuit breaker closed: DB responded (non-connection error during probe).
Circuit breaker open: DB connection failed. Cooldown until 2026-08-06T07:26:00.758Z
Circuit breaker half-open: attempting probe request to DB.
Circuit breaker open: DB connection failed. Cooldown until 2026-08-06T07:26:00.759Z
✔ DatabaseCircuitBreaker — HALF_OPEN non-connection probe closes circuit (16.9873ms)
✔ DatabaseCircuitBreaker — connection error on probe re-opens with cooldown (3.0582ms)
▶ CPR Engine Calculations
  ✔ calculates correct levels with balanced inputs (3.2047ms)
  ✔ handles normalization (TC and BC swap) correctly (3.4431ms)
✔ CPR Engine Calculations (9.4882ms)
▶ CPR Inputs Schema Validation
  ✔ succeeds for valid inputs (12.0825ms)
  ✔ fails when High <= Low (1.0296ms)
  ✔ fails when Close is outside range (0.5205ms)
✔ CPR Inputs Schema Validation (14.6774ms)
[CPRJournal] NOTRIG not triggered: LTP 95 < Entry 100
[CPRJournal] DIVERGED skipped: sector divergence (live mode)
[CPRJournal] 7 qualifying signal(s) cut by CPR_JOURNAL_MAX_SIGNALS=3 (10 qualified today)
▶ runCprJournalJob entry-trigger and sector-divergence gates
  ✔ skips signal whose LTP never reached the entry trigger (50.5322ms)
  ✔ LTP exactly at entry counts as triggered (11.4223ms)
  ✔ legacy rows with entry=0 default pass the trigger gate (0.9877ms)
  ✔ SECTOR_DIVERGENCE skips journaling only in live filter mode (1.8675ms)
  ✔ findMany take is driven by CPR_JOURNAL_MAX_SIGNALS (1.4624ms)
✔ runCprJournalJob entry-trigger and sector-divergence gates (69.1424ms)
✔ CPR_JOURNAL_MAX_SIGNALS env schema rejects unsafe values (3.0321ms)
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
  ✔ formats ISO timestamps without inventing now (1.7176ms)
  ✔ extracts time from BTST/INDEX human scannedAt labels (0.7038ms)
  ✔ returns empty string when scannedAt is missing (UI shows —) (0.2801ms)
✔ lastRefreshLabel (honest Last Refresh) (4.6086ms)
▶ runCprScanJob
  ✔ returns success/count from ScannerController.runFullScan and notifies breakouts (2.1301ms)
  ✔ returns success=false when runFullScan throws and skips notify (5.9687ms)
✔ runCprScanJob (8.7523ms)
▶ cpr-scan claim buckets (retainClaim)
  ✔ same bucket key cannot re-claim after retainClaim=true (0.7274ms)
  ✔ next time-bucket key can claim again (periodic re-fire) (0.2901ms)
  ✔ retainClaim=false allows same key to reclaim after complete (0.3066ms)
✔ cpr-scan claim buckets (retainClaim) (1.7218ms)
▶ APP_ACCESS_TOKEN production guard
  ✔ throws when NODE_ENV=production and token is missing (runtime) (1012.5244ms)
  ✔ allows next production build phase without token (883.3413ms)
✔ APP_ACCESS_TOKEN production guard (1897.4753ms)
▶ REDIS_URL / optional URL env (P1-4)
  ✔ emptyStringToUndefined maps blank strings to undefined (1.3738ms)
  ✔ accepts REDIS_URL="" as unset (memory/cache fallback path) (0.7778ms)
  ✔ still rejects invalid REDIS_URL values (3.778ms)
  ✔ accepts a valid REDIS_URL (0.5888ms)
✔ REDIS_URL / optional URL env (P1-4) (8.7533ms)
[EventCalendarService] Calendar is STALE or EMPTY. Applying conservative 100 risk for SBIN.
▶ EventCalendarService — EVENT_CALENDAR_ENFORCE_FRESHNESS flag
  ✔ getEventRisk: unset flag in live mode → severity 0 on empty calendar (45.2423ms)
  ✔ getEventRisk: flag false → severity 0 on empty calendar (16.1029ms)
  ✔ getEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar (2.6878ms)
  ✔ getBulkEventRisk: unset flag in live mode → severity 0 on empty calendar (2.3281ms)
  ✔ getBulkEventRisk: flag false → severity 0 on empty calendar (1.3324ms)
  ✔ getBulkEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar (1.7002ms)
✔ EventCalendarService — EVENT_CALENDAR_ENFORCE_FRESHNESS flag (72.6224ms)
✔ eventImpactSeverity decays by trading session (1.5004ms)
✔ EventCalendarService.daysBetween explicitly skips weekends and holidays (42.166ms)
✔ EventCalendarService.addTradingDays advances by NSE sessions (not calendar days) (2.652ms)
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.70% >= 3.5%
[ExtensionGate] TEST SHORT rejected: EXTENDED_DOWN dayReturn=-5.00% <= -3.5%
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.00% >= 3.5%
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.70% >= 3.5%
▶ Extension / exhaustion gate (DIXON-class days)
  ✔ rejects LONG BTST after a >3.5% up day (DIXON-style extension) (49.4906ms)
  ✔ allows LONG BTST on a normal ~1% up day (0.7913ms)
  ✔ rejects SHORT STBT after a sharp dump day (1.685ms)
  ✔ exposes configured limits used by the gate (0.4202ms)
  ✔ history fallback: when last bar is prior session, previousClose is last.close (not n-2) (1.2557ms)
  ✔ history fallback: when last bar is today, previousClose is n-2 (2.684ms)
✔ Extension / exhaustion gate (DIXON-class days) (59.0149ms)
▶ FnoUniverseCheckService
  ✔ should return no drift when NSE list perfectly matches local isFnO list (3.1791ms)
  ✔ should flag newly-ineligible stock (0.6054ms)
  ✔ should flag brand-new NSE listing (0.5202ms)
  ✔ should handle fetch failure gracefully (0.3987ms)
  ✔ should handle case and padding insensitivity (2.3896ms)
✔ FnoUniverseCheckService (10.0026ms)
▶ FyersAuthService Diagnostic Logging
  ✔ direct call non-2xx status logs status and body text, then falls back (2.695ms)
  ✔ direct call 200 with { s: "error" } logs full body, then falls back (0.8718ms)
  ✔ direct call 200 with { s: "ok" } but missing token logs full body, then falls back (0.823ms)
✔ FyersAuthService Diagnostic Logging (6.7415ms)
▶ index-intraday.util
  ✔ indexBtstDiscoveryAsOfUtc maps 15:25 IST to 09:55 UTC (3.2141ms)
  ✔ parseIndexIntradayMetricsFromChart computes VWAP and last15mHigh (46.6552ms)
  ✔ parseIndexIntradayMetricsFromChart excludes the latest forming closing-window bar (0.8068ms)
✔ index-intraday.util (52.7483ms)
▶ index-btst-backtest.helper
  ✔ resolveIndexVixCalm matches production VIX bands (1.5362ms)
  ✔ returns not tradable when intraday chart missing (score invalid) (1.3738ms)
  ✔ requires READY+ score floor (85/130) with full intraday data (1.2945ms)
  ✔ suppresses LONG in BEAR regime (live alert/journal path) (0.507ms)
✔ index-btst-backtest.helper (9.5187ms)
▶ getIndexBtstCompare
  ✔ excludes breakeven live and backtest trades from win-rate denominators (58.2615ms)
  ✔ returns null win rates when closed trades are all breakeven (13.1941ms)
✔ getIndexBtstCompare (73.1953ms)
▶ indexClassificationToQualityBucket
  ✔ maps INDEX_STRONG and INDEX_READY to TRADEABLE (1.1714ms)
  ✔ maps INDEX_WATCH and IGNORE to non-tradable buckets (0.2815ms)
✔ indexClassificationToQualityBucket (3.1643ms)
▶ selectTradableIndexBtstPicks
  ✔ selects INDEX READY+ long picks and ignores stock classifications (21.4618ms)
  ✔ respects minScore floor and suppressLong regime gate (0.7557ms)
  ✔ dedupes by symbol keeping latest signalTime (0.3967ms)
✔ selectTradableIndexBtstPicks (23.0322ms)
▶ selectTradableIndexStbtPicks
  ✔ only returns SHORT direction index signals with INDEX_READY+ classification (5.7639ms)
  ✔ returns empty array when suppressShort is true (BULL regime gate) (0.3616ms)
  ✔ respects the minScore floor (0.2544ms)
  ✔ dedupes SHORT picks by symbol keeping latest signalTime (0.3576ms)
  ✔ logIndexStbtJournalEntries uses optionType PE (structural contract test) (22.1773ms)
✔ selectTradableIndexStbtPicks (29.7997ms)
▶ index-btst-slice-metrics
  ✔ classifyVixBand uses production thresholds (1.2189ms)
  ✔ parseIndexBtstTradeContext reads nested context (0.4353ms)
  ✔ computeIndexBtstSliceMetrics groups by vix and regime (0.6813ms)
✔ index-btst-slice-metrics (4.1369ms)
▶ Index Scan Cache Key
  ✔ generates a unique cache key for a given date (1.13ms)
  ✔ generates a different key for a different date (0.3785ms)
✔ Index Scan Cache Key (3.6672ms)
[RegimeService] NIFTY 50 Regime for 2026-07-21: BEAR / HIGH (ATR%: 2.56%)
[RegimeService] NIFTY 50 Regime for 2026-07-25: BULL / HIGH (ATR%: 2.49%)
▶ IndexDiscoverService.discover
  ✔ scans exactly the fixed instrument list (NIFTY, BANKNIFTY, SENSEX) in both directions (LONG/SHORT) — no F&O universe loop (50.6935ms)
  ✔ returns IGNORE classification with null score in mock mode (no live VWAP/VIX) for both directions (5.5146ms)
  ✔ never throws on a weekend date — returns empty or safely skips non-trading days (4.3603ms)
  ✔ produces valid IST signalDate (YYYY-MM-DD) and stable discoveryStart signalTime (4.0772ms)
✔ IndexDiscoverService.discover (72.1005ms)
▶ IndexDiscoverService.getIndiaVixState
  ✔ returns vixCalm null in mock mode (score-safety INVALID path) (0.2816ms)
✔ IndexDiscoverService.getIndiaVixState (0.476ms)
▶ IndexDiscoverService.resolveIndexSessionCandles
  ✔ uses live session as today when hasLive (2.9748ms)
  ✔ uses prior completed session as yesterday when live daily history already includes today (2.3102ms)
  ✔ uses last completed bar as today after EOD when live unavailable (3.67ms)
  ✔ returns null mid-session without live feed (score-safety) (1.0821ms)
✔ IndexDiscoverService.resolveIndexSessionCandles (10.9006ms)
▶ IndexDiscoverService.resolvePreviousCompletedCandle
  ✔ returns n-2 when the latest daily candle is today (0.719ms)
  ✔ returns the latest candle when history has not rolled into today yet (0.4891ms)
✔ IndexDiscoverService.resolvePreviousCompletedCandle (1.413ms)
▶ IndexDiscoverService.mapIntraClassification
  ✔ maps scores onto INDEX_* using INTRA floors (75 / 60 / 40) (0.2993ms)
✔ IndexDiscoverService.mapIntraClassification (0.4482ms)
▶ IndexDiscoverService.discoverIntraday
  ✔ returns empty on weekend — does not fabricate INTRA rows (2.451ms)
  ✔ never throws on a weekday and only emits INDEX_* classifications (14.716ms)
✔ IndexDiscoverService.discoverIntraday (17.4563ms)
▶ filterIndexRowsForDisplay
  ✔ hides null-score BTST outside discovery window (1.8697ms)
  ✔ shows null-score BTST inside discovery window (0.286ms)
  ✔ always keeps INTRA rows (0.2488ms)
✔ filterIndexRowsForDisplay (7.9159ms)
▶ primaryIndexReason
  ✔ returns first non-empty reason (0.3558ms)
  ✔ returns null when missing (0.2087ms)
✔ primaryIndexReason (0.8171ms)
▶ IndexIntraRankingService
  ✔ awards LOWER_VALUE points (symmetric with HIGHER_VALUE) (1.4526ms)
  ✔ awards session-move points for aligned bearish move (0.3864ms)
  ✔ scores BREAKDOWN without volume dependency (0.2401ms)
  ✔ maps classification using INTRA floors (75 / 60 / 40) (0.247ms)
  ✔ caps score at 100 (0.2387ms)
✔ IndexIntraRankingService (4.5004ms)
▶ index-intraday.util
  ▶ parseIndexIntradayMetricsFromChart
    ✔ should return empty metrics for missing or invalid chart data (2.7889ms)
    ✔ should correctly calculate last15mHigh and last15mLow during the closing liquidity window (37.263ms)
    ✔ should fall back to unweighted average if volume is 0 (0.6092ms)
  ✔ parseIndexIntradayMetricsFromChart (42.15ms)
✔ index-intraday.util (42.9303ms)
▶ IndexRankingService.calculateScoreDetails — score safety
  ✔ returns null score when vwap is missing (1.3121ms)
  ✔ returns null score when last15mHigh is missing (0.3006ms)
  ✔ returns null score when vixCalm is null/undefined (0.2175ms)
  ✔ returns null score when confirmation candles are unavailable (0.195ms)
✔ IndexRankingService.calculateScoreDetails — score safety (3.6243ms)
▶ IndexRankingService.calculateScoreDetails — rules
  ✔ Rule 1: awards vixCalm (25) only when vixCalm is true (0.4764ms)
  ✔ Rule 2: awards cprNarrow (30) only when tomorrowCprNarrow is true (0.2598ms)
  ✔ Rule 3: awards higherValue (20) only when both tomorrow BC and TC exceed today (0.2567ms)
  ✔ Rule 4: awards vwap confirmation (20) only when close beats both TC and VWAP (0.414ms)
  ✔ Rule 5: awards liquidity (20) only when close > last15mHigh (0.4234ms)
  ✔ Rule 6: awards closeStrength (15) only when CLV > 0.70 (0.3393ms)
  ✔ sums all six rules to a max score of 130 (0.2712ms)
✔ IndexRankingService.calculateScoreDetails — rules (3.0775ms)
▶ IndexRankingService.getClassification
  ✔ maps null score to IGNORE (0.284ms)
  ✔ maps floors 100 / 85 / 70 to INDEX_STRONG / INDEX_READY / INDEX_WATCH (0.1503ms)
  ✔ uses index-specific classification strings that cannot collide with stock filters (0.2036ms)
✔ IndexRankingService.getClassification (0.8494ms)
▶ INDEX_SCORE / India VIX constants
  ✔ INDEX_SCORE mirrors ADVANCED_SCORE floors (STRONG/READY/WATCH/MAX) (0.2584ms)
  ✔ exposes India VIX calm/elevated thresholds (0.1871ms)
✔ INDEX_SCORE / India VIX constants (0.5907ms)
▶ Index BTST red-session guard
  ✔ blocks when session is down at least INDEX_BTST_RED_SESSION_BLOCK_PCT (0.318ms)
  ✔ allows flat or green sessions above threshold (0.1251ms)
✔ Index BTST red-session guard (0.5873ms)
▶ IndexRegimeService.computeAdjustment
  ✔ boosts LONG in bullish low-vol regime (2.1158ms)
  ✔ penalizes LONG in bearish high-vol regime (0.2935ms)
  ✔ boosts SHORT in bearish regime (0.2161ms)
  ✔ returns neutral adjustment in choppy low-vol regime (0.1806ms)
✔ IndexRegimeService.computeAdjustment (4.5331ms)
▶ IndexRegimeService.applyConfidence
  ✔ clamps confidence to max score (0.3022ms)
  ✔ returns null when base score is null (0.1576ms)
  ✔ floors confidence at zero (0.2413ms)
✔ IndexRegimeService.applyConfidence (0.9959ms)
▶ index-signal.util
  ✔ maps LONG READY to CALL_BUY (1.5352ms)
  ✔ maps SHORT READY to PUT_BUY (0.2468ms)
  ✔ maps IGNORE to NO_TRADE (0.2698ms)
  ✔ computes risk/reward string (0.2552ms)
  ✔ builds BTST reasons from breakdown (0.5427ms)
  ✔ builds INTRA reasons from signal tags (0.3956ms)
  ✔ blocks reasons when VIX elevated (0.2031ms)
✔ index-signal.util (5.6412ms)
▶ IndexRankingService (STBT SHORT)
  ▶ calculateShortScoreDetails
    ✔ returns null if any safety gate fails (vwap, last15mLow, vixElevated, hasConfirmationCandles) (1.6907ms)
    ✔ Rule 1: VIX Elevated (25 pts) (0.3464ms)
    ✔ Rule 2: Lower Value (20 pts) - tomorrow BC and TC both below today BC and TC (0.1885ms)
    ✔ Rule 3: CPR Narrow (30 pts) (0.1912ms)
    ✔ Rule 4: Bearish Confirmation (20 pts) - close < todayBc AND close < vwap (0.1895ms)
    ✔ Rule 5: EOD Weakness (20 pts) - close < last15mLow (0.1596ms)
    ✔ Rule 6: Closing Weakness (15 pts) - close in bottom 30% of day range (0.2497ms)
    ✔ accumulates all points perfectly (Max 130) (1.2971ms)
  ✔ calculateShortScoreDetails (6.1248ms)
  ▶ getShortClassification
    ✔ classifies thresholds correctly (100/85/70) (0.3805ms)
  ✔ getShortClassification (0.6327ms)
✔ IndexRankingService (STBT SHORT) (7.6497ms)
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
  ﹣ persists overnightSignalId / model prices from the selected id, not the newest row (1.5178ms) # Postgres unreachable
✔ TradeJournal logSignal overnightSignalId linkage (P1-2) (4183.9937ms)
[EligibilityGate] LIQ rejected: avgVolume 99999 < 100000
[EligibilityGate] LIQ rejected: volumeRatio 1.40 < 1.5 (VDU hard gate)
▶ EntryManagerService hard liquidity gate (Advanced discover path)
  ✔ rejects avgVolume below 100k (hard exclude, not LOW_QUALITY flag) (2.8863ms)
  ✔ rejects volume-ratio below 1.5 VDU hard gate (0.5307ms)
  ✔ allows stocks that clear avgVolume 100k and volume-ratio 1.5 (VDU) (0.2225ms)
✔ EntryManagerService hard liquidity gate (Advanced discover path) (5.4336ms)
▶ cron-run-claim
  ✔ allows first claim and blocks duplicate until complete (3.2419ms)
  ✔ release allows retry after failure (0.5098ms)
✔ cron-run-claim (11.6041ms)
▶ resolveJournalSnapshotSlot
  ✔ maps IST windows to snapshot slots on a trading day (1.665ms)
✔ resolveJournalSnapshotSlot (1.8727ms)
▶ shouldCompleteClaimedJob
  ✔ releases retryable soft failures (0.6172ms)
  ✔ completes successful or non-retryable results (0.2438ms)
✔ shouldCompleteClaimedJob (1.1908ms)
▶ Market Hours Utilities
  ▶ getISTDateString
    ✔ returns the correct IST date during UTC midnight rollover (pre-IST midnight) (35.696ms)
    ✔ returns the correct IST date during the 5.5 hour mismatch window (0.6232ms)
    ✔ returns the correct IST date when UTC and IST days match (0.506ms)
    ✔ matches getISTTime().dateString behavior (1.8655ms)
  ✔ getISTDateString (40.1521ms)
  ▶ isTodayCandleClosed (Live Market Scenario Regression)
    ✔ returns false during live market hours (e.g., 2:30 PM IST) (0.8885ms)
    ✔ returns false right before market close (0.6469ms)
    ✔ returns true after market close (e.g., 4:00 PM IST) (1.1065ms)
  ✔ isTodayCandleClosed (Live Market Scenario Regression) (4.7389ms)
  ▶ getCompletedHistory
    ✔ keeps history unchanged when asOfDate replay is used (1.6092ms)
    ✔ with asOfDate equal to last candle date, returns full history even if wall-clock session is open (1.7629ms)
  ✔ getCompletedHistory (4.2012ms)
  ▶ Cash session (site-wide PRESESSION + LIVE)
    ✔ exposes 09:00 pre-open and 09:15–15:30 live labels (0.4968ms)
    ✔ maps CLOSED / PRESESSION / LIVE phases (3.4313ms)
    ✔ treats weekends as CLOSED (0.8531ms)
  ✔ Cash session (site-wide PRESESSION + LIVE) (5.06ms)
  ▶ BTST window helpers (canonical BTST_WINDOWS)
    ✔ maps discovery / confirm / freeze / journal phases (5.5696ms)
    ✔ identifies the 15:15–15:30 EOD liquidity window (0.2743ms)
  ✔ BTST window helpers (canonical BTST_WINDOWS) (6.0384ms)
✔ Market Hours Utilities (62.2967ms)
▶ Market Profile — CONTINUOUS identity (default env)
  ✔ active profile resolves to CONTINUOUS clocks matching prior production (2.4575ms)
  ✔ BTST_WINDOW_MINUTES / BTST_CLOCK match CONTINUOUS fixtures (0.2902ms)
  ✔ isInClosingLiquidityWindow is [15:15, 15:30) under CONTINUOUS (0.2077ms)
  ✔ supportsClosingAuction is always false under CONTINUOUS (0.26ms)
  ✔ getSessionState never emits CAS/FNO_ONLY under CONTINUOUS (38.0787ms)
  ✔ shouldFreezeBreakouts is false under CONTINUOUS even for F&O after 15:15 (0.948ms)
✔ Market Profile — CONTINUOUS identity (default env) (44.212ms)
▶ Market Profile — CLOSING_AUCTION simulation
  ✔ SEBI-locked clocks on CLOSING_AUCTION profile (0.6086ms)
  ✔ supportsClosingAuction: F&O true, non-F&O false under CLOSING_AUCTION (0.272ms)
  ✔ MarketSessionContext carries resolver fields (0.2931ms)
  ✔ getSessionState F&O: LIVE→CAS at 15:15, CAS until 15:35, FNO_ONLY until 15:40 (1.8186ms)
  ✔ getSessionState non-F&O: still LIVE at 15:20, no CAS (0.9715ms)
  ✔ shouldFreezeBreakouts after 15:15 for F&O only (0.7736ms)
  ✔ Rule5 window bounds on CLOSING_AUCTION profile object (0.2893ms)
✔ Market Profile — CLOSING_AUCTION simulation (5.6677ms)
▶ Market Profile — unknown env falls back to CONTINUOUS
  ✔ resolveMarketProfile ignores garbage (0.2291ms)
✔ Market Profile — unknown env falls back to CONTINUOUS (0.5003ms)
▶ Market Profile — default helpers still continuous
  ✔ isMarketOpen / discovery helpers use CONTINUOUS module clocks (1.3792ms)
✔ Market Profile — default helpers still continuous (1.5375ms)
[MarketService] 200 SMA caching failed for FAIL: Yahoo Finance HTTP 404
[LiveFeed] Fyers Primary OK for NSE:LTM-EQ (ltp=215.5, candles=110, hist=22)
[LiveFeed] Fyers Data API permission denied (Additional permission required). Fix: myapi.fyers.in → edit app → enable Quotes & Market Data + Historical Data (Fyers often requires all permission checkboxes) → Save → Reconnect Fyers in Settings. Skipping Fyers for 10m; Yahoo Fallback remains active.
[LiveFeed] Fyers quotes failed for NSE:LTM-EQ: HTTP 403 code=403 msg=Additional permission required
[LiveFeed] Yahoo Fallback OK for LTM.NS
[LiveFeed] Fyers Primary skipped for LTM: not connected
[LiveFeed] Yahoo Fallback failed for LTM.NS: Yahoo Finance HTTP 404 for LTM.NS
[LiveFeed] Yahoo Fallback OK for TEST.NS
▶ Market Service - 200 SMA Plumbing
  ✔ SMA Calculation Mathematical Correctness (>= 200 guard) (43.6928ms)
  ✔ cache200SMA() Per-Symbol Isolation on 404 (2.571ms)
  ✔ getStockData() Cache Miss Fallback (1.409ms)
  ✔ getStockData() Fyers Primary succeeds with quotes LTP + history (58.5762ms)
  ✔ probeFyersDataApi() reports permission denial clearly (1.1957ms)
  ✔ getStockData() uses Yahoo Fallback when Fyers Primary fails (7.2705ms)
  ✔ getStockData() skips Fyers Primary when not Connected (0.982ms)
  ✔ getStockData() silently skips null-ohlc placeholder candles (2.6463ms)
✔ Market Service - 200 SMA Plumbing (121.895ms)
▶ Middleware Authentication & Gating
  ✔ redirects anonymous visits to /scanner to /unlock (35.4706ms)
  ✔ allows anonymous visits to public pages (2.7708ms)
  ✔ allows anonymous access to PWA static assets (1.7248ms)
  ✔ does not Set-Cookie app_access_token on anonymous page visits (0.5529ms)
  ✔ blocks unauthenticated API requests with 401 (3.0477ms)
  ✔ allows API requests with valid authorization header (0.9792ms)
  ✔ allows API requests with valid cookie (0.8295ms)
  ✔ exempts public and cron API routes from token checks (1.6227ms)
  ✔ requires auth for Fyers login (prevents token overwrite) (0.9235ms)
  ✔ does not treat /api/*.png spoof as a public static asset (0.9315ms)
✔ Middleware Authentication & Gating (51.3184ms)
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
✔ OptionChainService fetchOptionQuote regex supports & (1.6096ms)
✔ OptionChainService rollover logic and cache partitioning (41.4029ms)
✔ OptionChainService applies rollover when direct fetch falls back to proxy (8.1652ms)
✔ OptionChainService resolveRolledOverChain parses targetExpiryStr (monthly vs weekly) (4.4224ms)
✔ OptionChainService TTL uses F&O session end in CLOSING_AUCTION (1.2411ms)
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
✔ OptionSuggestionService extracts expiry from NSE and BSE Fyers option symbols (3.792ms)
▶ Option Suggestion Service — Honest Error Paths (no fabricated data)
  ✔ TOKEN_EXPIRED: missing token returns error, no optionsChain, no fake data (1.1869ms)
  ✔ EMPTY_CHAIN: Fyers returns no data — explicit error, no fake fallback (0.3131ms)
  ✔ FETCH_FAILED: propagates error honestly, no fabricated data (0.275ms)
  ✔ Math.random never called during any error path (0.3628ms)
✔ Option Suggestion Service — Honest Error Paths (no fabricated data) (3.1606ms)
▶ Option Suggestion — OI Score scales relative to max OI among candidates
  ✔ highest OI candidate gets oiScore=30 (6.8582ms)
✔ Option Suggestion — OI Score scales relative to max OI among candidates (7.2723ms)
✔ Option Suggestion — SENSEX formatted name expands BSE weekly expiry token (1.315ms)
▶ Option Suggestion — PCR Context Score
  ✔ CE trade + PCR > 1.2 → pcrContextScore = 20 (1.1219ms)
  ✔ PE trade + PCR < 0.8 → pcrContextScore = 20 (0.9542ms)
  ✔ CE trade + PCR < 0.8 → pcrContextScore = 0 (contradicts direction) (0.8862ms)
✔ Option Suggestion — PCR Context Score (3.9604ms)
▶ Option Suggestion — Spread Score tiers
  ✔ <=1% spread -> 20 pts (0.7806ms)
  ✔ <=2% spread -> 15 pts (0.4132ms)
  ✔ <=4% spread -> 10 pts (0.4237ms)
  ✔ <=8% spread -> 5 pts (0.4421ms)
  ✔ >8% spread -> 0 pts (0.3647ms)
✔ Option Suggestion — Spread Score tiers (3.2392ms)
▶ Option Suggestion — ITM Depth Score: 1st ITM preferred
  ✔ 1st ITM selected when all other scores equal → itmDepthScore=10 (0.9776ms)
✔ Option Suggestion — ITM Depth Score: 1st ITM preferred (1.488ms)
▶ Option Suggestion — Expensive high-scoring strike wins (no budget gate)
  ✔ Rs300 ltp (very expensive) but perfect OI/vol/spread beats Rs5 ltp cheap strike (1.3989ms)
✔ Option Suggestion — Expensive high-scoring strike wins (no budget gate) (1.9392ms)
▶ Option Suggestion — zero OI and zero volume returns NO_VIABLE_STRIKES
  ✔ CE: all candidates have 0 OI and 0 volume → NO_VIABLE_STRIKES (1.4626ms)
  ✔ PE: all candidates have 0 OI and 0 volume → NO_VIABLE_STRIKES (0.7083ms)
✔ Option Suggestion — zero OI and zero volume returns NO_VIABLE_STRIKES (2.731ms)
▶ STOCK_OVERNIGHT_INSTRUMENT_WHERE
  ✔ excludes INDEX instrumentType so stock overnight queries stay isolated (2.0898ms)
✔ STOCK_OVERNIGHT_INSTRUMENT_WHERE (5.6292ms)
▶ INDEX_OVERNIGHT_INSTRUMENT_WHERE
  ✔ selects INDEX instrumentType only (0.3061ms)
✔ INDEX_OVERNIGHT_INSTRUMENT_WHERE (0.541ms)
▶ OvernightRiskService - Index Correlation (Beta Proxy)
  ✔ synthesizes beta_proxy correctly for known-correlated series (4.597ms)
  ✔ uses extended stock-history fetch for beta when MarketService history is truncated to 22 days (39.1665ms)
  ✔ zero-variance Nifty window returns null for beta_proxy without throwing (3.5497ms)
  ✔ handles misaligned date gaps correctly by dropping them (1.4619ms)
  ✔ skips zero-price bases instead of poisoning beta with fake 0% returns (1.1821ms)
  ▶ Phase 2B Index Correlation Risk Weighting & Regression Checks
    ✔ correlation null (short history <60d) defaults to neutral beta=1.0 and preserves exact LOW/MEDIUM/HIGH riskLevel math (3.6519ms)
    ✔ high beta (>1.0) shifts riskFactor upward across threshold (MEDIUM -> HIGH) (1.2463ms)
    ✔ low beta (<1.0) dampens riskFactor downward across threshold (MEDIUM -> LOW) (1.536ms)
  ✔ Phase 2B Index Correlation Risk Weighting & Regression Checks (6.9029ms)
✔ OvernightRiskService - Index Correlation (Beta Proxy) (59.3665ms)
▶ overnight-ui-adapter (Phase H)
  ✔ maps OvernightSignal into BTST UI DTO with advanced metadata (1.9662ms)
  ✔ selects TRADEABLE READY+ picks and respects STBT suppression (4.382ms)
  ✔ compareLatestScanRows prefers newer signalTime then score (22.3065ms)
  ✔ dedupes by symbol so rescans cannot fill both top-N slots (1.753ms)
✔ overnight-ui-adapter (Phase H) (34.7079ms)
▶ sanitizePagination
  ✔ accepts valid numeric strings (5.4484ms)
  ✔ falls back to defaults on missing values (0.3487ms)
  ✔ rejects NaN / garbage input (0.2247ms)
  ✔ rejects zero and negative page (would produce negative Prisma skip) (0.2853ms)
  ✔ rejects zero / negative limit (0.2016ms)
  ✔ caps abusive page sizes at MAX_PAGE_LIMIT (0.1811ms)
  ✔ floors non-integer values (0.1742ms)
✔ sanitizePagination (9.4615ms)
▶ computeOptionPnl
  ✔ computes a winning long-premium trade (1.1986ms)
  ✔ computes a losing trade with correct sign (0.3343ms)
  ✔ rounds to 2 decimal places (no float noise) (0.2094ms)
  ✔ never divides by zero — entryCmp 0 yields 0% not Infinity (0.4928ms)
  ✔ handles negative entryCmp defensively without NaN (0.2293ms)
  ✔ breakeven is zero (0.229ms)
✔ computeOptionPnl (5.0722ms)
▶ Redis Cache Client Tests
  ✔ Initial state or ready state check (1.4018ms)
✔ Redis Cache Client Tests (2.7421ms)
[RegimeService] NIFTY 50 Regime for 2026-07-20: BULL / HIGH (ATR%: 3.33%)
▶ RegimeService - EMA Edge Case Fix
  ✔ length=19 returns DEFAULT regime (CHOPPY/LOW/50) (40.7046ms)
  ✔ length=20 returns DEFAULT regime instead of spurious BULL (1.1727ms)
  ✔ length=21 computes a genuine trend (not default, not spurious) (2.5872ms)
✔ RegimeService - EMA Edge Case Fix (47.7012ms)
✔ scanner mixed universes stay live past 15:15 in CLOSING_AUCTION (58.1818ms)
✔ NIFTY_FNO universe remains closed after 15:15 in CLOSING_AUCTION (43.6458ms)
✔ per-symbol freeze only applies to F&O names in CLOSING_AUCTION (0.7279ms)
▶ Scanner Service Signals Evaluation
  ✔ evaluates NORMAL and BULLISH signals correctly (41.467ms)
  ✔ evaluates BREAKDOWN signal correctly on high-volume move below bc (3.5468ms)
  ✔ Scanner Dynamic Shift Bias (P0) — live market partial candle does not override yesterday CPR (2.2317ms)
  ✔ detects GAPS and VIRGIN CPR correctly (0.8012ms)
✔ Scanner Service Signals Evaluation (50.2492ms)
▶ Scanner Service V2 Entry, Target, Stop Loss, and Risk-Reward (RR)
  ✔ calculates correct trade setups for BULLISH bias (2.8224ms)
  ✔ calculates correct trade setups for BEARISH bias (2.0444ms)
✔ Scanner Service V2 Entry, Target, Stop Loss, and Risk-Reward (RR) (5.5859ms)
▶ Ranking Service V2 Scoring & Classifications
  ✔ assigns correct classification labels based on score ranges (0.7596ms)
  ✔ calculates correct score sum and caps at 100 (0.5811ms)
✔ Ranking Service V2 Scoring & Classifications (7.2406ms)
▶ KGS CPR Theory Signal and Scoring Tests
  ✔ HP_ASC_CPR fires when 3 consecutive rising TC days and PDL is respected (2.9617ms)
  ✔ HP_ASC_CPR is invalidated when close breaks below PDL (0.8943ms)
  ✔ HP_DESC_CPR fires when 3 consecutive falling TC days and PDH is respected (1.2961ms)
  ✔ HP_DESC_CPR is invalidated when close breaks above PDH (1.2855ms)
  ✔ HP_ASC_REVERSAL fires when valid ASC setup yesterday is broken below PDL today (0.8128ms)
  ✔ HP_ASC_REVERSAL does NOT fire if yesterday was only a 2-leg match (0.9226ms)
  ✔ HP_DESC_REVERSAL fires when valid DESC setup yesterday is broken above PDH today (0.8775ms)
  ✔ HP_INSIDE_CPR fires when today fully inside yesterday (1.1345ms)
  ✔ HP_OUTSIDE_CPR fires when today fully contains yesterday (0.9953ms)
  ✔ HP_RTP fires when SMA20/SMA50 slopes match sign (0.7224ms)
  ✔ HP_HP_RTP (a) valid crossing matching RTP direction fires (0.9351ms)
  ✔ HP_HP_RTP (b) static position above/below 200 without crossing does not fire (0.5523ms)
  ✔ HP_HP_RTP (c) crossing opposite RTP slope does not fire (0.455ms)
  ✔ HP_HP_RTP (d) missing sma200 or absent RTP correctly blocks it (0.7785ms)
  ✔ HP_HP_RTP (e) fires correctly on live in-progress crossing (0.4125ms)
  ✔ HP_DIRECT_UP fires on green candle closing decisively above R1 (0.3923ms)
  ✔ HP_DIRECT_DOWN fires on red candle closing decisively below S1 (0.4947ms)
  ✔ HP_REVERSAL_DOWN fires on red candle rejecting R1 after tagging it (0.3562ms)
  ✔ HP_REVERSAL_UP fires on green candle rejecting S1 after tagging it (0.3307ms)
  ✔ Open Tricks signals do not fire when R1/S1 are not touched (0.3563ms)
  ✔ RankingService does NOT score HP_DIRECT_UP + BULLISH (zero-weight until backtested) (0.2775ms)
  ✔ HP_CAM_BULL_BIAS fires when Cam S3 is inside CPR zone (0.422ms)
  ✔ KGS_CAM_BEAR_BIAS fires when Cam R3 is inside CPR zone (0.4307ms)
  ✔ Existing INSIDE_VALUE logic remains functional and unaffected (0.2828ms)
✔ KGS CPR Theory Signal and Scoring Tests (24.4088ms)
▶ SMA Slope — non-overlapping windows produce meaningful slope
  ✔ rising price series produces sma20Slope > 10 with 40 closes (0.5388ms)
  ✔ falling price series produces negative sma20Slope (0.2228ms)
  ✔ insufficient history (< 40 bars) returns sma20Slope = 0 (0.1341ms)
  ✔ flat price series produces sma20Slope = 0 (0.1316ms)
✔ SMA Slope — non-overlapping windows produce meaningful slope (1.708ms)
▶ ScannerService/SignalService — asOfDate Inject and Forwarding
  ✔ scanStock(stock, "2026-06-03") forwards asOfDate, triggers SignalService-only GAP_UP signal (0.7032ms)
  ✔ scanStock(stock, "2026-06-02") does not trigger GAP_UP (1.4882ms)
  ✔ scanStock(stock) with no asOfDate defaults to system IST date (no GAP_UP) (4.7592ms)
✔ ScannerService/SignalService — asOfDate Inject and Forwarding (7.6817ms)
✔ ScannerService degenerate single-candle history (1.1353ms)
▶ Category F — EMA 9/21 + RSI Confluence Scoring
  ✔ EMA_CROSS_BEAR + RSI_BEARISH + BREAKDOWN awards +15 in Category F (0.2218ms)
  ✔ EMA_CROSS_BEAR + RSI_OVERBOUGHT + BREAKDOWN awards +15 in Category F (0.1592ms)
  ✔ EMA_CROSS_BEAR + RSI_OVERSOLD + BREAKDOWN does NOT award Category F (late-short trap) (0.2351ms)
  ✔ EMA_CROSS_BULL + RSI_STRONG + BREAKOUT awards +15 in Category F (0.254ms)
  ✔ hasBullishRSI and hasBearishRSI are mutually exclusive (0.1585ms)
✔ Category F — EMA 9/21 + RSI Confluence Scoring (1.7929ms)
▶ SectorRegimeService.applySectorDivergence
  ✔ tags BULLISH stock when sector is net-bearish with enough sample (1.592ms)
  ✔ does NOT tag on a bull/bear tie (strict > required) (0.3625ms)
  ✔ does NOT tag when sector sample is below minimum (3) (0.2881ms)
  ✔ ignores fallback buckets Other / Unknown / empty sector (0.3123ms)
  ✔ neutral stocks do not count toward the sector sample (0.4122ms)
  ✔ sectors are judged independently (0.4329ms)
✔ SectorRegimeService.applySectorDivergence (6.5092ms)
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=3.96% >= 3.5%
▶ stock-intraday.util
  ✔ toYahooNseSymbol appends .NS for plain symbols (2.444ms)
  ✔ parseStockIntradayMetricsFromChart computes VWAP and closing extremes (36.4677ms)
  ✔ parseStockIntradayMetricsFromChart excludes the latest forming closing-window bar (1.2038ms)
✔ stock-intraday.util (41.9883ms)
▶ stock-btst-backtest.helper
  ✔ classifyVduBand matches production thresholds (1.0739ms)
  ✔ classifyScoreBand uses ADVANCED_SCORE floors (0.4823ms)
  ✔ returns not tradable when intraday chart missing (1.344ms)
  ✔ suppresses LONG in BEAR regime (0.3334ms)
  ✔ requires READY+ when full intraday data present (7.806ms)
✔ stock-btst-backtest.helper (11.9483ms)
▶ stock-btst-slice-metrics
  ✔ parseStockBtstTradeContext reads nested context (5.1554ms)
  ✔ computeStockBtstSliceMetrics groups by regime and VDU (1.109ms)
✔ stock-btst-slice-metrics (6.678ms)
▶ getStockBtstCompare
  ✔ excludes breakeven live and backtest trades from win-rate denominators (49.882ms)
  ✔ returns null win rates when closed trades are all breakeven (11.6298ms)
✔ getStockBtstCompare (63.2727ms)
▶ resolveOvernightConflict — null scores ineligible
  ✔ picks higher non-null side and marks NEUTRAL_CONFLICT when diff < 10 (1.5202ms)
  ✔ does not mark conflict when diff >= 10 (0.3122ms)
  ✔ ignores LONG when score is null — SHORT wins (0.4228ms)
  ✔ ignores SHORT when score is null — LONG wins (0.2165ms)
  ✔ returns null direction when both scores are null (0.1883ms)
  ✔ does not coerce null to 0 (null LONG vs SHORT 5 must not create conflict) (0.1924ms)
✔ resolveOvernightConflict — null scores ineligible (4.7378ms)
▶ VDU Option B — score at SPIKE_RATIO (2.0×), gate remains 1.5×
  ✔ does not award VDU at eligibility floor (1.5×) (5.5719ms)
  ✔ awards VDU at SPIKE_RATIO (2.0×) (1.5202ms)
  ✔ STBT mirrors the same VDU scoring threshold (1.1486ms)
✔ VDU Option B — score at SPIKE_RATIO (2.0×), gate remains 1.5× (8.8377ms)
[Telegram] TELEGRAM_GROUP_CHAT_ID not set; falling back to personal chat for BTST alert
[Telegram] Failed to send message: telegram error body
▶ sendBtstAlert group-only delivery
  ✔ sends only to the group chat, never to the personal DM (54.528ms)
  ✔ falls back to the personal chat only when no group is configured (18.6655ms)
  ✔ group send failure returns sent=false so claims roll back and retry (1.5164ms)
  ✔ "no qualifying setups" status message also goes to the group (1.4183ms)
✔ sendBtstAlert group-only delivery (78.3996ms)
▶ Quantitative Trading Logic Fixes
  ✔ Short return calculation math in computeMetricsFromTrades (3.5598ms)
  ✔ calculateCPR classification and trend consistency with ATR% (0.6605ms)
✔ Quantitative Trading Logic Fixes (5.8666ms)
▶ Trend Confluence Shadow Scoring
  ✔ BTST - Fresh bullish cross + RSI 55 -> 15 pts (2.2455ms)
  ✔ BTST - Bullish alignment only + RSI 60 -> 5 pts (0.3035ms)
  ✔ BTST - Bullish alignment + RSI 75 (overbought trap) -> -10 pts (0.2323ms)
  ✔ BTST - Missing RSI or EMA data -> 0 pts, no throw (0.1808ms)
  ✔ STBT - Fresh bearish cross + RSI 45 -> 15 pts (0.3952ms)
  ✔ STBT - Bearish alignment only + RSI 40 -> 5 pts (0.345ms)
  ✔ STBT - Bearish alignment + RSI 25 (oversold trap) -> -10 pts (0.295ms)
  ✔ STBT - Missing data -> 0 pts (0.2595ms)
  ✔ Regression check on base score output identity (0.6056ms)
✔ Trend Confluence Shadow Scoring (7.6117ms)
▶ VPA math helpers
  ✔ computeClv returns +1 at close on high (0.8041ms)
  ✔ computeClv returns null on zero range (0.1426ms)
  ✔ computeRvol uses avgVolume denominator safely (0.1845ms)
✔ VPA math helpers (2.1125ms)
▶ scoreVpaBreakoutConfirm
  ✔ returns null when there is no breakout attempt (inside CPR) (0.8937ms)
  ✔ confirms a volume+CLV-backed breakout above CPR (0.1482ms)
  ✔ penalizes a weak breakout attempt above CPR (0.1415ms)
  ✔ confirms a volume+CLV-backed breakdown below CPR (0.1351ms)
  ✔ returns null when SHORT has no breakdown attempt (0.1308ms)
✔ scoreVpaBreakoutConfirm (1.7563ms)
▶ VpaConfirmationService.analyze
  ✔ rewards strong RVOL + close near high on LONG (1.4189ms)
  ✔ penalizes weak RVOL on LONG without weak-breakout mislabel (0.3593ms)
  ✔ detects buying climax and recommends reject (0.2433ms)
  ✔ detects absorption (high volume, tiny range) (0.2282ms)
  ✔ detects no demand on narrow up-day (0.2557ms)
  ✔ returns disabled result when VPA_ENABLED=false (0.2199ms)
✔ VpaConfirmationService.analyze (3.0173ms)
▶ BtstRankingService VPA shadow integration
  ✔ does not change the authoritative 130pt score (0.6202ms)
  ✔ returns null score unchanged when inputs invalid (0.1277ms)
✔ BtstRankingService VPA shadow integration (0.8769ms)
▶ VPA shadow master kill-switch
  ✔ blocks live confidence/gates while shadow mode is on (default fail-safe) (0.2793ms)
  ✔ allows live confidence/gates only when shadow is off AND live flags are on (0.1496ms)
  ✔ keeps live paths off when shadow is off but live flags remain false (0.2268ms)
✔ VPA shadow master kill-switch (0.7746ms)
▶ VpaConfirmationService.applyConfidenceDelta
  ✔ leaves confidence unchanged when adjustment is zero (0.1369ms)
  ✔ does not apply non-zero delta while shadow mode blocks live confidence (0.0575ms)
✔ VpaConfirmationService.applyConfidenceDelta (0.2627ms)
▶ VpaConfirmationResult.live flag
  ✔ returns live: false under default shadow mode even if live flags are on (0.3806ms)
  ✔ returns live: true when shadow is off AND confidence live is on (0.5864ms)
  ✔ returns live: true when shadow is off AND gates live is on (0.2477ms)
  ✔ returns live: false when shadow is off but both live flags remain false (0.1946ms)
  ✔ returns live: false when VPA is disabled (0.4585ms)
✔ VpaConfirmationResult.live flag (2.0966ms)
▶ scoreVpaClv
  ✔ neutral close (exactly mid-range) does not flag BEARISH for LONG or BULLISH_CLOSE for SHORT (0.304ms)
  ✔ close in the bottom ~15% of range (e.g. 92 out of 90-110) flags BEARISH for LONG (0.1243ms)
  ✔ close in the top ~15% of range (e.g. 108 out of 90-110) flags BULLISH for LONG (0.1343ms)
✔ scoreVpaClv (0.718ms)
▶ computeWinRate
  ✔ excludes breakeven trades from the denominator (1.5448ms)
  ✔ returns zero winRate without NaN when there are no decisive trades (0.4906ms)
✔ computeWinRate (4.0412ms)
▶ alignedYahooSeriesLength
  ✔ returns 0 when required series are missing (1.2193ms)
  ✔ truncates to the shortest REQUIRED series only (non-required like volume do not shrink length) (0.1879ms)
  ✔ returns 0 when a required series is shorter than any non-required series (0.1147ms)
✔ alignedYahooSeriesLength (2.9116ms)
▶ intraday parsers handle misaligned Yahoo payloads
  ✔ index parser returns empty when a required series is missing/empty (0.3729ms)
  ✔ stock parser truncates to aligned prefix instead of reading past series end (23.8044ms)
✔ intraday parsers handle misaligned Yahoo payloads (24.4366ms)
ℹ tests 511
ℹ suites 85
ℹ pass 509
ℹ fail 1
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 13143.4418

✖ failing tests:

test at src\tests\unit\btst.test.ts:2:10020
✖ no_vdu_weighted strategyVariant honors env.CPR_WEIGHT override (7.1947ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  35 !== 25
  
      at TestContext.<anonymous> (C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\tests\unit\btst.test.ts:337:14)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Suite.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 35,
    expected: 25,
    operator: 'strictEqual',
    diff: 'simple'
  }
TEST_EXIT_CODE=1
```

### 8.4 Post-revert greps (against fingerprinted files)

Command: `rg -n "process\.env\." src`

```text
src\config\market-profile.ts:122:  cachedActiveProfile = resolveMarketProfile(process.env.MARKET_PROFILE);
src\config\env.ts:143:const isProductionBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
src\instrumentation.ts:3:  if (process.env.NEXT_RUNTIME === 'nodejs') {
src\instrumentation.ts:10:    const appVersion = env.APP_VERSION || process.env.npm_package_version || 'unknown';
src\services\option-suggestion.service.ts:318:    if (process.env.NODE_ENV !== 'test') {
src\lib\api-error.ts:9:  if (process.env.NODE_ENV === 'development' && err instanceof Error && err.message) {
src\tests\unit\api-hardening.test.ts:66:    const prev = process.env.NODE_ENV;
src\tests\unit\env-prod-auth.test.ts:15:      process.env.NODE_ENV = 'production';
src\tests\unit\env-prod-auth.test.ts:16:      delete process.env.APP_ACCESS_TOKEN;
src\tests\unit\env-prod-auth.test.ts:17:      delete process.env.NEXT_PHASE;
src\tests\unit\env-prod-auth.test.ts:50:      process.env.NODE_ENV = 'production';
src\tests\unit\env-prod-auth.test.ts:51:      process.env.NEXT_PHASE = 'phase-production-build';
src\tests\unit\env-prod-auth.test.ts:52:      delete process.env.APP_ACCESS_TOKEN;
src\components\pwa\PwaRegistration.tsx:18:    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
src\tests\unit\market-profile.test.ts:42:    const p = resolveMarketProfile(process.env.MARKET_PROFILE);
src\tests\unit\vpa.test.ts:129:  const prevVpaEnabled = process.env.VPA_ENABLED;
src\tests\unit\vpa.test.ts:132:    process.env.VPA_ENABLED = 'true';
src\tests\unit\vpa.test.ts:136:    if (prevVpaEnabled === undefined) delete process.env.VPA_ENABLED;
src\tests\unit\vpa.test.ts:137:    else process.env.VPA_ENABLED = prevVpaEnabled;
src\app\api\health\route.ts:37:  const appVersion = env.APP_VERSION || process.env.npm_package_version || 'v1.0.0-rc.1';
```

Command: `rg -n "CPR_QUALITY_|cprQuality" src`

```text

RG_EXIT_CODE=1 (1 = no matches)
```

Command: `rg -n "CPR_NARROW_WEIGHT|env\.CPR_WEIGHT" src/services/backtest/btst.service.ts`

```text
145:      ? BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU
146:      : BTST_SCORING.CPR_NARROW_WEIGHT;
233:      ? BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU
234:      : BTST_SCORING.CPR_NARROW_WEIGHT;
420:      const cprWeight = env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : 35;
```

Command: `Get-FileHash -Algorithm MD5 src/services/backtest/btst.service.ts` (must match §7.5)

```text


Algorithm : MD5
Hash      : 01D25608CB22E869D136BFD41143179B
Path      : C:\Users\hiren\.gemini\antigravity\scratch\cpr-calculator-platform\src\services\backtest\btst.service.ts
```
