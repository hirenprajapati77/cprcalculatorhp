# Final Acceptance Gate Report

**Repo:** cprcalculatorhp / cpr-calculator-platform  
**Branch:** `fix/acceptance-revert-cpr-weight-breakdown`  
**Report pass:** 6 (report-accuracy only — no code changes)  
**Report generated:** 2026-08-06  
**Acceptance declaration:** **NOT self-declared.** Independent review required after zip upload.

---

## 0. Pass-6 auditor questions — answers

### Is the ops/"Present" finding correct?

**Yes — relative to the shipped zip.**

- `ops/ecosystem.config.cjs` and `ops/mem_watchdog.sh` **are** git-tracked on this branch (`git ls-files ops/` lists them; working-tree contents verified below).
- They are **absent from the review zip** because `.gitattributes` contains `ops/ export-ignore`, and `ops/package-repo.ps1` uses `git archive`, which honors export-ignore.
- Prior report section 1 marking them **"Present"** was therefore a **false claim about the shipping artifact**. Corrected below.

### Is truncated test output a valid finding?

**Yes.** Prior section 3.3 had only the footer. This pass embeds **full raw** `npm run test:unit` terminal output start-to-finish (and full raw output for the other two gate commands).

---

## 0.1 Blocking revert status (unchanged this pass — not re-touched)

Code files `btst.service.ts` / `btst.test.ts` were **not modified** in pass 6.

Verified still on disk:
- `const cprWeight = env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : 35;` present
- Anti-unification comment present above that line
- Test `no_vdu_weighted uses fixed CPR narrow weight in scoreBreakdown` **absent**

---

## 1. Prior submissions — re-verified (zip vs working tree)

Verification method:
1. Path exists in **git working tree**
2. Path exists in **shipped zip** OR explicitly marked export-ignored with reason

### 1.1 Memory / in-process purge (PR #89)

| Check | Working tree | In review zip? | Evidence |
|-------|--------------|----------------|----------|
| `src/services/in-process-cache.ts` exports `purgeInProcessCaches` | Yes | **Yes** (772 B) | In zip |
| `src/lib/process-memory.ts` exports `getProcessMemorySnapshot` | Yes | **Yes** (416 B) | In zip |
| `src/tests/unit/process-memory.test.ts` | Yes | **Yes** (408 B) | In zip |
| `auto-scan` calls `purgeInProcessCaches('auto-scan')` in `finally` | Yes | **Yes** | `auto-scan/route.ts` L5, L41 |
| `btst-alert` calls `purgeInProcessCaches('btst-alert')` in `finally` | Yes | **Yes** | `btst-alert/route.ts` L5, L33 |
| `ops/ecosystem.config.cjs` heap 384 / restart 450M | **Yes** (git-tracked) | **NO** | `.gitattributes` `ops/ export-ignore`. WT verified: `node_args: '--max-old-space-size=384'`, `max_memory_restart: '450M'`. SSH not used. |
| `ops/mem_watchdog.sh` flush@75 / restart@85 | **Yes** (git-tracked) | **NO** | Same export-ignore. WT verified: `> 75` → FLUSHDB; `> 85` → flush + fresh PM2 restart. SSH not used. |

**Correction:** prior "Present" for the two `ops/` files was invalid for the zip. Correct status: **git-tracked in repo; excluded from review zip by `ops/ export-ignore`.**

**AGENTS.md note:** AGENTS.md lists these as repo permanent safeguards (accurate for git). Zip packaging still hides `ops/`. No AGENTS.md edit this pass (report-only).

### 1.2 Telegram HTML escaping (PR #88)

| Check | Working tree | In review zip? | Evidence |
|-------|--------------|----------------|----------|
| `escapeTelegramHtml` exported | Yes | **Yes** (13109 B) | In zip |
| Dynamic fields escaped | Yes | **Yes** | In zip |
| Literal `score &lt;` in no-setups message | Yes | **Yes** | ~line 155 |
| `telegram-btst-group.test.ts` | Yes | **Yes** (5970 B) | In zip |

### 1.3 Redis-only cache trade-off + docs (PR #89/#91)

| Check | Working tree | In review zip? | Evidence |
|-------|--------------|----------------|----------|
| `INTENTIONAL TRADE-OFF` in `cache.service.ts` | Yes | **Yes** (7470 B) | In zip |
| `set()` Redis-connected = Redis only | Yes | **Yes** | In zip |
| `AGENTS.md` Cache trade-off section | Yes | **Yes** (7961 B) | In zip |
| `CHANGELOG.md` Unreleased Redis-only entry | Yes | **Yes** (13445 B) | In zip |

---

## 2. Fingerprints

### 2.1 Present in working tree AND in `git archive` zip

| File | MD5 | Bytes |
|------|-----|------:|
| `src/services/backtest/btst.service.ts` | `72943d8c08201cff081e81d41f39e445` | 21680 |
| `src/tests/unit/btst.test.ts` | `69fe7294f6c9afb10d68379edcc080ab` | 13431 |
| `src/services/in-process-cache.ts` | `11dd4cc2220a458162d22bad3be5eaa7` | 772 |
| `src/lib/process-memory.ts` | `f8eb307c702c368ac462fddb0ec36ca7` | 416 |
| `src/tests/unit/process-memory.test.ts` | `555b1840ae86c67fbda280cb057186c1` | 408 |
| `src/services/alert/telegram.service.ts` | `84ee1978de9c9e13ff77efc897900044` | 13109 |
| `src/tests/unit/telegram-btst-group.test.ts` | `31874f262a67336a102ef99f984e97a8` | 5970 |
| `src/services/cache.service.ts` | `9f4f1bfa80d0d742bceaf187d3a00a94` | 7470 |
| `AGENTS.md` | `c6ba4f3dc96d7cb001048c66e5c6e7fc` | 7961 |
| `CHANGELOG.md` | `6de80648762ebd1d0dcf6007ae96bed2` | 13445 |
| `src/app/api/cron/auto-scan/route.ts` | `cb9915bbc3e2a7bedef703372dcda6aa` | 1840 |
| `src/app/api/cron/btst-alert/route.ts` | `6f823494a29c2d53ce9c9f3682465bb2` | 1338 |
| `src/app/api/health/route.ts` | `181fc41fca97d9860e7d86dee13c5696` | 5734 |
| `src/services/overnight/nifty-history.service.ts` | `59380dc24e55d4ecfc9d6a125b8fe882` | 1390 |
| `src/services/overnight/regime.service.ts` | `90833b4db42adc5762e9910456b5c619` | 4309 |
| `src/services/overnight/index-discover.service.ts` | `5a04a0f0c6b86d7a283daaaf0e090c4a` | 33345 |

### 2.2 Git-tracked but **ABSENT from zip** (`ops/ export-ignore`)

| File | MD5 (working tree) | Bytes | In zip? |
|------|--------------------|------:|---------|
| `ops/ecosystem.config.cjs` | `1a7589734cb48a12c9f159135fe023ce` | 525 | **NO** — export-ignore |
| `ops/mem_watchdog.sh` | `472528ee1d960e6934d93e7e3461b3d6` | 1937 | **NO** — export-ignore |
| `ops/deploy.ps1` | `60477bbc935920c2e361f8fb8884c2f2` | 7157 | **NO** — export-ignore |
| `ops/deploy_extract.sh` | `1f5d3d48b9b38442be0752eeb800239e` | 5407 | **NO** — export-ignore |

---

## 3. Full verification gate — raw unedited output

Commands re-run 2026-08-06 on branch `fix/acceptance-revert-cpr-weight-breakdown`. Output below is pasted exactly as captured from the terminal (including npm stderr warnings). Encoding preserved as UTF-8.

### 3.1 `npx prisma generate`

```
node.exe : npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm 
help npmrc` for supported config options.
At line:1 char:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (npm warn Unknow...config options.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma

Γ£ö Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 167ms

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Want to turn off tips and other hints? https://pris.ly/tip-4-nohints
```

Exit code: **0**

### 3.2 `npx tsc --noEmit`

```
node.exe : npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm 
help npmrc` for supported config options.
At line:1 char:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (npm warn Unknow...config options.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
```

Exit code: **0**

### 3.3 `npm run test:unit` (complete raw output)

```
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
  ✔ calculates baseline correctly (1.1825ms)
  ✔ aggregates KGS_DIRECT_UP correctly (0.4687ms)
  ✔ aggregates BULLISH with neutral lift (0.252ms)
  ✔ confidence is Low for small sample sizes (0.2241ms)
  ✔ returns empty result for empty input (7.666ms)
  ✔ handles null signalSummary gracefully (0.6379ms)
  ✔ calculates liftExclusive correctly where signal appears in some but not all trades (0.4521ms)
  ✔ handles degenerate case where signal appears in every single trade (liftExclusive should equal winRate) (0.6186ms)
  ✔ excludes breakeven (pnl === 0) trades from winRate denominator (0.6222ms)
✔ aggregateSignalAnalytics (16.8009ms)
▶ cron-secret API exemptions (P1-3)
  ✔ exempts /api/cron/* and refresh routes used by the runbook (2.9797ms)
  ✔ does not exempt normal BTST/overnight GETs (still need APP_ACCESS_TOKEN) (1.1041ms)
✔ cron-secret API exemptions (P1-3) (7.0102ms)
▶ shouldFreshDiscoverBtst
  ✔ does not discover outside the window without bypass (2.5436ms)
  ✔ serves cache on bypass (no fresh discover) (0.2261ms)
  ✔ fresh-discovers on bypass when cache is empty (0.1424ms)
  ✔ fresh-discovers when the execution window is open (0.152ms)
✔ shouldFreshDiscoverBtst (16.7723ms)
▶ maskSecretTail
  ✔ masks leaving the last 4 characters (0.3723ms)
  ✔ returns **** for short values (0.187ms)
✔ maskSecretTail (0.8967ms)
▶ publicApiError
  ✔ hides internal messages outside development (0.497ms)
✔ publicApiError (0.7229ms)
▶ POST /api/auth/unlock
  ✔ sets HttpOnly cookie when token matches APP_ACCESS_TOKEN (116.672ms)
  ✔ rejects wrong token with 401 and no cookie (2.888ms)
  ✔ rejects non-string token without throwing (1.5156ms)
  ✔ sets Secure when request is https (1.7213ms)
  ✔ rate limits after 5 attempts (4.529ms)
✔ POST /api/auth/unlock (132.8851ms)
▶ POST /api/auth/logout
  ✔ clears the access cookie (1.2798ms)
✔ POST /api/auth/logout (2.5232ms)
▶ BTST backtest — single-day EOD-forced-exit simulation (Task I)
  ✔ Case 1: LONG — target hit intraday on next day (3.6834ms)
  ✔ Case 2: LONG — SL hit intraday on next day (0.3788ms)
  ✔ Case 3: LONG — neither SL nor target hit → EOD forced exit at close (0.3345ms)
  ✔ Case 4: SHORT — target hit intraday on next day (0.2847ms)
  ✔ Case 5: SHORT — neither SL nor target hit → EOD forced exit at close (0.2863ms)
  ✔ Case 6: ENTRY timestamp uses config.entryDate when OHLC is next-day only (2.7985ms)
✔ BTST backtest — single-day EOD-forced-exit simulation (Task I) (9.8064ms)
▶ TradeEngine — CLOSED_TIME_EXIT at exact window boundary
  ✔ exits CLOSED_TIME_EXIT when SL/Target not hit within 3-day window (3.5928ms)
  ✔ exits CLOSED_TIME_EXIT at day 1 when window is 1 candle (0.4578ms)
  ✔ exits CLOSED_SL before window boundary if SL is hit (0.3604ms)
  ✔ exits CLOSED_TARGET before window boundary if Target is hit (0.3247ms)
  ✔ CLOSED_TIME_EXIT — exit price is close of LAST candle in bounded window (0.3287ms)
✔ TradeEngine — CLOSED_TIME_EXIT at exact window boundary (7.2265ms)
▶ Backtest — no overlapping same-symbol trades within holding window
  ✔ blockedUntilIndex correctly prevents entries during cooldown window (2.0995ms)
  ✔ cooldown resets correctly for each new symbol (independent trackers) (0.4715ms)
✔ Backtest — no overlapping same-symbol trades within holding window (3.5518ms)
▶ Metrics Service — Signal Bucketing
  ✔ groups trades with the same stable signal key into a single signalSuccess bucket (1.6157ms)
  ✔ excludes breakeven trades (pnl === 0) from winRate denominator (computed over decisive trades only) (0.3681ms)
  ✔ computes drawdown relative to initialCapital parameter (0.2125ms)
✔ Metrics Service — Signal Bucketing (2.9468ms)
▶ BacktestService — evaluateTrigger Breakout Trigger Tests
  ✔ triggers on day i+2 via gap-open (gap-fill case) (0.3961ms)
  ✔ triggers on day i+3 via intraday touch (normal-fill case) (0.1932ms)
  ✔ never triggers within trigger window (NEVER_TRIGGERED case) (0.177ms)
✔ BacktestService — evaluateTrigger Breakout Trigger Tests (1.3153ms)
▶ TradeEngineService — SCANNER_DRIVEN holding period and safety valve
  ✔ legacy 2-day cap force-closes trade on time (0.3147ms)
  ✔ scanner-driven 20-day safety valve allows target hit on day 6 (0.1971ms)
✔ TradeEngineService — SCANNER_DRIVEN holding period and safety valve (0.9803ms)
▶ Backtest Look-Ahead Bias Prevention (P0)
  ✔ BTST enters at Market-On-Close, not at intraday limit TC (0.2485ms)
✔ Backtest Look-Ahead Bias Prevention (P0) (0.5282ms)
▶ TradeEngine — adverse gap slippage cap and untradeable size
  ✔ adverse gap slippage is capped at 1.0%, not 0.5% (0.2012ms)
  ✔ does not force 1 share when capital cannot afford it (0.2786ms)
  ✔ skips when entry equals SL (zero risk — no Infinity position size) (0.4661ms)
✔ TradeEngine — adverse gap slippage cap and untradeable size (6.9884ms)
▶ mapScanResultsForBreakoutAlert
  ✔ fills entry/sl/target fallbacks from tc/bc/r1 and ltp (9.9722ms)
  ✔ uses ltp-based fallbacks when levels are missing (0.3793ms)
✔ mapScanResultsForBreakoutAlert (12.2294ms)
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
  ✔ first claim of the day: findMany returns empty, create succeeds, send succeeds → sent true (458.6273ms)
  ✔ symbol already alerted today: filtered out, no Telegram send (2.5973ms)
  ✔ pre-migration _legacy row locks the whole day (no re-blast) (2.6379ms)
  ✔ claim-loop DB error rolls back already-claimed symbols (6.7607ms)
  ✔ new symbol at 15:20 bucket: existing symbol filtered, only new symbol sent (4.2802ms)
  ✔ concurrent race: create P2002 for all symbols → already sent, Telegram never called (3.0528ms)
  ✔ claim succeeds, Telegram returns sent false → deleteMany rollback, failure response (3.772ms)
  ✔ claim succeeds, sendBtstAlert throws → deleteMany rollback, error re-thrown (2.8357ms)
  ✔ empty payload: no Telegram send and no day claim retained (1.2704ms)
  ✔ option enrichment throw skips only that symbol and still sends remaining alerts (9.8391ms)
✔ BTST alert cron — BtstAlertState claim logic (per-symbol dedup) (499.4679ms)
▶ BTST alert cron — alert-time journaling (alert ↔ journal parity)
  ✔ successful stock alert with option data is journaled immediately (4.7724ms)
  ✔ index BTST alert is journaled with the INDEX tag (1.8753ms)
  ✔ failed Telegram send never journals (claims rolled back instead) (2.9553ms)
  ✔ journal failure never breaks an already-sent alert (6.0262ms)
  ✔ alert without option suggestion defers to the 15:25 journal job (2.9294ms)
  ✔ missing market data fails closed (skips alert) (1.2675ms)
✔ BTST alert cron — alert-time journaling (alert ↔ journal parity) (21.23ms)
▶ btstScanCacheKey (P1-1)
  ✔ includes universe so NIFTY50 and FNO do not share a key (1.2225ms)
  ✔ defaults blank universe to NIFTY50 (same as route) (0.2374ms)
  ✔ ALL / NIFTY50 / NSE_FNO are pairwise distinct (0.2091ms)
✔ btstScanCacheKey (P1-1) (3.2245ms)
▶ btst-journal premium TRADEABLE pipeline
  ✔ picks only TRADEABLE + READY+ (>=85), excluding WATCH/WATCHLIST/IGNORE (40.9882ms)
  ✔ suppresses STBT entirely in BULL regime (0.4885ms)
  ✔ suppresses BTST entirely in BEAR regime (0.3911ms)
  ✔ allows STBT in BEAR regime (0.2667ms)
  ✔ returns empty when only weak/non-tradable rows exist (0.229ms)
  ✔ prefers latest signalTime over higher score when deduping rescans (8.1041ms)
✔ btst-journal premium TRADEABLE pipeline (53.0138ms)
▶ BTST Scoring Engine Tests
  ✔ Stock A: LONG setup (Score >= 80, Gap >= 20) (30.0409ms)
  ✔ Stock B: SHORT setup (Score >= 80, Gap >= 20) (1.5164ms)
  ✔ Stock C: NEUTRAL_CONFLICT (Scores close to each other) (1.356ms)
  ✔ Stock D: WEAK (Max score < 10) (1.1721ms)
  ✔ Stock E: NEUTRAL_CONFLICT (Max score between 10 and 30) (1.2627ms)
  ✔ asOfDate override changes candle selection vs. different date (1.204ms)
  ✔ asOfDate override is deterministic: same date always produces same output (1.1533ms)
  ✔ no asOfDate produces same result as calling with real today date (1.9887ms)
  ✔ discover() delegates to Advanced OvernightService engine (1.3571ms)
  ✔ isExecutionWindowOpen() enforces discovery window from BTST_WINDOWS (exclusive end) (2.8812ms)
  ✔ isExecutionWindowOpen() returns false on an NSE holiday even on a weekday, in-window (0.5732ms)
  ✔ isExecutionWindowOpen() still returns true on an ordinary weekday in-window (0.5071ms)
✔ BTST Scoring Engine Tests (47.7046ms)
✔ CacheService Falsy values (13.1625ms)
✔ Redis reconnect delay keeps retrying with a capped backoff (1.9901ms)
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
✔ CalculationService caches successful persisted share records (12.7836ms)
✔ CalculationService does not cache failed DB writes as share records (496.2473ms)
Circuit breaker open: DB connection failed. Cooldown until 2026-08-06T10:55:42.181Z
Circuit breaker half-open: attempting probe request to DB.
Circuit breaker closed: DB responded (non-connection error during probe).
Circuit breaker open: DB connection failed. Cooldown until 2026-08-06T10:55:42.186Z
Circuit breaker half-open: attempting probe request to DB.
Circuit breaker open: DB connection failed. Cooldown until 2026-08-06T10:55:42.186Z
✔ DatabaseCircuitBreaker — HALF_OPEN non-connection probe closes circuit (10.8121ms)
✔ DatabaseCircuitBreaker — connection error on probe re-opens with cooldown (1.7874ms)
▶ CPR Engine Calculations
  ✔ calculates correct levels with balanced inputs (1.7391ms)
  ✔ handles normalization (TC and BC swap) correctly (0.4587ms)
✔ CPR Engine Calculations (3.8258ms)
▶ CPR Inputs Schema Validation
  ✔ succeeds for valid inputs (2.2502ms)
  ✔ fails when High <= Low (0.9379ms)
  ✔ fails when Close is outside range (0.5062ms)
✔ CPR Inputs Schema Validation (4.4533ms)
[CPRJournal] NOTRIG not triggered: LTP 95 < Entry 100
[CPRJournal] DIVERGED skipped: sector divergence (live mode)
[CPRJournal] 7 qualifying signal(s) cut by CPR_JOURNAL_MAX_SIGNALS=3 (10 qualified today)
▶ runCprJournalJob entry-trigger and sector-divergence gates
  ✔ skips signal whose LTP never reached the entry trigger (62.6895ms)
  ✔ LTP exactly at entry counts as triggered (12.6649ms)
  ✔ legacy rows with entry=0 default pass the trigger gate (0.8923ms)
  ✔ SECTOR_DIVERGENCE skips journaling only in live filter mode (1.3679ms)
  ✔ findMany take is driven by CPR_JOURNAL_MAX_SIGNALS (1.0571ms)
✔ runCprJournalJob entry-trigger and sector-divergence gates (81.3815ms)
✔ CPR_JOURNAL_MAX_SIGNALS env schema rejects unsafe values (2.8343ms)
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
  ✔ formats ISO timestamps without inventing now (1.6443ms)
  ✔ extracts time from BTST/INDEX human scannedAt labels (3.3434ms)
  ✔ returns empty string when scannedAt is missing (UI shows —) (0.5257ms)
✔ lastRefreshLabel (honest Last Refresh) (7.4661ms)
▶ runCprScanJob
  ✔ returns success/count from ScannerController.runFullScan and notifies breakouts (2.0014ms)
  ✔ returns success=false when runFullScan throws and skips notify (4.9908ms)
✔ runCprScanJob (11.5938ms)
▶ cpr-scan claim buckets (retainClaim)
  ✔ same bucket key cannot re-claim after retainClaim=true (0.7587ms)
  ✔ next time-bucket key can claim again (periodic re-fire) (0.3097ms)
  ✔ retainClaim=false allows same key to reclaim after complete (0.3334ms)
✔ cpr-scan claim buckets (retainClaim) (1.8208ms)
▶ APP_ACCESS_TOKEN production guard
  ✔ throws when NODE_ENV=production and token is missing (runtime) (1006.9275ms)
  ✔ allows next production build phase without token (1305.6827ms)
✔ APP_ACCESS_TOKEN production guard (2314.5319ms)
▶ REDIS_URL / optional URL env (P1-4)
  ✔ emptyStringToUndefined maps blank strings to undefined (1.2462ms)
  ✔ accepts REDIS_URL="" as unset (memory/cache fallback path) (0.7379ms)
  ✔ still rejects invalid REDIS_URL values (1.7047ms)
  ✔ accepts a valid REDIS_URL (0.4788ms)
✔ REDIS_URL / optional URL env (P1-4) (7.2513ms)
[EventCalendarService] Calendar is STALE or EMPTY. Applying conservative 100 risk for SBIN.
▶ EventCalendarService — EVENT_CALENDAR_ENFORCE_FRESHNESS flag
  ✔ getEventRisk: unset flag in live mode → severity 0 on empty calendar (51.125ms)
  ✔ getEventRisk: flag false → severity 0 on empty calendar (58.1545ms)
  ✔ getEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar (4.4822ms)
  ✔ getBulkEventRisk: unset flag in live mode → severity 0 on empty calendar (1.4081ms)
  ✔ getBulkEventRisk: flag false → severity 0 on empty calendar (0.9424ms)
  ✔ getBulkEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar (1.1076ms)
✔ EventCalendarService — EVENT_CALENDAR_ENFORCE_FRESHNESS flag (120.7981ms)
✔ eventImpactSeverity decays by trading session (1.6367ms)
✔ EventCalendarService.daysBetween explicitly skips weekends and holidays (93.1454ms)
✔ EventCalendarService.addTradingDays advances by NSE sessions (not calendar days) (9.3847ms)
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.70% >= 3.5%
[ExtensionGate] TEST SHORT rejected: EXTENDED_DOWN dayReturn=-5.00% <= -3.5%
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.00% >= 3.5%
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=5.70% >= 3.5%
▶ Extension / exhaustion gate (DIXON-class days)
  ✔ rejects LONG BTST after a >3.5% up day (DIXON-style extension) (42.2787ms)
  ✔ allows LONG BTST on a normal ~1% up day (0.762ms)
  ✔ rejects SHORT STBT after a sharp dump day (1.2276ms)
  ✔ exposes configured limits used by the gate (0.4989ms)
  ✔ history fallback: when last bar is prior session, previousClose is last.close (not n-2) (3.0949ms)
  ✔ history fallback: when last bar is today, previousClose is n-2 (2.9477ms)
✔ Extension / exhaustion gate (DIXON-class days) (53.7203ms)
▶ FnoUniverseCheckService
  ✔ should return no drift when NSE list perfectly matches local isFnO list (11.7747ms)
  ✔ should flag newly-ineligible stock (0.6636ms)
  ✔ should flag brand-new NSE listing (0.5585ms)
  ✔ should handle fetch failure gracefully (0.3941ms)
  ✔ should handle case and padding insensitivity (0.7967ms)
✔ FnoUniverseCheckService (16.777ms)
▶ FyersAuthService Diagnostic Logging
  ✔ direct call non-2xx status logs status and body text, then falls back (3.3295ms)
  ✔ direct call 200 with { s: "error" } logs full body, then falls back (1.1427ms)
  ✔ direct call 200 with { s: "ok" } but missing token logs full body, then falls back (1.0078ms)
✔ FyersAuthService Diagnostic Logging (8.0416ms)
▶ index-intraday.util
  ✔ indexBtstDiscoveryAsOfUtc maps 15:25 IST to 09:55 UTC (2.4752ms)
  ✔ parseIndexIntradayMetricsFromChart computes VWAP and last15mHigh (33.3008ms)
  ✔ parseIndexIntradayMetricsFromChart excludes the latest forming closing-window bar (0.9727ms)
✔ index-intraday.util (38.5145ms)
▶ index-btst-backtest.helper
  ✔ resolveIndexVixCalm matches production VIX bands (1.7613ms)
  ✔ returns not tradable when intraday chart missing (score invalid) (1.71ms)
  ✔ requires READY+ score floor (85/130) with full intraday data (1.3335ms)
  ✔ suppresses LONG in BEAR regime (live alert/journal path) (2.4263ms)
✔ index-btst-backtest.helper (8.194ms)
▶ getIndexBtstCompare
  ✔ excludes breakeven live and backtest trades from win-rate denominators (50.4764ms)
  ✔ returns null win rates when closed trades are all breakeven (19.6876ms)
✔ getIndexBtstCompare (72.2006ms)
▶ indexClassificationToQualityBucket
  ✔ maps INDEX_STRONG and INDEX_READY to TRADEABLE (1.4788ms)
  ✔ maps INDEX_WATCH and IGNORE to non-tradable buckets (0.3697ms)
✔ indexClassificationToQualityBucket (3.723ms)
▶ selectTradableIndexBtstPicks
  ✔ selects INDEX READY+ long picks and ignores stock classifications (19.6915ms)
  ✔ respects minScore floor and suppressLong regime gate (1.1022ms)
  ✔ dedupes by symbol keeping latest signalTime (0.7546ms)
✔ selectTradableIndexBtstPicks (22.0612ms)
▶ selectTradableIndexStbtPicks
  ✔ only returns SHORT direction index signals with INDEX_READY+ classification (0.9634ms)
  ✔ returns empty array when suppressShort is true (BULL regime gate) (0.3084ms)
  ✔ respects the minScore floor (0.4222ms)
  ✔ dedupes SHORT picks by symbol keeping latest signalTime (0.3849ms)
  ✔ logIndexStbtJournalEntries uses optionType PE (structural contract test) (23.5913ms)
✔ selectTradableIndexStbtPicks (26.4142ms)
▶ index-btst-slice-metrics
  ✔ classifyVixBand uses production thresholds (1.6944ms)
  ✔ parseIndexBtstTradeContext reads nested context (0.5785ms)
  ✔ computeIndexBtstSliceMetrics groups by vix and regime (0.7607ms)
✔ index-btst-slice-metrics (4.7598ms)
▶ Index Scan Cache Key
  ✔ generates a unique cache key for a given date (1.4494ms)
  ✔ generates a different key for a different date (0.3336ms)
✔ Index Scan Cache Key (3.4956ms)
[RegimeService] NIFTY 50 Regime for 2026-07-21: BEAR / HIGH (ATR%: 2.56%)
[RegimeService] NIFTY 50 Regime for 2026-07-25: BULL / HIGH (ATR%: 2.49%)
▶ IndexDiscoverService.discover
  ✔ scans exactly the fixed instrument list (NIFTY, BANKNIFTY, SENSEX) in both directions (LONG/SHORT) — no F&O universe loop (49.8264ms)
  ✔ returns IGNORE classification with null score in mock mode (no live VWAP/VIX) for both directions (7.2969ms)
  ✔ never throws on a weekend date — returns empty or safely skips non-trading days (11.376ms)
  ✔ produces valid IST signalDate (YYYY-MM-DD) and stable discoveryStart signalTime (5.2374ms)
✔ IndexDiscoverService.discover (75.5445ms)
▶ IndexDiscoverService.getIndiaVixState
  ✔ returns vixCalm null in mock mode (score-safety INVALID path) (0.3675ms)
✔ IndexDiscoverService.getIndiaVixState (0.62ms)
▶ IndexDiscoverService.resolveIndexSessionCandles
  ✔ uses live session as today when hasLive (1.0487ms)
  ✔ uses prior completed session as yesterday when live daily history already includes today (0.9388ms)
  ✔ uses last completed bar as today after EOD when live unavailable (0.7658ms)
  ✔ returns null mid-session without live feed (score-safety) (0.6721ms)
✔ IndexDiscoverService.resolveIndexSessionCandles (3.9899ms)
▶ IndexDiscoverService.resolvePreviousCompletedCandle
  ✔ returns n-2 when the latest daily candle is today (0.5648ms)
  ✔ returns the latest candle when history has not rolled into today yet (0.474ms)
✔ IndexDiscoverService.resolvePreviousCompletedCandle (1.26ms)
▶ IndexDiscoverService.mapIntraClassification
  ✔ maps scores onto INDEX_* using INTRA floors (75 / 60 / 40) (0.2843ms)
✔ IndexDiscoverService.mapIntraClassification (0.3972ms)
▶ IndexDiscoverService.discoverIntraday
  ✔ returns empty on weekend — does not fabricate INTRA rows (2.81ms)
  ✔ never throws on a weekday and only emits INDEX_* classifications (7.8809ms)
✔ IndexDiscoverService.discoverIntraday (10.9323ms)
▶ filterIndexRowsForDisplay
  ✔ hides null-score BTST outside discovery window (1.7087ms)
  ✔ shows null-score BTST inside discovery window (0.2719ms)
  ✔ always keeps INTRA rows (0.245ms)
✔ filterIndexRowsForDisplay (7.1047ms)
▶ primaryIndexReason
  ✔ returns first non-empty reason (0.29ms)
  ✔ returns null when missing (0.1826ms)
✔ primaryIndexReason (0.7341ms)
▶ IndexIntraRankingService
  ✔ awards LOWER_VALUE points (symmetric with HIGHER_VALUE) (1.6324ms)
  ✔ awards session-move points for aligned bearish move (0.4004ms)
  ✔ scores BREAKDOWN without volume dependency (0.2419ms)
  ✔ maps classification using INTRA floors (75 / 60 / 40) (0.4034ms)
  ✔ caps score at 100 (0.3289ms)
✔ IndexIntraRankingService (5.8201ms)
▶ index-intraday.util
  ▶ parseIndexIntradayMetricsFromChart
    ✔ should return empty metrics for missing or invalid chart data (3.0366ms)
    ✔ should correctly calculate last15mHigh and last15mLow during the closing liquidity window (37.7633ms)
    ✔ should fall back to unweighted average if volume is 0 (0.6541ms)
  ✔ parseIndexIntradayMetricsFromChart (42.9374ms)
✔ index-intraday.util (43.5605ms)
▶ IndexRankingService.calculateScoreDetails — score safety
  ✔ returns null score when vwap is missing (1.5512ms)
  ✔ returns null score when last15mHigh is missing (0.3704ms)
  ✔ returns null score when vixCalm is null/undefined (0.2331ms)
  ✔ returns null score when confirmation candles are unavailable (0.1918ms)
✔ IndexRankingService.calculateScoreDetails — score safety (4.967ms)
▶ IndexRankingService.calculateScoreDetails — rules
  ✔ Rule 1: awards vixCalm (25) only when vixCalm is true (0.5843ms)
  ✔ Rule 2: awards cprNarrow (30) only when tomorrowCprNarrow is true (0.3968ms)
  ✔ Rule 3: awards higherValue (20) only when both tomorrow BC and TC exceed today (0.2719ms)
  ✔ Rule 4: awards vwap confirmation (20) only when close beats both TC and VWAP (0.4357ms)
  ✔ Rule 5: awards liquidity (20) only when close > last15mHigh (0.3505ms)
  ✔ Rule 6: awards closeStrength (15) only when CLV > 0.70 (0.4371ms)
  ✔ sums all six rules to a max score of 130 (0.4763ms)
✔ IndexRankingService.calculateScoreDetails — rules (4.2894ms)
▶ IndexRankingService.getClassification
  ✔ maps null score to IGNORE (0.517ms)
  ✔ maps floors 100 / 85 / 70 to INDEX_STRONG / INDEX_READY / INDEX_WATCH (0.2258ms)
  ✔ uses index-specific classification strings that cannot collide with stock filters (0.1882ms)
✔ IndexRankingService.getClassification (1.6906ms)
▶ INDEX_SCORE / India VIX constants
  ✔ INDEX_SCORE mirrors ADVANCED_SCORE floors (STRONG/READY/WATCH/MAX) (0.2457ms)
  ✔ exposes India VIX calm/elevated thresholds (0.1244ms)
✔ INDEX_SCORE / India VIX constants (0.6354ms)
▶ Index BTST red-session guard
  ✔ blocks when session is down at least INDEX_BTST_RED_SESSION_BLOCK_PCT (0.297ms)
  ✔ allows flat or green sessions above threshold (0.1102ms)
✔ Index BTST red-session guard (0.5581ms)
▶ IndexRegimeService.computeAdjustment
  ✔ boosts LONG in bullish low-vol regime (1.5015ms)
  ✔ penalizes LONG in bearish high-vol regime (0.3465ms)
  ✔ boosts SHORT in bearish regime (0.2417ms)
  ✔ returns neutral adjustment in choppy low-vol regime (0.2141ms)
✔ IndexRegimeService.computeAdjustment (3.9695ms)
▶ IndexRegimeService.applyConfidence
  ✔ clamps confidence to max score (0.304ms)
  ✔ returns null when base score is null (0.1598ms)
  ✔ floors confidence at zero (0.2101ms)
✔ IndexRegimeService.applyConfidence (0.9632ms)
▶ index-signal.util
  ✔ maps LONG READY to CALL_BUY (1.8715ms)
  ✔ maps SHORT READY to PUT_BUY (0.2389ms)
  ✔ maps IGNORE to NO_TRADE (0.1777ms)
  ✔ computes risk/reward string (0.2486ms)
  ✔ builds BTST reasons from breakdown (0.4748ms)
  ✔ builds INTRA reasons from signal tags (1.0325ms)
  ✔ blocks reasons when VIX elevated (0.8789ms)
✔ index-signal.util (10.839ms)
▶ IndexRankingService (STBT SHORT)
  ▶ calculateShortScoreDetails
    ✔ returns null if any safety gate fails (vwap, last15mLow, vixElevated, hasConfirmationCandles) (1.5542ms)
    ✔ Rule 1: VIX Elevated (25 pts) (0.3174ms)
    ✔ Rule 2: Lower Value (20 pts) - tomorrow BC and TC both below today BC and TC (0.2187ms)
    ✔ Rule 3: CPR Narrow (30 pts) (0.2277ms)
    ✔ Rule 4: Bearish Confirmation (20 pts) - close < todayBc AND close < vwap (0.2058ms)
    ✔ Rule 5: EOD Weakness (20 pts) - close < last15mLow (0.1818ms)
    ✔ Rule 6: Closing Weakness (15 pts) - close in bottom 30% of day range (0.2504ms)
    ✔ accumulates all points perfectly (Max 130) (1.35ms)
  ✔ calculateShortScoreDetails (6.0011ms)
  ▶ getShortClassification
    ✔ classifies thresholds correctly (100/85/70) (0.4146ms)
  ✔ getShortClassification (0.6821ms)
✔ IndexRankingService (STBT SHORT) (7.5507ms)
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
  ﹣ persists overnightSignalId / model prices from the selected id, not the newest row (1.2ms) # Postgres unreachable
✔ TradeJournal logSignal overnightSignalId linkage (P1-2) (4171.5703ms)
[EligibilityGate] LIQ rejected: avgVolume 99999 < 100000
[EligibilityGate] LIQ rejected: volumeRatio 1.40 < 1.5 (VDU hard gate)
▶ EntryManagerService hard liquidity gate (Advanced discover path)
  ✔ rejects avgVolume below 100k (hard exclude, not LOW_QUALITY flag) (2.6694ms)
  ✔ rejects volume-ratio below 1.5 VDU hard gate (1.2331ms)
  ✔ allows stocks that clear avgVolume 100k and volume-ratio 1.5 (VDU) (0.395ms)
✔ EntryManagerService hard liquidity gate (Advanced discover path) (7.6398ms)
▶ cron-run-claim
  ✔ allows first claim and blocks duplicate until complete (1.7907ms)
  ✔ release allows retry after failure (0.7581ms)
✔ cron-run-claim (4.338ms)
▶ resolveJournalSnapshotSlot
  ✔ maps IST windows to snapshot slots on a trading day (1.9936ms)
✔ resolveJournalSnapshotSlot (2.363ms)
▶ shouldCompleteClaimedJob
  ✔ releases retryable soft failures (0.6774ms)
  ✔ completes successful or non-retryable results (0.563ms)
✔ shouldCompleteClaimedJob (1.6817ms)
▶ Market Hours Utilities
  ▶ getISTDateString
    ✔ returns the correct IST date during UTC midnight rollover (pre-IST midnight) (40.6265ms)
    ✔ returns the correct IST date during the 5.5 hour mismatch window (0.6587ms)
    ✔ returns the correct IST date when UTC and IST days match (0.8042ms)
    ✔ matches getISTTime().dateString behavior (4.0455ms)
  ✔ getISTDateString (47.5657ms)
  ▶ isTodayCandleClosed (Live Market Scenario Regression)
    ✔ returns false during live market hours (e.g., 2:30 PM IST) (7.8946ms)
    ✔ returns false right before market close (0.7047ms)
    ✔ returns true after market close (e.g., 4:00 PM IST) (0.7686ms)
  ✔ isTodayCandleClosed (Live Market Scenario Regression) (10.3021ms)
  ▶ getCompletedHistory
    ✔ keeps history unchanged when asOfDate replay is used (0.9191ms)
    ✔ with asOfDate equal to last candle date, returns full history even if wall-clock session is open (1.31ms)
  ✔ getCompletedHistory (2.5633ms)
  ▶ Cash session (site-wide PRESESSION + LIVE)
    ✔ exposes 09:00 pre-open and 09:15–15:30 live labels (0.4384ms)
    ✔ maps CLOSED / PRESESSION / LIVE phases (3.2498ms)
    ✔ treats weekends as CLOSED (0.7823ms)
  ✔ Cash session (site-wide PRESESSION + LIVE) (4.7514ms)
  ▶ BTST window helpers (canonical BTST_WINDOWS)
    ✔ maps discovery / confirm / freeze / journal phases (4.5681ms)
    ✔ identifies the 15:15–15:30 EOD liquidity window (0.2908ms)
  ✔ BTST window helpers (canonical BTST_WINDOWS) (5.1115ms)
✔ Market Hours Utilities (71.6675ms)
▶ Market Profile — CONTINUOUS identity (default env)
  ✔ active profile resolves to CONTINUOUS clocks matching prior production (2.9133ms)
  ✔ BTST_WINDOW_MINUTES / BTST_CLOCK match CONTINUOUS fixtures (0.2729ms)
  ✔ isInClosingLiquidityWindow is [15:15, 15:30) under CONTINUOUS (0.2034ms)
  ✔ supportsClosingAuction is always false under CONTINUOUS (0.7296ms)
  ✔ getSessionState never emits CAS/FNO_ONLY under CONTINUOUS (44.6825ms)
  ✔ shouldFreezeBreakouts is false under CONTINUOUS even for F&O after 15:15 (0.415ms)
✔ Market Profile — CONTINUOUS identity (default env) (51.0026ms)
▶ Market Profile — CLOSING_AUCTION simulation
  ✔ SEBI-locked clocks on CLOSING_AUCTION profile (0.524ms)
  ✔ supportsClosingAuction: F&O true, non-F&O false under CLOSING_AUCTION (0.2242ms)
  ✔ MarketSessionContext carries resolver fields (0.277ms)
  ✔ getSessionState F&O: LIVE→CAS at 15:15, CAS until 15:35, FNO_ONLY until 15:40 (1.6688ms)
  ✔ getSessionState non-F&O: still LIVE at 15:20, no CAS (0.9296ms)
  ✔ shouldFreezeBreakouts after 15:15 for F&O only (0.9646ms)
  ✔ Rule5 window bounds on CLOSING_AUCTION profile object (0.3157ms)
✔ Market Profile — CLOSING_AUCTION simulation (5.5184ms)
▶ Market Profile — unknown env falls back to CONTINUOUS
  ✔ resolveMarketProfile ignores garbage (0.1781ms)
✔ Market Profile — unknown env falls back to CONTINUOUS (0.3565ms)
▶ Market Profile — default helpers still continuous
  ✔ isMarketOpen / discovery helpers use CONTINUOUS module clocks (6.6353ms)
✔ Market Profile — default helpers still continuous (6.8941ms)
[MarketService] 200 SMA caching failed for FAIL: Yahoo Finance HTTP 404
[LiveFeed] Fyers Primary OK for NSE:LTM-EQ (ltp=215.5, candles=110, hist=22)
[LiveFeed] Fyers Data API permission denied (Additional permission required). Fix: myapi.fyers.in → edit app → enable Quotes & Market Data + Historical Data (Fyers often requires all permission checkboxes) → Save → Reconnect Fyers in Settings. Skipping Fyers for 10m; Yahoo Fallback remains active.
[LiveFeed] Fyers quotes failed for NSE:LTM-EQ: HTTP 403 code=403 msg=Additional permission required
[LiveFeed] Yahoo Fallback OK for LTM.NS
[LiveFeed] Fyers Primary skipped for LTM: not connected
[LiveFeed] Yahoo Fallback failed for LTM.NS: Yahoo Finance HTTP 404 for LTM.NS
[LiveFeed] Yahoo Fallback OK for TEST.NS
▶ Market Service - 200 SMA Plumbing
  ✔ SMA Calculation Mathematical Correctness (>= 200 guard) (38.6885ms)
  ✔ cache200SMA() Per-Symbol Isolation on 404 (2.6135ms)
  ✔ getStockData() Cache Miss Fallback (2.2941ms)
  ✔ getStockData() Fyers Primary succeeds with quotes LTP + history (55.274ms)
  ✔ probeFyersDataApi() reports permission denial clearly (1.429ms)
  ✔ getStockData() uses Yahoo Fallback when Fyers Primary fails (7.5306ms)
  ✔ getStockData() skips Fyers Primary when not Connected (1.2804ms)
  ✔ getStockData() silently skips null-ohlc placeholder candles (2.8083ms)
✔ Market Service - 200 SMA Plumbing (115.8132ms)
▶ Middleware Authentication & Gating
  ✔ redirects anonymous visits to /scanner to /unlock (21.3114ms)
  ✔ allows anonymous visits to public pages (2.8745ms)
  ✔ allows anonymous access to PWA static assets (2.2041ms)
  ✔ does not Set-Cookie app_access_token on anonymous page visits (0.5889ms)
  ✔ blocks unauthenticated API requests with 401 (2.9814ms)
  ✔ allows API requests with valid authorization header (1.192ms)
  ✔ allows API requests with valid cookie (0.8442ms)
  ✔ exempts public and cron API routes from token checks (1.1466ms)
  ✔ requires auth for Fyers login (prevents token overwrite) (0.8035ms)
  ✔ does not treat /api/*.png spoof as a public static asset (0.776ms)
✔ Middleware Authentication & Gating (37.2921ms)
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
✔ OptionChainService fetchOptionQuote regex supports & (2.2021ms)
✔ OptionChainService rollover logic and cache partitioning (80.409ms)
✔ OptionChainService applies rollover when direct fetch falls back to proxy (16.2011ms)
✔ OptionChainService resolveRolledOverChain parses targetExpiryStr (monthly vs weekly) (5.4902ms)
✔ OptionChainService TTL uses F&O session end in CLOSING_AUCTION (1.2564ms)
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
✔ OptionSuggestionService extracts expiry from NSE and BSE Fyers option symbols (2.2847ms)
▶ Option Suggestion Service — Honest Error Paths (no fabricated data)
  ✔ TOKEN_EXPIRED: missing token returns error, no optionsChain, no fake data (1.741ms)
  ✔ EMPTY_CHAIN: Fyers returns no data — explicit error, no fake fallback (0.6125ms)
  ✔ FETCH_FAILED: propagates error honestly, no fabricated data (0.4859ms)
  ✔ Math.random never called during any error path (0.4481ms)
✔ Option Suggestion Service — Honest Error Paths (no fabricated data) (5.0066ms)
▶ Option Suggestion — OI Score scales relative to max OI among candidates
  ✔ highest OI candidate gets oiScore=30 (5.6555ms)
✔ Option Suggestion — OI Score scales relative to max OI among candidates (6.4253ms)
✔ Option Suggestion — SENSEX formatted name expands BSE weekly expiry token (1.2174ms)
▶ Option Suggestion — PCR Context Score
  ✔ CE trade + PCR > 1.2 → pcrContextScore = 20 (9.085ms)
  ✔ PE trade + PCR < 0.8 → pcrContextScore = 20 (2.3797ms)
  ✔ CE trade + PCR < 0.8 → pcrContextScore = 0 (contradicts direction) (1.4372ms)
✔ Option Suggestion — PCR Context Score (13.7939ms)
▶ Option Suggestion — Spread Score tiers
  ✔ <=1% spread -> 20 pts (8.0755ms)
  ✔ <=2% spread -> 15 pts (0.488ms)
  ✔ <=4% spread -> 10 pts (0.4549ms)
  ✔ <=8% spread -> 5 pts (0.4664ms)
  ✔ >8% spread -> 0 pts (0.3438ms)
✔ Option Suggestion — Spread Score tiers (12.9249ms)
▶ Option Suggestion — ITM Depth Score: 1st ITM preferred
  ✔ 1st ITM selected when all other scores equal → itmDepthScore=10 (0.9522ms)
✔ Option Suggestion — ITM Depth Score: 1st ITM preferred (2.1183ms)
▶ Option Suggestion — Expensive high-scoring strike wins (no budget gate)
  ✔ Rs300 ltp (very expensive) but perfect OI/vol/spread beats Rs5 ltp cheap strike (1.0353ms)
✔ Option Suggestion — Expensive high-scoring strike wins (no budget gate) (1.4851ms)
▶ Option Suggestion — zero OI and zero volume returns NO_VIABLE_STRIKES
  ✔ CE: all candidates have 0 OI and 0 volume → NO_VIABLE_STRIKES (0.7291ms)
  ✔ PE: all candidates have 0 OI and 0 volume → NO_VIABLE_STRIKES (0.8362ms)
✔ Option Suggestion — zero OI and zero volume returns NO_VIABLE_STRIKES (2.1082ms)
▶ STOCK_OVERNIGHT_INSTRUMENT_WHERE
  ✔ excludes INDEX instrumentType so stock overnight queries stay isolated (2.3642ms)
✔ STOCK_OVERNIGHT_INSTRUMENT_WHERE (10.2608ms)
▶ INDEX_OVERNIGHT_INSTRUMENT_WHERE
  ✔ selects INDEX instrumentType only (0.3464ms)
✔ INDEX_OVERNIGHT_INSTRUMENT_WHERE (0.6558ms)
▶ OvernightRiskService - Index Correlation (Beta Proxy)
  ✔ synthesizes beta_proxy correctly for known-correlated series (5.1937ms)
  ✔ uses extended stock-history fetch for beta when MarketService history is truncated to 22 days (35.8581ms)
  ✔ zero-variance Nifty window returns null for beta_proxy without throwing (1.2627ms)
  ✔ handles misaligned date gaps correctly by dropping them (1.1458ms)
  ✔ skips zero-price bases instead of poisoning beta with fake 0% returns (1.0774ms)
  ▶ Phase 2B Index Correlation Risk Weighting & Regression Checks
    ✔ correlation null (short history <60d) defaults to neutral beta=1.0 and preserves exact LOW/MEDIUM/HIGH riskLevel math (3.7727ms)
    ✔ high beta (>1.0) shifts riskFactor upward across threshold (MEDIUM -> HIGH) (1.0871ms)
    ✔ low beta (<1.0) dampens riskFactor downward across threshold (MEDIUM -> LOW) (1.353ms)
  ✔ Phase 2B Index Correlation Risk Weighting & Regression Checks (6.6661ms)
✔ OvernightRiskService - Index Correlation (Beta Proxy) (53.4512ms)
▶ overnight-ui-adapter (Phase H)
  ✔ maps OvernightSignal into BTST UI DTO with advanced metadata (3.0893ms)
  ✔ selects TRADEABLE READY+ picks and respects STBT suppression (1.1122ms)
  ✔ compareLatestScanRows prefers newer signalTime then score (26.1377ms)
  ✔ dedupes by symbol so rescans cannot fill both top-N slots (4.2822ms)
✔ overnight-ui-adapter (Phase H) (37.579ms)
▶ sanitizePagination
  ✔ accepts valid numeric strings (2.7573ms)
  ✔ falls back to defaults on missing values (0.301ms)
  ✔ rejects NaN / garbage input (0.2163ms)
  ✔ rejects zero and negative page (would produce negative Prisma skip) (1.3203ms)
  ✔ rejects zero / negative limit (0.242ms)
  ✔ caps abusive page sizes at MAX_PAGE_LIMIT (0.1975ms)
  ✔ floors non-integer values (0.1974ms)
✔ sanitizePagination (14.8951ms)
▶ computeOptionPnl
  ✔ computes a winning long-premium trade (1.1113ms)
  ✔ computes a losing trade with correct sign (0.2427ms)
  ✔ rounds to 2 decimal places (no float noise) (0.1881ms)
  ✔ never divides by zero — entryCmp 0 yields 0% not Infinity (0.2516ms)
  ✔ handles negative entryCmp defensively without NaN (0.2111ms)
  ✔ breakeven is zero (0.2047ms)
✔ computeOptionPnl (4.1586ms)
✔ getProcessMemorySnapshot returns positive MB values (7.8932ms)
▶ Redis Cache Client Tests
  ✔ Initial state or ready state check (6.7445ms)
✔ Redis Cache Client Tests (8.2229ms)
[RegimeService] NIFTY 50 Regime for 2026-07-20: BULL / HIGH (ATR%: 3.33%)
▶ RegimeService - EMA Edge Case Fix
  ✔ length=19 returns DEFAULT regime (CHOPPY/LOW/50) (39.537ms)
  ✔ length=20 returns DEFAULT regime instead of spurious BULL (1.6927ms)
  ✔ length=21 computes a genuine trend (not default, not spurious) (5.711ms)
✔ RegimeService - EMA Edge Case Fix (49.3289ms)
✔ scanner mixed universes stay live past 15:15 in CLOSING_AUCTION (45.373ms)
✔ NIFTY_FNO universe remains closed after 15:15 in CLOSING_AUCTION (50.2518ms)
✔ per-symbol freeze only applies to F&O names in CLOSING_AUCTION (6.9969ms)
▶ Scanner Service Signals Evaluation
  ✔ evaluates NORMAL and BULLISH signals correctly (47.3043ms)
  ✔ evaluates BREAKDOWN signal correctly on high-volume move below bc (2.1345ms)
  ✔ Scanner Dynamic Shift Bias (P0) — live market partial candle does not override yesterday CPR (2.0815ms)
  ✔ detects GAPS and VIRGIN CPR correctly (0.7892ms)
✔ Scanner Service Signals Evaluation (55.1482ms)
▶ Scanner Service V2 Entry, Target, Stop Loss, and Risk-Reward (RR)
  ✔ calculates correct trade setups for BULLISH bias (1.8644ms)
  ✔ calculates correct trade setups for BEARISH bias (1.7851ms)
✔ Scanner Service V2 Entry, Target, Stop Loss, and Risk-Reward (RR) (4.3034ms)
▶ Ranking Service V2 Scoring & Classifications
  ✔ assigns correct classification labels based on score ranges (0.4956ms)
  ✔ calculates correct score sum and caps at 100 (0.5336ms)
✔ Ranking Service V2 Scoring & Classifications (1.8201ms)
▶ KGS CPR Theory Signal and Scoring Tests
  ✔ HP_ASC_CPR fires when 3 consecutive rising TC days and PDL is respected (2.8945ms)
  ✔ HP_ASC_CPR is invalidated when close breaks below PDL (1.7873ms)
  ✔ HP_DESC_CPR fires when 3 consecutive falling TC days and PDH is respected (1.5466ms)
  ✔ HP_DESC_CPR is invalidated when close breaks above PDH (1.023ms)
  ✔ HP_ASC_REVERSAL fires when valid ASC setup yesterday is broken below PDL today (0.6961ms)
  ✔ HP_ASC_REVERSAL does NOT fire if yesterday was only a 2-leg match (0.5541ms)
  ✔ HP_DESC_REVERSAL fires when valid DESC setup yesterday is broken above PDH today (0.4695ms)
  ✔ HP_INSIDE_CPR fires when today fully inside yesterday (0.6142ms)
  ✔ HP_OUTSIDE_CPR fires when today fully contains yesterday (0.5656ms)
  ✔ HP_RTP fires when SMA20/SMA50 slopes match sign (0.4579ms)
  ✔ HP_HP_RTP (a) valid crossing matching RTP direction fires (0.5891ms)
  ✔ HP_HP_RTP (b) static position above/below 200 without crossing does not fire (0.4181ms)
  ✔ HP_HP_RTP (c) crossing opposite RTP slope does not fire (0.3896ms)
  ✔ HP_HP_RTP (d) missing sma200 or absent RTP correctly blocks it (1.7195ms)
  ✔ HP_HP_RTP (e) fires correctly on live in-progress crossing (0.6884ms)
  ✔ HP_DIRECT_UP fires on green candle closing decisively above R1 (1.1905ms)
  ✔ HP_DIRECT_DOWN fires on red candle closing decisively below S1 (4.0767ms)
  ✔ HP_REVERSAL_DOWN fires on red candle rejecting R1 after tagging it (0.8784ms)
  ✔ HP_REVERSAL_UP fires on green candle rejecting S1 after tagging it (1.7729ms)
  ✔ Open Tricks signals do not fire when R1/S1 are not touched (0.8874ms)
  ✔ RankingService does NOT score HP_DIRECT_UP + BULLISH (zero-weight until backtested) (0.3449ms)
  ✔ HP_CAM_BULL_BIAS fires when Cam S3 is inside CPR zone (0.5401ms)
  ✔ KGS_CAM_BEAR_BIAS fires when Cam R3 is inside CPR zone (0.5142ms)
  ✔ Existing INSIDE_VALUE logic remains functional and unaffected (0.4029ms)
✔ KGS CPR Theory Signal and Scoring Tests (29.4239ms)
▶ SMA Slope — non-overlapping windows produce meaningful slope
  ✔ rising price series produces sma20Slope > 10 with 40 closes (0.6477ms)
  ✔ falling price series produces negative sma20Slope (0.259ms)
  ✔ insufficient history (< 40 bars) returns sma20Slope = 0 (0.2099ms)
  ✔ flat price series produces sma20Slope = 0 (0.202ms)
✔ SMA Slope — non-overlapping windows produce meaningful slope (2.0599ms)
▶ ScannerService/SignalService — asOfDate Inject and Forwarding
  ✔ scanStock(stock, "2026-06-03") forwards asOfDate, triggers SignalService-only GAP_UP signal (0.8661ms)
  ✔ scanStock(stock, "2026-06-02") does not trigger GAP_UP (0.8092ms)
  ✔ scanStock(stock) with no asOfDate defaults to system IST date (no GAP_UP) (8.4152ms)
✔ ScannerService/SignalService — asOfDate Inject and Forwarding (12.7098ms)
✔ ScannerService degenerate single-candle history (1.1919ms)
▶ Category F — EMA 9/21 + RSI Confluence Scoring
  ✔ EMA_CROSS_BEAR + RSI_BEARISH + BREAKDOWN awards +15 in Category F (0.2596ms)
  ✔ EMA_CROSS_BEAR + RSI_OVERBOUGHT + BREAKDOWN awards +15 in Category F (0.196ms)
  ✔ EMA_CROSS_BEAR + RSI_OVERSOLD + BREAKDOWN does NOT award Category F (late-short trap) (0.241ms)
  ✔ EMA_CROSS_BULL + RSI_STRONG + BREAKOUT awards +15 in Category F (0.3325ms)
  ✔ hasBullishRSI and hasBearishRSI are mutually exclusive (0.7186ms)
✔ Category F — EMA 9/21 + RSI Confluence Scoring (2.6582ms)
▶ SectorRegimeService.applySectorDivergence
  ✔ tags BULLISH stock when sector is net-bearish with enough sample (1.2251ms)
  ✔ does NOT tag on a bull/bear tie (strict > required) (0.3295ms)
  ✔ does NOT tag when sector sample is below minimum (3) (0.2711ms)
  ✔ ignores fallback buckets Other / Unknown / empty sector (0.3968ms)
  ✔ neutral stocks do not count toward the sector sample (0.2552ms)
  ✔ sectors are judged independently (0.2418ms)
✔ SectorRegimeService.applySectorDivergence (4.9272ms)
[ExtensionGate] TEST LONG rejected: EXTENDED_UP dayReturn=3.96% >= 3.5%
▶ stock-intraday.util
  ✔ toYahooNseSymbol appends .NS for plain symbols (1.3188ms)
  ✔ parseStockIntradayMetricsFromChart computes VWAP and closing extremes (49.772ms)
  ✔ parseStockIntradayMetricsFromChart excludes the latest forming closing-window bar (6.3501ms)
✔ stock-intraday.util (59.3275ms)
▶ stock-btst-backtest.helper
  ✔ classifyVduBand matches production thresholds (0.8795ms)
  ✔ classifyScoreBand uses ADVANCED_SCORE floors (0.4046ms)
  ✔ returns not tradable when intraday chart missing (1.4147ms)
  ✔ suppresses LONG in BEAR regime (0.3645ms)
  ✔ requires READY+ when full intraday data present (7.3272ms)
✔ stock-btst-backtest.helper (11.8456ms)
▶ stock-btst-slice-metrics
  ✔ parseStockBtstTradeContext reads nested context (0.5551ms)
  ✔ computeStockBtstSliceMetrics groups by regime and VDU (0.9652ms)
✔ stock-btst-slice-metrics (1.807ms)
▶ getStockBtstCompare
  ✔ excludes breakeven live and backtest trades from win-rate denominators (50.6315ms)
  ✔ returns null win rates when closed trades are all breakeven (11.3982ms)
✔ getStockBtstCompare (64.3868ms)
▶ resolveOvernightConflict — null scores ineligible
  ✔ picks higher non-null side and marks NEUTRAL_CONFLICT when diff < 10 (3.0997ms)
  ✔ does not mark conflict when diff >= 10 (0.3054ms)
  ✔ ignores LONG when score is null — SHORT wins (0.2618ms)
  ✔ ignores SHORT when score is null — LONG wins (0.208ms)
  ✔ returns null direction when both scores are null (0.2423ms)
  ✔ does not coerce null to 0 (null LONG vs SHORT 5 must not create conflict) (0.2125ms)
✔ resolveOvernightConflict — null scores ineligible (6.5211ms)
▶ VDU Option B — score at SPIKE_RATIO (2.0×), gate remains 1.5×
  ✔ does not award VDU at eligibility floor (1.5×) (2.5183ms)
  ✔ awards VDU at SPIKE_RATIO (2.0×) (0.4538ms)
  ✔ STBT mirrors the same VDU scoring threshold (0.865ms)
✔ VDU Option B — score at SPIKE_RATIO (2.0×), gate remains 1.5× (4.2923ms)
[Telegram] TELEGRAM_GROUP_CHAT_ID not set; falling back to personal chat for BTST alert
[Telegram] Failed to send message: telegram error body
✔ escapeTelegramHtml (1.22ms)
▶ sendBtstAlert group-only delivery
  ✔ sends only to the group chat, never to the personal DM (50.5467ms)
  ✔ falls back to the personal chat only when no group is configured (12.636ms)
  ✔ group send failure returns sent=false so claims roll back and retry (1.4046ms)
  ✔ "no qualifying setups" status message also goes to the group (1.1685ms)
  ✔ escapes HTML in symbol and option fields (0.9957ms)
✔ sendBtstAlert group-only delivery (68.1729ms)
▶ Quantitative Trading Logic Fixes
  ✔ Short return calculation math in computeMetricsFromTrades (5.7896ms)
  ✔ calculateCPR classification and trend consistency with ATR% (1.0141ms)
✔ Quantitative Trading Logic Fixes (8.7942ms)
▶ Trend Confluence Shadow Scoring
  ✔ BTST - Fresh bullish cross + RSI 55 -> 15 pts (9.2775ms)
  ✔ BTST - Bullish alignment only + RSI 60 -> 5 pts (1.9044ms)
  ✔ BTST - Bullish alignment + RSI 75 (overbought trap) -> -10 pts (0.4965ms)
  ✔ BTST - Missing RSI or EMA data -> 0 pts, no throw (0.3716ms)
  ✔ STBT - Fresh bearish cross + RSI 45 -> 15 pts (1.4375ms)
  ✔ STBT - Bearish alignment only + RSI 40 -> 5 pts (0.6774ms)
  ✔ STBT - Bearish alignment + RSI 25 (oversold trap) -> -10 pts (0.3825ms)
  ✔ STBT - Missing data -> 0 pts (0.4103ms)
  ✔ Regression check on base score output identity (0.6699ms)
✔ Trend Confluence Shadow Scoring (27.3955ms)
▶ VPA math helpers
  ✔ computeClv returns +1 at close on high (1.4718ms)
  ✔ computeClv returns null on zero range (0.2267ms)
  ✔ computeRvol uses avgVolume denominator safely (0.2452ms)
✔ VPA math helpers (7.4067ms)
▶ scoreVpaBreakoutConfirm
  ✔ returns null when there is no breakout attempt (inside CPR) (1.2716ms)
  ✔ confirms a volume+CLV-backed breakout above CPR (0.2297ms)
  ✔ penalizes a weak breakout attempt above CPR (0.1889ms)
  ✔ confirms a volume+CLV-backed breakdown below CPR (0.2149ms)
  ✔ returns null when SHORT has no breakdown attempt (0.2056ms)
✔ scoreVpaBreakoutConfirm (2.612ms)
▶ VpaConfirmationService.analyze
  ✔ rewards strong RVOL + close near high on LONG (2.2317ms)
  ✔ penalizes weak RVOL on LONG without weak-breakout mislabel (0.7119ms)
  ✔ detects buying climax and recommends reject (0.4823ms)
  ✔ detects absorption (high volume, tiny range) (0.4502ms)
  ✔ detects no demand on narrow up-day (0.6268ms)
  ✔ returns disabled result when VPA_ENABLED=false (1.2912ms)
✔ VpaConfirmationService.analyze (6.7168ms)
▶ BtstRankingService VPA shadow integration
  ✔ does not change the authoritative 130pt score (3.8474ms)
  ✔ returns null score unchanged when inputs invalid (0.4065ms)
✔ BtstRankingService VPA shadow integration (9.655ms)
▶ VPA shadow master kill-switch
  ✔ blocks live confidence/gates while shadow mode is on (default fail-safe) (0.5719ms)
  ✔ allows live confidence/gates only when shadow is off AND live flags are on (0.2674ms)
  ✔ keeps live paths off when shadow is off but live flags remain false (0.326ms)
✔ VPA shadow master kill-switch (1.423ms)
▶ VpaConfirmationService.applyConfidenceDelta
  ✔ leaves confidence unchanged when adjustment is zero (0.2382ms)
  ✔ does not apply non-zero delta while shadow mode blocks live confidence (0.1196ms)
✔ VpaConfirmationService.applyConfidenceDelta (0.5287ms)
▶ VpaConfirmationResult.live flag
  ✔ returns live: false under default shadow mode even if live flags are on (0.7434ms)
  ✔ returns live: true when shadow is off AND confidence live is on (0.9608ms)
  ✔ returns live: true when shadow is off AND gates live is on (0.6132ms)
  ✔ returns live: false when shadow is off but both live flags remain false (0.503ms)
  ✔ returns live: false when VPA is disabled (0.4207ms)
✔ VpaConfirmationResult.live flag (3.6594ms)
▶ scoreVpaClv
  ✔ neutral close (exactly mid-range) does not flag BEARISH for LONG or BULLISH_CLOSE for SHORT (0.2819ms)
  ✔ close in the bottom ~15% of range (e.g. 92 out of 90-110) flags BEARISH for LONG (0.3266ms)
  ✔ close in the top ~15% of range (e.g. 108 out of 90-110) flags BULLISH for LONG (0.1779ms)
✔ scoreVpaClv (1.0047ms)
▶ computeWinRate
  ✔ excludes breakeven trades from the denominator (1.3056ms)
  ✔ returns zero winRate without NaN when there are no decisive trades (0.3684ms)
✔ computeWinRate (3.2576ms)
▶ alignedYahooSeriesLength
  ✔ returns 0 when required series are missing (1.3887ms)
  ✔ truncates to the shortest REQUIRED series only (non-required like volume do not shrink length) (1.6998ms)
  ✔ returns 0 when a required series is shorter than any non-required series (0.2458ms)
✔ alignedYahooSeriesLength (5.1711ms)
▶ intraday parsers handle misaligned Yahoo payloads
  ✔ index parser returns empty when a required series is missing/empty (0.6114ms)
  ✔ stock parser truncates to aligned prefix instead of reading past series end (53.1824ms)
✔ intraday parsers handle misaligned Yahoo payloads (54.1108ms)
ℹ tests 513
ℹ suites 85
ℹ pass 512
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 15334.7623
```

Exit code: **0**

---

## 4. Packaging note for reviewers

`ops/package-repo.ps1` runs `git archive`, which **omits the entire `ops/` directory** due to `.gitattributes` line:

```
ops/ export-ignore
```

Therefore independent zip review cannot confirm `ecosystem.config.cjs` / `mem_watchdog.sh` from the zip alone. They remain git-tracked on this branch; fingerprints in section 2.2 are from the working tree.

**This pass did not change packaging, AGENTS.md, or any code.**

---

## 5. Outstanding known issue (unchanged)

section 0.2 CPR_WEIGHT score-vs-breakdown divergence remains deliberately unresolved. **Not touched** this pass.

---

## 6. Acceptance

**Not self-declared.** Zip + this report for independent review only. `main` not updated by this pass.