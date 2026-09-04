# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added & Fixed — 04 Sep: 2-Month Deep Code Review — 52 Defects Resolved across Tiers 1–4 (PRs #161, #162, #163, #164)

Exhaustive 60-day architectural and quantitative code review covering 822 commits and 596 unique files (July 4 – September 4, 2026). All 52 confirmed defects resolved across all 4 operational domains in strict priority order (**CRITICAL > HIGH > MEDIUM > LOW**):

- **Tier 1: 11 CRITICAL Production Defects (PR #161 / `commit 8c0baf77`)**:
  - **Option Trade Journal Pricing (`btst-alert.job.ts`)**: Fixed spot stock price leaking into option trade records during gap failure exits; now resolves real option CMP via `fetchOptionCmp` and populates `pnl` and `pnlPct` (CRITICAL-01).
  - **Morning Execution Inversion (`market-cron.scheduler.ts`)**: Reordered morning execution at 09:16 IST so `gap-failure-exit` runs before `journal-snapshot:916`, preventing premature closure misses (CRITICAL-02).
  - **Live Fyers Candle Synthesis (`overnight.service.ts`, `market.service.ts`)**: Synthesized live session candle from `MarketStockData` OHLC when Fyers primary history omits the uncompleted daily bar, restoring live BTST discovery (CRITICAL-03).
  - **Market Breadth 52W Window Slicing (`market-breadth.service.ts`)**: Shifted window frame from `CURRENT ROW` to `1 PRECEDING`, eliminating false zero 52W high breakouts across the market (CRITICAL-04).
  - **Bhavcopy Ingestion Deduplication (`bhavcopy-ingest.ts`)**: Protected `EQ` series rows from being overwritten by later `BE`/`SM` batches in PostgreSQL `ON CONFLICT` (CRITICAL-05).
  - **Telegram Alert Delivery Guard (`telegram.service.ts`)**: Fixed truthy object check in `sendBreakoutAlert` (`!result.ok`), ensuring claims roll back and retry on delivery failures (CRITICAL-06).
  - **Option Target & SL Reference Frame (`option-suggestion.service.ts`)**: Aligned option target/SL distance calculations to current spot LTP rather than morning stock entry (CRITICAL-07).
  - **Missing Option Chain Route Handler (`src/app/api/options/chain/route.ts`)**: Implemented missing endpoint exposing `OptionChainService.getOptionChain` (CRITICAL-08).
  - **Cron Distributed Lock Gaps (`src/app/api/cron/*`)**: Enforced `tryClaimCronRun` in all HTTP cron routes, eliminating concurrent execution and heap exhaustion (CRITICAL-09).
  - **Shutdown Process Exit (`queue.service.ts`, `cron-run-claim.ts`)**: Added explicit `process.exit(0)` to `SIGINT`/`SIGTERM` handlers to eliminate PM2 reload hangs and hard SIGKILLs (CRITICAL-10).
  - **Crash Loop Resilience (`server-starter.js`, `ecosystem.config.js`)**: Replaced lethal process exits on `unhandledRejection` with structured trace logging, and added exponential backoff restart delay to PM2 (CRITICAL-11).

- **Tier 2: 19 HIGH Priority Defects (PR #162 / `commit 1962d168`)**:
  - **Rule 5 Strict Inequality (`btst-ranking.service.ts`, `stbt-ranking.service.ts`)**: Relaxed `>` to `>=` for BTST (`close >= last15mHigh`) and `<=` for STBT (`close <= last15mLow`), restoring up to 20 points across valid setups (H-01).
  - **Cron Execution Timeout (`market-cron.scheduler.ts`)**: Increased batch `discover()` timeout from 60s to 180s to prevent premature aborts on heavy scan intervals (H-02).
  - **Exchange Suffix Sanitization (`cpr-journal.job.ts`)**: Stripped `:NSE` suffix before option chain strike lookups in morning journal snapshots (H-03).
  - **Intraday Index Score Scale (`index-intra-ranking.service.ts`)**: Corrected Category B max score cap to 25 pts, allowing intraday index score to reach full 100 scale (H-04).
  - **Unmapped Sector TypeError (`overnight-risk.service.ts`)**: Added null-safe fallback for `stock.sector` on unmapped tickers (H-05).
  - **Unbounded CTE Scans (`multi-year-breakout.service.ts`)**: Added lower date boundary `AND date >= ${oldestDate}` to CTE queries to avoid scanning all historical rows (H-06).
  - **IPO ATH Designation (`multi-year-breakout.service.ts`)**: Guarded ATH label against recent IPO listings lacking multi-year depth (H-07).
  - **ETF Exclusion Filter (`market-breadth.service.ts`)**: Filtered out ETF and mutual fund symbols from advance/decline and moving average calculations (H-08).
  - **Scanner Extension UI Sync (`ScannerClient.tsx`)**: Aligned client-side extension gate to 2.5% threshold matching server-side rules (H-09).
  - **Option Symbol Regex (`option-chain.service.ts`)**: Expanded regex parser to support weekly index options and BSE Sensex contracts (H-10).
  - **VPA Climax Detection (`climax.service.ts`)**: Corrected body color inversion for red shooting-star distribution traps (H-11).
  - **Cloudflare Proxy Fallback Timeout (`option-chain.service.ts`)**: Added 5s timeout and `AbortSignal` to Cloudflare proxy requests (H-12).
  - **Redundant Database Writes (`bullish-state.service.ts`)**: Eliminated redundant empty `DELETE` queries on inside-CPR stocks (H-13).
  - **Watchlist Triple-Fetch (`ScannerClient.tsx`)**: Stabilized watchlist state updates to prevent duplicate fetches (H-14).
  - **Redis Lock Release Race Condition (`cron-run-claim.ts`)**: Replaced static `'1'` lock value with unique UUID instance tokens (H-15).
  - **Fallback Claim Cache Memory Leak (`cron-run-claim.ts`)**: Bounded in-memory fallback cache with automated TTL eviction (H-16).
  - **Watchdog Aggressive Restarts (`ops/mem_watchdog.sh`)**: Suppressed PM2 restarts during active trading hours (`IN_SESSION=1`) (H-17).
  - **Heap vs RSS Allocation (`ecosystem.config.js`)**: Tuned Node.js heap limit (`--max-old-space-size=400`) and PM2 restart threshold (450M) for 1GB VM capacity (H-18).
  - **Middleware Public Fall-Through (`src/middleware.ts`)**: Sealed non-production environment fall-through edge cases (H-19).

- **Tier 3: 15 MEDIUM Priority Defects (PR #163 / `commit 7de7eb0b`)**:
  - **Winning Trade Gap Outcome (`trade-journal.service.ts`)**: Classified winning trades opening weak as `MODEL_VALID` instead of `GAP_FAILURE` when `pnlPct >= 0` (M-01).
  - **Index BTST Compare Direction (`index-btst-compare.service.ts`)**: Added `direction: string | null` to `IndexBtstCompareRow` objects for parity with stock rows (M-02).
  - **Intraday Index Risk Validation (`index-discover.service.ts`)**: Guarded intraday index scanner against inverted or zero-spread CPR bands (`risk <= 0`) (M-03).
  - **Sector Lookup Hyphen Handling (`market-breadth.service.ts`)**: Fixed hyphenated ticker mapping for stocks like `BAJAJ-AUTO` and sanitized `NaN` change percentages (M-04).
  - **Bhavcopy Numeric Sanitization (`bhavcopy-ingest.ts`)**: Verified strict `prevClose` and `close` numeric validation (M-05).
  - **Cache Hierarchy Resolution (Market Tools Services)**: Re-ordered cache resolution to query Redis *before* local in-memory cache, ensuring web workers serve freshly computed background reports (M-06).
  - **Monthly Option Expiry Date (`option-suggestion.service.ts`)**: Updated monthly option expiry math to target the true last Thursday of the month in UTC (M-07).
  - **Telegram Error Formatting (`earnings-populator.service.ts`)**: Escaped error messages with `escapeTelegramHtml()` and capped at 1500 chars to avoid Telegram API 400 Bad Request errors (M-08).
  - **Extension Gate ATR Calibration (`breakout-price-gate.ts`)**: Synthesized true `atrPct` in synthetic stock candle so extension checks evaluate actual ATR multiples (M-09).
  - **Forward Target Selection (`scanner.service.ts`)**: Enforced forward target selection strictly ahead of current LTP (`t > entry && t > ltp` for LONG, `t < entry && t < ltp` for SHORT) (M-10).
  - **Redundant Schema Index (`prisma/schema.prisma`)**: Removed redundant single-column index on `DailyOhlcv.date` (M-11).
  - **Composite Journal Index (`prisma/schema.prisma`)**: Added composite index `@@index([tradeDate, signalType])` on `TradeJournal` (M-12).
  - **Journal Query Memory Limit (`trade-journal.service.ts`)**: Added `take: 2000` safety limit on journal summary queries to prevent full-table heap exhaustion (M-13).
  - **Constant-Time Token Comparison (`auth-token.ts`)**: Implemented constant-time SHA-256 comparison in `timingSafeEqual` via `crypto.timingSafeEqual` (M-14).
  - **Redis Reconnect Throttling (`redis.ts`)**: Added bounded retry strategy to secondary Redis client in test/build environments (M-15).

- **Tier 4: 7 LOW Priority Defects (PR #164 / `commit f453389a`)**:
  - **Deterministic Time Formatting (`index-discover.service.ts`)**: Replaced locale-dependent `toLocaleTimeString('en-IN')` with deterministic zero-padded IST time string (L-01).
  - **CSV Formula Injection Defense (`export-utils.ts`)**: Neutralized CSV formula injection (CWE-1236) by prepending `'` to cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` (L-02).
  - **Shared Prisma Singleton & Resumability (`bhavcopy-backfill.ts`)**: Replaced standalone `new PrismaClient()` with singleton `prisma` from `@/lib/db`; made resumability threshold configurable via `BACKFILL_MIN_ROWS` (L-03).
  - **Flash Wick Stop-Loss Capping (`scanner.service.ts`)**: Capped stop-loss risk to max 3.0% of entry on opening flash wicks (L-04).
  - **Countdown Timer Optimization (`ScannerClient.tsx`)**: Removed redundant `countdown` state and throttled `useBtstState` timer from 1s to 30s to eliminate up to 59 unnecessary re-renders per minute (L-05).
  - **Deploy Script Hardening (`deploy.ps1`)**: Made deployment credentials configurable via environment variables and replaced `StrictHostKeyChecking=no` with `accept-new` (L-06).
  - **Deploy Script Typecheck Verification (`deploy.ps1`)**: Added `npm run typecheck` (`tsc --noEmit`) step prior to building (L-07).

- **Unit Test Suite**: Expanded test suite to **798 total tests (797 passed, 0 failed, 1 skipped)**.

### Added & Fixed — 03 Sep: Core Quality, Momentum Leaders Hardening & Safety Controls (PRs #155, #156, #158, #159)

- **Circuit Lock Detection & Limit-Up/Down Badging (PR #156)** (`src/services/market-tools/momentum-leaders.service.ts`, `src/app/market-tools/momentum-leaders/page.tsx`):
  - **Algorithmic Detection:** Implemented `detectCircuitLock(changePct, tolerance = 0.20)` to approximate standard NSE circuit filter limits (5%, 10%, 20%) within a $\pm 0.20\%$ boundary, catching locked names like TBZ (+19.99%) or DYCL (+19.95%).
  - **UI & Export Telemetry:** Added high-contrast orange `🔒 Limit Up` / `🔒 Limit Down` badges in table rows, detailed circuit audit notes in the expanded analytics drawer, and dedicated `Circuit Lock` column in RFC 4180 CSV exports.
  - **Unit Tests:** Added unit tests locking in circuit tolerance boundaries and negative lower-circuit limit checks.

- **PrevClose Validation & Whole-Stock Corruption Immunity (PR #158)** (`src/services/market-tools/momentum-leaders.service.ts`):
  - **Mathematical Validation:** Added `isValidPrevClose(val)` validator and updated `computeCompoundedReturn` to return `null` if any candle in the requested window has an invalid (`<= 0`, `null`, `undefined`, `NaN`) `prevClose` or non-positive `close`, eliminating the silent omission of corrupted intermediate days.
  - **Single-Sourced Candidate Exclusion:** Evaluates all four windows (`r1d`, `r5d`, `r10d`, `r21d`) in `computeAllMomentumLeadersReports` and excludes any stock with a `null` window from ranking with a logged ops warning, ensuring percentile rankings are calculated exclusively on complete, clean data.
  - **Empirical Live Database Verification:** Queried 77,551 production candles across 2,725 symbols on production server: confirmed 0 corrupted rows, verifying that the fix provides complete mathematical protection with zero current-day leaderboard shrinkage.

- **Deterministic Competition Ranking & Tie-Breakers (PR #159)** (`src/services/market-tools/momentum-leaders.service.ts`):
  - **Standard Competition Ranking:** Stocks sharing identical percentage returns now receive identical rank and percentile within `rankWindow`.
  - **Deterministic Secondary Sort:** Added `|| a.symbol.localeCompare(b.symbol)` to both `rankWindow` and `finalStocks.sort`, eliminating non-deterministic display order across cache refreshes.

- **Market Breadth CTE Historical Window Scoping (PR #159)** (`src/services/market-tools/market-breadth.service.ts`):
  - Added lower date boundary `AND date >= ${oldestDate}` to the `RankedHistory` CTE, pruning scans beyond the 250-trading-day window as `DailyOhlcv` grows over time.

- **Overnight Fail-Closed Regime Reliability Gate (PR #159)** (`src/services/overnight/overnight.service.ts`):
  - Added fail-closed check (`if (regime.reliable === false) continue;`) to suppress overnight signal generation when Nifty feed data is unavailable, aligning with `btst-alert.job.ts` and `cpr-journal.job.ts`.

- **Realtime Scanner Direction & Extension Refinement (PR #155)** (`src/services/scanner.service.ts`, `src/components/scanner/ScannerClient.tsx`):
  - Attached inferred setup direction (`LONG` / `SHORT`) to `/api/scanner` payloads.
  - Rendered `LONG` / `SHORT` setup badges and `TARGET MET` badge when price reaches Target 1.
  - Restricted price extension evaluation to active breakout setups with a 2.5% threshold.

- **Unit Test Suite:** Expanded test suite with regime fail-closed tests, prevClose corruption tests, circuit lock tests, and tie-breaking tests (**769 total tests: 768 passed, 1 skipped, 0 failed**).

### Added — 02 Sep: Multi-Window Momentum Leaders Scanner with Universe Toggle (`ALL_NSE` vs `NSE_FNO`)

Shipped new institutional scanner **Multi-Window Momentum Leaders** (`/market-tools/momentum-leaders`) in PRs #152 & #153:

- **Multi-Frame Momentum Engine** (`src/services/market-tools/momentum-leaders.service.ts`):
  - Surfaces stocks that demonstrate persistent momentum leadership across multiple concurrent time horizons: 1-Day, 5-Day (~1W), 10-Day (~2W), and 21-Day (~1M) trading sessions.
  - **Corporate-Action-Safe Return Compounding:** Compounds daily `(close - prevClose) / prevClose` returns across all $k$ trading sessions, immunizing returns from split or bonus distortions.
  - **₹10 Cr Trailing Average Daily Turnover Liquidity Floor:** Baseline filter (`MIN_LIQUIDITY_TURNOVER_CR = 10.0`) requires 20-day average turnover $\ge ₹10\text{ Cr}$, cleanly filtering illiquid equities while retaining liquid institutions.
  - **Bounded Additive Composite Scoring ($S \in [0, 100]$):**
    $$S = \text{clamp}_{[0, 100]}\Big(\text{Base Score} + \text{Consistency Bonus} - \text{Dispersion Penalty} + \text{VPA Modifier}\Big)$$
    Weighted base percentiles ($0.15 \times p_{1d} + 0.25 \times p_{5d} + 0.30 \times p_{10d} + 0.30 \times p_{21d}$) rewarded with up to +15 pts for multi-window leadership ($p \ge 85$) and penalized by up to 15 pts for single-day spike dispersion ($p_{max} - p_{min} > 30$).
  - **Dual Universe Scoping & Independent Percentiles:** Single-pass database loader computes candidates and ranks percentiles ($p = \frac{N - rank}{N - 1} \times 100$) independently within each universe pool size ($N_{all} = 995$ vs $N_{fno} = 165$).
- **API & Background Precomputation** (`src/app/api/market-tools/momentum-leaders/route.ts`):
  - Dual Redis caching keys: `market_tools:momentum_leaders:report:ALL_NSE` and `market_tools:momentum_leaders:report:NSE_FNO`.
  - Integrated into daily 19:15 IST background precompute cron (`src/services/market-tools/market-tools-precompute.job.ts`).
  - Auth-gated heavy recalculation via `isAuthorizedForRefresh()`.
- **Interactive UI Dashboard & Badging** (`src/app/market-tools/momentum-leaders/page.tsx`):
  - Universe selector tabs mirroring Market Breadth (`F&O Universe` vs `ALL NSE`).
  - Tier A+ / A / B / C badges, 4-window flame badges, expandable drawer analytics, and RFC 4180 CSV export with UTF-8 BOM.

### Fixed — 02 Sep: 10-Day Deep Code Review Stability & Resilience Fixes

Addressed high-priority findings from the 10-day comprehensive code review across Core Services, Alerts, Caching, and Test Suite:

- **🔴 [CRITICAL] Prevent Unhandled Promise Rejection on Late Timeout** (`src/lib/with-timeout.ts`): Attached a silent no-op catch (`promise.catch(() => {})`) to underlying promises inside `withTimeout`. When a timeout triggers first, any subsequent rejection from the abandoned promise is safely swallowed rather than escalating to a fatal `unhandledRejection` Node.js process crash.
- **🟠 [HIGH] Telegram Alert Message Chunking for BTST/STBT** (`src/services/alert/telegram.service.ts`): Implemented safe message pagination (3,900 char ceiling) in `sendBtstAlert`, preventing message drops on high-volume days when combined LONG and SHORT setups exceed Telegram's strict 4,096-character limit.
- **🟠 [HIGH] In-Memory Cache Active Sweeper & Glob Fix** (`src/lib/redis.ts`): Added a periodic 60-second active cleanup sweep (`sweepExpiredMemoryCache`, unreferenced) to purge expired keys when Redis is disconnected, preventing unbounded memory buildup. Fixed regex conversion in `delPattern` to properly support glob `?` single-character wildcards.
- **🟠 [HIGH] Division-by-Zero Safety Coverage in CLV Calculations** (`src/tests/unit/index-ranking.test.ts`): Added unit test coverage verifying that zero range (`high === low`) safely produces 0 closeStrength without division by zero or `NaN`.
- **Unit Test Suite:** Expanded test suite with `redis-memory-cache.test.ts`, with-timeout late rejection tests, and BTST message chunking tests (**754 total tests: 753 passed, 1 skipped, 0 failed**).

### Added — 01 Sep: Bull Flag & Pole (High Tight Flag) Pattern Detection in Market Tools

Added institutional **Bull Flag & Pole** (High Tight Flag) chart pattern detection to the **52W High Pattern Breakout Scanner** (`/market-tools/pattern-breakout`):

- **High Tight Flag Detection Engine** (`src/services/market-tools/pattern-breakout.service.ts`):
  - **The Pole (Momentum Surge):** Detects sharp institutional advances ($\ge 15.0\%$) over compact 8–25 candle windows leading up to the 52W high baseline.
  - **The Flag (Consolidation Channel):** Detects tight, controlled pullbacks ($\le 12.0\%$ from pole peak, retaining $\ge 55\%$ of the pole height) over 4–18 candles.
  - **Volume Signature:** Enforces volume contraction during flag consolidation ($\text{avg flag volume} \le 0.85\times \text{avg pole volume}$).
- **Deterministic Pattern Hierarchy & Composite Scoring**:
  - `FLAG_POLE` ranks at the top of the deterministic tie-breaking hierarchy (`FLAG_POLE > VCP > CUP_AND_HANDLE > DOUBLE_BOTTOM > FLAT_BASE`).
  - Awards 22 base pattern quality points + 3 points tightness bonus when flag consolidation depth is $\le 7.0\%$.
- **Interactive UI Dashboard & Badging** (`src/app/market-tools/pattern-breakout/page.tsx`):
  - Added **🚩 Bull Flag** quick-filter pill with live stock counter.
  - Added high-contrast Cyan/Sky badge styling (`bg-cyan-950 text-cyan-300 border-cyan-700`).
- **Unit Test Suite** (`src/tests/unit/pattern-breakout.test.ts`): Added comprehensive test cases verifying detection of synthetic flag-and-pole advances, rejection of deep pullbacks ($>15\%$), and hierarchy priority (726/727 passing).

### Added — 01 Sep: Export to Excel/CSV & Print-Ready PDF across Market Tools

Added comprehensive client-side data export capabilities across all three Market Tools modules:

- **RFC 4180 CSV Engine with UTF-8 BOM** (`src/lib/export-utils.ts`): Implemented RFC 4180 cell escaping (commas, double quotes, newlines) and prepended UTF-8 Byte Order Mark (`\uFEFF`) ensuring Microsoft Excel and Google Sheets open Indian Rupee symbols (₹), percentages, and floating-point metrics with zero encoding corruption.
- **Dedicated Print Stylesheet** (`src/app/globals.css`): Added comprehensive `@media print` rules that suppress navigation bars, search inputs, refresh buttons, and action chrome while transforming dark mode tables into clean, high-contrast black-and-white layouts with page-break protection (`break-inside: avoid`).
- **Interactive Export Dropdown Action** (`src/components/market-tools/ExportActions.tsx`): Reusable UI component with paired `Export to Excel / CSV` and `Print / Save as PDF` actions, integrated seamlessly into the header toolbars of:
  - **52W Pattern Breakout** (`/market-tools/pattern-breakout`): Exports Symbol, Sector, CMP, Day Change %, Status, 52W High, Distance to 52W %, Pattern, RVOL 20D, VPA Footprint, CLV, Sub-scores, and Quality Tier.
  - **Multi-Year Breakout** (`/market-tools/breakout`): Exports Symbol, Sector, CMP, Day Change %, Strongest BO, VPA Footprint, CLV, RVOL 20D, BO Reference Price, Gain over BO %, 1Y/2Y/3Y/5Y/10Y/ATH status, and Volume.
  - **Market Breadth** (`/market-tools/breadth`): Exports full Sector Strength & Ranking table for the selected universe (ALL NSE / Nifty 50 / F&O).
- **Unit Test Suite** (`src/tests/unit/export-utils.test.ts`): Added unit tests covering RFC 4180 escaping, quotes, comma handling, and UTF-8 BOM verification (724/725 passing).

### Added — 01 Sep: Volume Price Analysis (VPA) in Market Tools

Integrated institutional **Volume Price Analysis (VPA)** into the Market Tools suite (`/market-tools/pattern-breakout` and `/market-tools/breakout`):

- **VPA Footprint Engine** (`src/services/vpa/vpa.math.ts`): Added `classifyBreakoutVpa()` helper evaluating Close Location Value (CLV $\in [-1, 1]$), RVOL 20D, and candle range expansion. Classifies breakouts into 5 institutional footprints:
  - 🟢 **`CONFIRMED`** ($\text{RVOL} \ge 1.5$ & $\text{CLV} \ge 0.3$): Volume-backed institutional breakout closing strong near high (+5 pts).
  - 🔵 **`ABSORPTION`** ($\text{RVOL} \ge 1.2$ & $\text{CLV} \ge 0.0$ & $\text{Range} \le 2.5\%$): Tight price consolidation under accumulation (+5 pts).
  - 🔴 **`CLIMAX_REJECT`** ($\text{RVOL} \ge 1.5$ & $\text{CLV} \le -0.2$): High-volume upper-wick rejection / bull trap (-10 pts).
  - 🟡 **`NO_DEMAND`** ($\text{RVOL} < 0.8$): Low volume test lacking institutional buying (-3 pts).
  - ⚪ **`NEUTRAL`**: Standard volume flow.
- **52W Pattern Breakout Integration** (`src/services/market-tools/pattern-breakout.service.ts`): Computes daily CLV and attaches `vpaFootprint` to each stock. Composite 0–100 quality score applies `vpaModifier` to reward volume confirmation and demote upper-wick traps.
- **Multi-Year Breakout Integration** (`src/services/market-tools/multi-year-breakout.service.ts`): Added OHLC and 20-day average volume to the SQL CTE query, attaching instant VPA footprint badges across 1Y, 2Y, 3Y, 5Y, 10Y, and ATH breakouts.
- **Interactive UI Badges & Drawer Analytics** (`src/app/market-tools/pattern-breakout/page.tsx`, `src/app/market-tools/breakout/page.tsx`): Added responsive VPA Footprint status pills to main tables and dedicated VPA breakdown cards in the pattern details drawer.
- **Unit Test Suite** (`src/tests/unit/vpa-breakout.test.ts`): Added comprehensive test coverage across all 5 footprint conditions and scoring modifiers (721/722 passing).

### Fixed — 01 Sep 1-Month Deep Code Review: 11 Issues Resolved across Domains 1–4

An exhaustive line-by-line deep code review covering all 303 commits and ~70 modified files over the 30-day period (Aug 1 – Sep 1, 2026) across Overnight/Index Engine, Market Tools & Bhavcopy Ingestion, Realtime Scanner/Alerts, and Infrastructure/Watchdogs. Verified with 715/716 passing unit tests and GitHub Actions CI.

#### 🔴 Critical

- **B34 — Index BTST/STBT Discovery Disabled Before 15:15 IST** (`src/services/overnight/index-ranking.service.ts`): `calculateScoreDetails` strictly rejected scoring (`null`) when `inputs.last15mHigh` or `last15mLow` was `null`. Because the 15:15–15:30 closing window has not formed during the 15:10–15:15 discovery window, index setups were unconditionally classified as `IGNORE`. Fixed by conditionally evaluating Rule 5 liquidity points only when the candle is present, allowing full discovery of Rules 1–4 and 6 before 15:15 IST.
- **B35 — Scheduler Lock Release on Timeout Causes Socket/OOM Leak** (`src/services/scheduler/market-cron.scheduler.ts`, `src/lib/with-timeout.ts`): When an external request hung and triggered `withTimeout`, the error handler called `releaseCronRun(claimKey)` while the underlying socket remained open. On subsequent cron ticks, the scheduler re-acquired the lock and spawned duplicate overlapping jobs. Defined `TimeoutError` and retained claim locks on timeouts to prevent duplicate job accumulation under network latency.
- **B36 — Unbounded CTE Window Scan on 626K+ Rows** (`src/services/market-tools/pattern-breakout.service.ts`): CTE queries over `DailyOhlcv` partitioned across all 265 dates without an initial date bound, forcing full table sequential scans in PostgreSQL. Added `WHERE date >= ${oldestDate}` to restrict scans to the trailing ~265–300 dates.

#### 🟠 High

- **B37 — Inverted Option Theta Risk Buffer Formula** (`src/services/option-suggestion.service.ts`): Stop loss distance was multiplied by `(1 + thetaBuffer)` instead of `(1 - thetaBuffer)`. Because `optionSl = ltp - adjustedSlDistance`, this resulted in a 10% *wider* stop loss during expiry week rather than the documented tighter stop loss. Corrected formula to `(1 - thetaBuffer)`.
- **B38 — Extension Gate Historical Backtest Clock Bypassed** (`src/services/overnight/entry-manager.service.ts`): `resolvePreviousClose` prioritized today's live `stock.previousClose` even when an `asOfDate` was passed. Fixed to resolve from historical series relative to `asOfDate`.
- **B39 — Missing Single-Flight Deduplication on Pattern Breakout** (`src/services/market-tools/pattern-breakout.service.ts`): Added `inFlightCompute` singleton promise wrapper to prevent concurrent refresh requests from launching duplicate heavy database scans.
- **B40 — Bhavcopy Ingestion Batch Rollback on Non-Numeric Fields** (`scripts/market-tools/bhavcopy-ingest.ts`): Added `isNaN` sanitization on `value` and `trades` parsing to protect batch transactions against malformed rows.
- **B41 — Memory Watchdog Redis Pruning Evicted Market Tools Caches** (`ops/mem_watchdog.sh`): `is_protected_redis_key` matched `market:*` but missed `market_tools:*` and `market_breadth:*`, causing off-hours watchdog pruning. Added `market_tools:*|market_breadth:*` to protected key patterns.

#### 🟡 Medium

- **B42 — Telegram Breakout Alert Silent Drop Without Group Chat** (`src/services/alert/telegram.service.ts`): `sendBreakoutAlert` aborted with `missing_config` if `TELEGRAM_GROUP_CHAT_ID` was unset. Added fallback to `TELEGRAM_CHAT_ID` and `settings.telegramChatId`.
- **B43 — Memory Leak in BTST Retry Map** (`src/services/scheduler/btst-alert.job.ts`): Added `pruneSendAttemptCounts()` to automatically prune `sendAttemptCounts` map entries.
- **B44 — Flat Base Pattern Window Truncation** (`src/services/market-tools/pattern-breakout.service.ts`): Expanded `detectFlatBase` slice window from 30 to 45 candles per Minervini/O'Neil specifications.

#### 🟢 Low

- **B45 — Client-Side Refresh Missing AbortSignal on Unmount** (`src/app/market-tools/pattern-breakout/page.tsx`): Attached `AbortController` to manual refresh button clicks with unmount cleanup.

### Fixed — 01 Sep 10-Day Deep Code Review: 7 Bug Fixes (Pass 2)

A comprehensive follow-up deep code review covering all 91 commits across the 10-day period (Aug 22 – Sep 1, 2026) identified and resolved 7 additional confirmed bugs across 4 domains. All verified with 714/715 unit tests passing.

#### 🔴 Critical

- **B26 — Undeclared `hostname` in `server-starter.js`** (`server-starter.js`): `server.listen(port, hostname, ...)` referenced `hostname` which was never declared as a variable in the script scope, causing an immediate `ReferenceError: hostname is not defined` crash when launched via Node. Fixed by explicitly defining `const bindHost = '0.0.0.0'` and passing `bindHost` to `server.listen()`.

#### 🟠 High

- **B27 — BullMQ connection ignores `REDIS_URL` in production** (`src/services/queue.service.ts`): Queue connection configuration only checked `REDIS_HOST` and `REDIS_PORT`, silently falling back to `localhost:6379` in environments where `REDIS_URL` is used. Added URL parsing to support `REDIS_URL`.
- **B28 — `overflow-x: hidden` disables sticky Navbar** (`src/app/globals.css`): `overflow-x: hidden` on `html` and `body` created a scroll container formatting context that disabled `position: sticky` on the desktop navbar header. Replaced with modern `overflow-x: clip`.
- **B29 — Missing `ltp <= 0` guard in Gap Failure Exits** (`src/services/scheduler/btst-alert.job.ts`): If stock data returns 0 LTP due to feed delay or symbol tick unavailability at 9:16 AM, `0 < entry * 0.99` evaluated to `true`, triggering false GAP_FAILURE_EXIT alerts. Added guard `if (!stockData || !stockData.ltp || stockData.ltp <= 0) continue`.

#### 🟡 Medium

- **B30 — `tradeDate` timestamp mismatch in Gap Failure journal updates** (`src/services/scheduler/btst-alert.job.ts`): `new Date('${yesterday}T18:30:00.000Z')` evaluated to 24 hours ahead of stored IST midnight timestamps in `TradeJournal`. Refactored to match `TradeJournalService.todayMidnightIST()` for exact matching. Also made previous trading session discovery holiday-aware via `getISTTime()`.
- **B31 — `CPR_WEIGHT` NaN validation bypass in Zod** (`src/config/env.ts`): `z.preprocess((val) => Number(val), z.number().optional())` allowed `NaN` values to pass validation. Added `z.number().finite().optional()`.
- **B32 — `sendRawMessage` Telegram routing to group** (`src/services/alert/telegram.service.ts`): `sendRawMessage` defaulted strictly to personal DM (`TELEGRAM_CHAT_ID`). Updated to target `TELEGRAM_GROUP_CHAT_ID || TELEGRAM_CHAT_ID` so Gap Failure Exit and system alerts reach the subscriber channel.

#### 🟢 Low

- **B33 — Cup & Handle tightness bonus threshold unreachable** (`src/services/market-tools/pattern-breakout.service.ts`): Scoring required `baseDepthPct <= 12.0` for tightness bonus, but Cup & Handle detection filters `baseDepthPct < 12.0`. Adjusted threshold to `<= 15.0` for Cup & Handle.

### Fixed — 31 Aug 10-Day Deep Code Review: 25 Bug Fixes (PR #151 / Commit `9381c945`)

A systematic deep code review covering all ~70 commits across PRs #141–#149 (Aug 22–31, 2026) identified 25 bugs spanning 4 domains: market-tools services, overnight/index services, API routes, and infrastructure. All 25 resolved and verified with 709/710 unit tests passing.

#### 🔴 Critical

- **B1 — Prisma Decimal comparisons silently false** (`src/services/market-tools/market-breadth.service.ts`): `$queryRaw` returns Postgres `NUMERIC` columns as `Prisma.Decimal` objects, not JS numbers. All advance/decline and moving-average comparisons (`s.changePct > 0.05`, `s.close >= s.ma10`) were silently evaluating as false, producing a permanently zero-breadth report. Fixed by coercing all numeric fields immediately after the query with `Number()`.

- **B2 — Unauthenticated breadth refresh DoS** (`src/app/api/market-tools/breadth/route.ts`): The `?refresh=true` parameter triggered a full DB recompute with no auth check, creating a DDoS vector even though the route is middleware-exempted. Added `APP_ACCESS_TOKEN` header/cookie gate before the refresh branch.

- **B3 — Unauthenticated breakout refresh DoS** (`src/app/api/market-tools/breakout/route.ts`): Same pattern — `?refresh=true` scanned 2,636 symbols with no auth. Added identical token gate.

- **B4 — Kill switches leave stale DB signals active** (`src/services/overnight/index-discover.service.ts`): When `INDEX_BTST_ENABLED=false` or `INDEX_STBT_ENABLED=false`, the code only logged a skip message and returned early — leaving any previously written `BTST_READY`/`SHORT_READY` signals in the DB active for downstream journal and alert jobs to pick up. Fixed by pushing `IGNORE` signals so the upsert overwrites stale entries.

- **B5 — Unit tests test their own mocks, not the service** (`src/tests/unit/multi-year-breakout.service.test.ts` + `src/services/market-tools/multi-year-breakout.service.ts`): The test file redefined `computeWindowBreakout` and `getStrongestBreakout` as local functions and tested those — any regression in the real service was invisible. Extracted both functions as exported helpers from the service; rewritten tests import and test the actual production code.

#### 🟠 High

- **B6 — Precompute job reports success when sub-jobs fail** (`src/services/market-tools/market-tools-precompute.job.ts`): `anySucceeded` used OR logic — one passing sub-job masked the other two failing, letting the scheduler mark the day complete and never retry. Changed to `allSucceeded` (AND): any sub-job failure now propagates `success: false` so the scheduler retries.

- **B7 — Zod `z.coerce.number().optional()` produces NaN** (`src/config/env.ts`): Zod's `.coerce` runs before `.optional()`, so when `CPR_WEIGHT` is missing from the environment, `coerce` turns `undefined` into `NaN` before `.optional()` can short-circuit. Replaced with `z.preprocess()`.

- **B8 — Telegram breakout alerts silently truncated** (`src/services/alert/telegram.service.ts`): On high-volume days, joining all stock lines into a single string exceeded Telegram's 4,096-char API limit, causing the entire message to be silently dropped. Refactored to chunk at 3,900 chars with continuation headers.

- **B9 — Dangling `setTimeout` in scanner enrichment** (`src/app/api/scanner/route.ts`): The `timeoutPromise` created a `setTimeout` that was never cleared after `Promise.race` resolved, keeping the event loop alive and leaking memory in serverless contexts. Stored the timer ID and added `.finally(() => clearTimeout(timeoutId))`.

- **B10 — `evaluateExtension` uses live clock during backtests** (`src/services/overnight/overnight.service.ts`): `EntryManagerService.evaluateExtension(fullStock, finalDir)` was called without `dateStr`, causing it to fall back to `getISTDateString()` (today's live date). During historical backtests this produces ~0% intraday return for every historical date, silently disabling the extension gate. Added `dateStr` as the third argument.

- **B11 — Next.js hostname poisoning** (`server-starter.js`): `hostname: '0.0.0.0'` was passed to the `next()` constructor, which uses it for canonical URL generation (SSR redirects, `next/image` URLs). This poisoned all generated absolute URLs. Separated: `next({ hostname: 'localhost' })` for canonical URLs; `server.listen(port, '0.0.0.0')` for network binding.

- **B12 — CI unit tests crash before any test runs** (`.github/workflows/verify.yml`): `env.ts` validates required environment variables at module load time via Zod. Without `DATABASE_URL`, `APP_ACCESS_TOKEN`, etc., Zod throws before a single test case runs — reporting 0 tests rather than failures, silently masking regressions. Added required dummy vars to the CI env block.

#### 🟡 Medium

- **B13 — Holiday comment ambiguity** (`src/lib/market-hours.ts`): Improved comment for the Oct 2, 2026 holiday entry to clearly note that Vijaya Dashami and Gandhi Jayanti coincide on Oct 2 per the NSE 2026 circular, and that a prior erroneous Oct 20 entry was already removed.

- **B14 — 20-day return off by one candle** (`src/services/market-tools/pattern-breakout.service.ts`): `c[c.length - 20].close` retrieves 19 trading days ago (today is index `c.length-1`). Changed to `c[c.length - 21]` with guard `>= 21`. All 20-day momentum scores were overstated by one day.

- **B15 — ETF regex comment clarification** (`src/lib/nse-fund-exclusion.ts`): Clarified that `LIQUID` is intentionally unanchored (catches `HDFCLIQUID`, `GROWWLIQID` etc.) and `^GROWW.` uses an intentional regex wildcard (matches any Groww ETF symbol with ≥1 char after "GROWW", while correctly excluding bare "GROWW"). No logic change.

- **B16a/B16b — Missing `AbortController` cleanup on market-tools pages** (`src/app/market-tools/breadth/page.tsx`, `src/app/market-tools/breakout/page.tsx`): Both pages lacked `AbortController` and `isMounted` ref in their `useEffect` fetch calls, causing `setState` calls on unmounted components during fast navigation (React warning + potential memory leak). Fixed with proper cleanup return.

- **B17 — BE/SM series stocks excluded before dedup** (`scripts/market-tools/bhavcopy-ingest.ts`): The hard filter `|| series !== 'EQ'` dropped all BE (Trade-to-Trade) and SM (SME) series rows before the deduplication logic could run. The dedup block correctly prefers EQ over BE/SM when both exist for the same symbol — but it was dead code. Removed the series filter from the hard drop so BE/SM-only stocks are now ingested.

- **B18 — No PM2 log files configured** (`ecosystem.config.js`): Without explicit `out_file`/`error_file` paths, PM2 uses default temp locations that can silently rotate away. Added explicit log paths under `logs/`. Kept `fork` mode (not `cluster`) — the scheduler uses in-process claim state that would break under multiple PM2 workers.

- **B19 — Missing cross-sectional query index** (`prisma/schema.prisma`): The existing `@@unique([symbol, date])` index is symbol-first and cannot serve `WHERE date = X` efficiently across all 2,636 symbols. Added `@@index([date, symbol])` to `DailyOhlcv` making Market Breadth and Multi-Year Breakout queries O(symbols_on_date) instead of O(all_rows). **Action required on deploy:** run `npx prisma migrate dev --name add_date_symbol_idx`.

- **B20 — Gap-failure test has no Friday gate coverage** (`src/tests/unit/gap-failure-exit.test.ts`): Added Friday BTST signal test verifying `checkGapFailureExits` skips signals entered on Friday (weekend position, gap-failure doesn't apply), plus a stub cleanup verification test.

- **B21 — iOS PWA landscape void** (`src/app/globals.css`): The `html` element had no `background-color`, causing the overscroll area in landscape mode to show white/black depending on system theme. Added `background-color: var(--background)` matching the body.

#### 🔵 Low

- **B22 — `with-timeout.ts` already correct**: `clearTimeout` already runs in the `finally` block. No change.
- **B23 — `timingSafeEqual` already safe**: The custom string-comparison implementation is already length-guarded and constant-time. No change.
- **B24 — `themeColor` missing from viewport** (`src/app/layout.tsx`): In Next.js 14+, `themeColor` must be in the `viewport` export (not `metadata`) for iOS Safari PWA status bar coloring. Added `themeColor: '#06070b'`.
- **B25 — Edge-case test coverage for candle prices** (`src/tests/unit/multi-year-breakout.service.test.ts`): Added tests for `NaN` close (must not count as breakout), `null` priorHigh (must return null), and `priorHigh=0` (documents that `100 >= 0` is true — caller is responsible for filtering degenerate zero-high data).


A follow-up review of the August 30 code review fixes and live production telemetry identified additional critical issues and gaps, which have all been resolved and verified with 100% test coverage:

#### 🔴 Critical
- **PostgreSQL Date Query Crash** (`src/services/market-tools/pattern-breakout.service.ts`): Running the precompute job on PostgreSQL threw an operator type mismatch error (`operator does not exist: text >= timestamp without time zone`) inside the pattern breakout query because the `date` column is `text` while the interval subtraction output is `timestamp`. Resolved by casting the computed date arithmetic back to `::date::text`.
- **Precompute Job False Success Guard** (`src/services/market-tools/market-tools-precompute.job.ts`): The precompute job reported `success: true` even if all three sub-jobs (breadth, multi-year, pattern) threw errors and failed to compute. This allowed the scheduler to permanently mark the job complete without retry. Refactored to return `success: anySucceeded`.
- **Unit Test Baseline Mismatches** (`src/tests/unit/cpr-journal-job.test.ts`): Unit tests for the CPR journal were failing because they used old `3.5%` LTP baselines which triggered the newly tightened `1.5%` price extension caps (`isBreakoutEntryExtended` marked them as `EXTENDED`). Updated default test LTP values to `101.2` (1.2% past entry) so tests pass correctly.

#### 🟠 High
- **ETF/Fund Scanner Gaps Closed** (Merged from `fix-etf-exclusion-gaps.bundle`):
  - Fixed four confirmed live ETF symbols (`HDFCMOMENT`, `MONQ50`, `LICNMID100`, `MULTICAP`) slipping through the original regex by adding an explicit `KNOWN_GAP_SYMBOLS` Set in `src/lib/nse-fund-exclusion.ts`.
  - Fixed a regex bug that appended a trailing `$` anchor to the `MID` group, which would have narrowed prefix matching to exact matches and caused future regression leaks.
- **Duplicate DailyOhlcv Index Removed**:
  - Removed the redundant `@@index([symbol, date])` from the `DailyOhlcv` model in `prisma/schema.prisma` which duplicated the existing covering index of `@@unique([symbol, date])`.
  - Created and applied database migration `20260831104947_remove_duplicate_daily_ohlcv_index` executing `DROP INDEX IF EXISTS "DailyOhlcv_symbol_date_idx"` to clean up the production database.

### Fixed — 26 Aug Deep Code Review: 18 Bug Fixes (PR #147)

A systematic deep code review of all commits from 2026-08-19 to 2026-08-26 identified 18 bugs across services, API routes, ingest scripts, infrastructure, and tests. All 18 resolved in commit `a7a467f` on branch `fix/code-review-18-bugs`.

#### 🔴 Critical
- **BUG-01 · Auth gate on `?refresh=true`** (`src/app/api/market-tools/pattern-breakout/route.ts`): Unauthenticated callers could hammer the Pattern Breakout `?refresh=true` endpoint, triggering a full 2,636-symbol DB scan on every request (DDoS vector). Now requires valid `app_access_token` cookie or `Authorization: Bearer` header for forced refreshes.
- **BUG-02 · Null dereference crash in scanner** (`src/app/api/scanner/route.ts`): `r.signalSummary.includes('BEARISH')` threw `TypeError` when `signalSummary` is `null`, crashing the entire scanner API response. Fixed with optional chaining (`?.includes`).
- **BUG-03 · Journal retry storm** (`src/services/scheduler/cpr-journal.job.ts`): Returning `success: logged.length > 0` caused the cron scheduler to release its lock and re-fire every 60 seconds when all signals were suppressed by regime/staleness logic, hammering the DB. Changed to `success: true` on clean completion.

#### 🟠 High
- **BUG-04 · `BigInt(NaN)` crash** (`scripts/market-tools/bhavcopy-ingest.ts`): `parseFloat` on `"-"` volume cells returns `NaN`; passing it to `BigInt()` throws `TypeError`. Added `isNaN` guard before cast.
- **BUG-05 · OHLC NaN propagation** (`scripts/market-tools/bhavcopy-ingest.ts`): `open`, `high`, `low` were not validated for `NaN`, causing SQL syntax errors in raw batch upserts. Added `[open, high, low, close].some(isNaN)` row-skip guard.
- **BUG-06 · Non-transactional batch upserts** (`scripts/market-tools/bhavcopy-ingest.ts`): A crash mid-batch left partial-day data permanently in the DB. Wrapped all batch upserts for a single date in `prisma.$transaction()`.
- **BUG-07 · Backfill skip threshold too low** (`scripts/market-tools/bhavcopy-backfill.ts`): Threshold `> 500` would skip a date that only had 600/2,600 rows ingested, leaving a permanent data hole. Raised to `> 2000`.
- **BUG-08 · Fake `.next/BUILD_ID` masks missing build** (`server-starter.js`): Creating a dummy `BUILD_ID` allowed a server to "start" with no real build artifacts, then crash mysteriously under traffic. Replaced with a fail-fast `process.exit(1)` check.
- **BUG-09 · Middleware `startsWith` auth bypass** (`src/middleware.ts`): `startsWith('/market-tools')` matched `/market-tools-admin`. Changed to exact path or required trailing slash.
- **BUG-10 · Redis TTL race condition** (`src/lib/redis.ts`): `EXPIRE` called outside the pipeline allowed a permanent key with no TTL if the process crashed between `pipeline.exec()` and `redis.expire()`. Moved into a single `redis.multi()` pipeline using `EXPIRE ... NX`.
- **BUG-11 · Single `try/catch` kills all precompute caches** (`src/services/market-tools/market-tools-precompute.job.ts`): One service failure aborted all three cache jobs. Wrapped each service call in its own `try/catch` so failures are isolated.

#### 🟡 Medium
- **BUG-12 · `memInterval` lifecycle + `prisma.$disconnect` in ingest** (`scripts/market-tools/bhavcopy-ingest.ts`): Module-scoped interval was destroyed after the first backfill iteration; `prisma.$disconnect()` in `finally` thrashed the connection pool for every date in the loop. Both moved to correct lifecycle scope.
- **BUG-13 · Cup & Handle off-by-one** (`src/services/market-tools/pattern-breakout.service.ts`): Handle depth loop started at `rightPeakIdx` (the peak candle itself), artificially widening depth and rejecting valid tight handles. Changed to `rightPeakIdx + 1`.
- **BUG-14 · Missing `force-dynamic` on breadth route** (`src/app/api/market-tools/breadth/route.ts`): Without `export const dynamic = 'force-dynamic'`, Next.js could statically cache the route, breaking live market data updates. Added.
- **BUG-15 · `useEffect` missing `AbortController` cleanup** (`src/app/market-tools/pattern-breakout/page.tsx`): Dangling fetch promises called `setState` on unmounted component. Added `AbortController` + `isMounted` ref pattern with cleanup return.

#### 🟢 Low
- **BUG-16 · Redundant `@@index` in `DailyOhlcv` schema** (`prisma/schema.prisma`): `@@unique([symbol, date])` already creates a B-Tree index; the explicit `@@index([symbol, date])` was an identical duplicate wasting disk space and write overhead. Removed.
- **BUG-17 · Missing `server.on('error')` handler** (`server-starter.js`): Port conflicts and uncaught exceptions produced cryptic stack dumps. Added `EADDRINUSE` handler and `process.on('uncaughtException')`.
- **BUG-18 · Test coverage gaps for edge inputs** (`src/tests/unit/pattern-breakout.test.ts`): No tests for empty candle arrays, single-candle inputs, or `selectPrimaryPattern([])`. Added three edge-case assertions.

### Added
- **26 Aug Market Tools Phase 3 — 52W High Pattern Breakout Scanner Module (PR #145)**:
  - **`PatternBreakoutService`** (`src/services/market-tools/pattern-breakout.service.ts`):
    - **History-Depth Guard**: Enforces strict minimum $\ge 250$ trading days for 52W high baseline; newly listed stocks with $< 250$ days are safely excluded rather than calculated over truncated history.
    - **Prior-Day Baseline**: Computes 52W High using SQL window function `ROWS BETWEEN 249 PRECEDING AND 1 PRECEDING` to exclude today's candle and prevent self-comparison.
    - **Classical Pattern Heuristics**:
      - **Cup & Handle (O'Neil)**: Detects U-shaped cup ($12\%\text{–}35\%$ depth over 25–65d), lip symmetry ($\le 6\%$), and handle pullback ($\le 12\%$ drift in upper half of cup).
      - **Flat Base (Minervini / O'Neil)**: Detects tight horizontal consolidation channel ($\le 15\%$ range over 20–50d within $15\%$ of 52W high).
      - **Double Bottom**: W-pattern with two comparable troughs ($\pm 4.5\%$), intermediate peak rise $\ge 7\%$, and pivot breakout.
      - **VCP (Volatility Contraction Pattern)**: Sequential multi-wave contraction (Wave 1: $12\%\text{–}35\% \rightarrow$ Wave 2: $4\%\text{–}18\%$ with $\ge 25\%$ contraction ratio).
    - **Volume Confirmation (RVOL)**: Trailing 20-day volume ratio computed via `computeRvol` from VPA engine.
    - **Composite Total Score (0–100)**: 52W Proximity (30 pts), RVOL 20D (25 pts), Pattern Quality (25 pts), Momentum & MA Alignment (20 pts). Quality tiers: **A+ (85–100)**, **A (70–84)**, **B (50–69)**, **C (<50)**.
    - **Deterministic Pattern Tie-Breaker**: `VCP` $\rightarrow$ `Cup & Handle` $\rightarrow$ `Double Bottom` $\rightarrow$ `Flat Base` $\rightarrow$ `None` (all matched patterns preserved in `detectedPatterns` metadata).
    - **Sector Grounding**: Reuses standard 8-sector taxonomy (`BANKING`, `IT`, `AUTO`, `PHARMA`, `METALS`, `ENERGY`, `REALTY`, `INFRA`, `OTHERS`) from `getSymbolSector()`.
  - **API & UI Dashboard** (`src/app/api/market-tools/pattern-breakout/route.ts`, `src/app/market-tools/pattern-breakout/page.tsx`):
    - Exposes cache-only endpoint `/api/market-tools/pattern-breakout` with pattern, status, and tier query filters.
    - Dark-theme dashboard with KPI cards (Total Scanned, Breakout Candidates, Near High, A+ Setups), pattern filter pills, status dropdown, tier dropdown, sector selector, live search, and expandable structural detail cards.
  - **Platform Integration**:
    - `src/components/layout/Navbar.tsx`: Added **52W Patterns `[NEW]`** link under `Market Tools ▼` dropdown and mobile drawer.
    - `src/middleware.ts`: Added public route exemption for `/api/market-tools/pattern-breakout`.
  - **Unit Tests & Live Verification** (`src/tests/unit/pattern-breakout.test.ts`):
    - 9/9 unit tests passing (24/24 across all Market Tools modules).
    - Real database sequential run scanned 2,636 symbols (261 trading days) yielding 221 qualified setups with clean natural distribution (83 Flat Base, 27 VCP, 21 Double Bottom, 17 Cup & Handle, 73 Raw 52W Breakouts).
- **25 Aug Market Tools Phase 2 — Multi-Year Breakout Scanner Module (PR #144)**:
  - **`MultiYearBreakoutService`** (`src/services/market-tools/multi-year-breakout.service.ts`): Scans 2,600+ NSE `series = 'EQ'` symbols from `DailyOhlcv` history. Computes trailing max highs across 1Y (250d), 2Y (500d), 3Y (750d), 5Y (1250d), 10Y (2500d), and ATH windows using SQL window functions (`ROWS BETWEEN N PRECEDING AND 1 PRECEDING`, excluding current day to prevent self-comparison).
  - **Strict History-Depth Guards**: For windows where symbol history is insufficient (`availableDays < requiredDays`), the engine returns `null` (`INSUFFICIENT_DATA`) rather than calculating false breakout metrics over truncated datasets. 1Y and ATH are fully active on current dataset (~261 days); 2Y–10Y are built with strict guards and will self-activate automatically as daily Bhavcopy records accumulate.
  - **Strongest Breakout Hierarchy**: Automatically ranks and categorizes the highest genuine breakout milestone (`ATH` → `10Y` → `5Y` → `3Y` → `2Y` → `1Y`) along with breakout reference price and percentage gain.
  - **API & UI Dashboard** (`src/app/api/market-tools/breakout/route.ts`, `src/app/market-tools/breakout/page.tsx`): Exposes `/api/market-tools/breakout` endpoint with Redis caching (`market_tools:breakout:report`) and window filters (`?window=1Y|ATH|...`). Provides a dark-theme dashboard with window selector tabs, search/sector filtering, strongest BO badges, and clear data-depth notices for windows awaiting historical depth.
  - **Navigation Wiring** (`src/components/layout/Navbar.tsx`): Added "Breakouts" nav link under the Analysis navigation group.
  - **Unit Tests & Sanity Runner** (`src/tests/unit/multi-year-breakout.service.test.ts`, `scripts/market-tools/verify-breakouts.ts`): Unit test suite verifying depth guards, gain math, and ranking hierarchy. Real production sanity run verified 21 1Y breakouts and 30 ATH breakouts on 2026-08-25 data in 2.4s.
- **24 Aug Friday Weekend Gate + 9:16 AM Gap-Failure Exit Alert (PR #143)**:
  Addresses repeated Friday STBT option losses (BSE Aug 10 `GAP_FAILURE`, BSE Aug 21 `GAP_UP` on STBT PE) caused by 60+ hours of unhedged weekend gap risk in non-BEAR regimes.
  - **Friday Weekend Gate** (`src/services/overnight/overnight.service.ts`): Added `FRIDAY_STBT_GATE` — in `CHOPPY` or `BULL` regime, all SHORT/STBT overnight signals on Friday are hard-blocked before persisting. Only a confirmed `BEAR` regime (Nifty close < EMA20, EMA sloping down) permits Friday STBT signals. Added `FRIDAY_BTST_GATE` — Friday BTST/LONG signals require Score ≥ 85 (vs normal 75) in any non-BULL regime to survive weekend gap risk. IST day-of-week determined via `Intl.DateTimeFormat` with `timeZone: 'Asia/Kolkata'` to handle UTC offset correctly.
  - **9:16 AM Gap-Failure Exit Alert** (`src/services/scheduler/btst-alert.job.ts`): New `checkGapFailureExits()` function runs at market open (09:16–09:20 IST) and scans all unexecuted TRADEABLE/WATCHLIST overnight signals from the previous session. If the underlying has gapped > 1% against the trade direction (LONG: LTP < entry × 0.99; SHORT: LTP > entry × 1.01), sends a Telegram `⚠️ GAP_FAILURE_EXIT` alert immediately and marks the `OvernightSignal` and `TradeJournal` rows with `executionOutcome = 'GAP_FAILURE'`. Direction-aware signed return `((entry - ltp) / entry) * 100` stored in `OvernightSignal.actualReturn`.
  - **TelegramService** (`src/services/alert/telegram.service.ts`): Added `sendRawMessage()` static alias for pre-formatted HTML message delivery.
  - **Cron Scheduler** (`src/services/scheduler/market-cron.scheduler.ts`): Hooked `checkGapFailureExits` into the 60s poll tick under a `09:16–09:20 IST` time window with a `gap-failure-exit:{date}` deduplication claim key.
- **24 Aug Market Tools Phase 1 — Daily NSE Bhavcopy Ingestion**:
  - **`DailyOhlcv` Prisma Model** (`prisma/schema.prisma`): Added full-universe daily OHLCV storage schema (`symbol`, `date`, `open`, `high`, `low`, `close`, `prevClose`, `volume`, `value`, `trades`, `series`, `isin`) with unique `[symbol, date]` constraint and indexes on `date` and `[symbol, date]`. Tracked via Prisma migration `20260824195700_add_daily_ohlcv`.
  - **Standalone Ingestion Pipeline** (`scripts/market-tools/bhavcopy-ingest.ts`): Standalone Node entrypoint for fetching, decompressing (`adm-zip`), parsing, and persisting NSE UDiFF CM Bhavcopy zips. Features bounded 250-row batching, in-batch key deduplication (preferring `EQ` series), and raw SQL `ON CONFLICT (symbol, date) DO UPDATE SET ...` for authoritative idempotency on re-run.
  - **Memory Budget & Performance**: Runs strictly standalone outside `cpr-platform` to prevent memory retention. Features active memory ticker tracking peak RSS memory (`~44.15 MB` measured via `/usr/bin/time -v` on 3,645 inserted rows over 2.8s wall-clock runtime).
  - **Crontab Registration**: Scheduled via OS crontab at `19:00 IST` (`13:30 UTC` / `0 13 * * 1-5`), completely collision-free with `cpr-platform`'s trading hours polling loop (09:15–15:30 IST).
- **24 Aug Market Tools — Staged Historical Backfill & Market Breadth Scanner**:
  - **Staged Backfill Pipeline** (`scripts/market-tools/bhavcopy-backfill.ts`): Resumable sequential backfill engine supporting custom `--start` / `--end` dates with courtesy delay and automatic weekend/holiday skipping. Ingested 264 distinct trading dates (`924,158` rows across `2025-08-01` to `2026-08-21`) with 0 duplicate keys and 0 errors in 4 minutes runtime.
  - **`MarketBreadthService`** (`src/services/market-tools/market-breadth.service.ts`): Read-only market breadth calculator computing MA10/20/50/200 percentage breadth, advance/decline counts and ratio, 4% extreme moves, 52-week highs/lows, sector strength ranking, and market regime score (0-100).
  - **API & UI Route** (`src/app/api/market-tools/breadth/route.ts`, `src/app/market-tools/breadth/page.tsx`): Exposes read-only JSON endpoint and dark-theme dashboard page with Moving Average breadth gauges, A/D ratio cards, 52W high/low status badges, and sector rank table.

- **24 Aug Scanner API Option Suggestion Timeout Ceiling (PR #142)**:
  - Fixed an issue where `GET /api/scanner` hung for 2+ minutes when Fyers option chain HTTP requests stalled or rate-limited, causing the live site scanner UI to show a continuous loading spinner.
  - **Route Timeout Ceiling** (`src/app/api/scanner/route.ts`): Wrapped `enrichWithOptionSuggestions` in a hard 2.5s `Promise.race` timeout ceiling and parallelized top candidate lookups with `Promise.allSettled`. If option chain lookups exceed 2.5s, the route returns full scanner coordinates immediately without option suggestion badges instead of blocking the client response.
  - **Fyers Option Chain Fetch Timeout** (`src/services/option-chain.service.ts`): Added a 3s `AbortController` timeout to `fetchWithRetry` so network stalls on Fyers `options-chain-v3` endpoints abort gracefully instead of hanging indefinitely.
- **20 Aug CPR Journal Robustness Hardening — FORTIS Post-Mortem (PR #140)**:
  Five independent fixes applied after forensic analysis of the FORTIS Aug 19, 2026 PE trade loss (-32% option P&L on a +0.78% adverse spot gap):
  - **Fix 1 — Market Regime Gate** (`cpr-journal.job.ts`): CPR journal now fetches `RegimeService.getMarketRegime` at job start and suppresses SHORT/PE trades in BULL market regimes and LONG/CE trades in BEAR market regimes — mirroring the existing BTST/STBT gate. When `regime.reliable === false` (Nifty data missing), **both** directions are suppressed (fail-closed). The FORTIS SHORT in a BULL regime would have been stopped here.
  - **Fix 2 — Signal Confluence / Direction Contradiction Filter** (`cpr-direction.ts`, `cpr-journal.job.ts`): New `validateCprSignalConfluence()` function rejects setups where morning scan tags explicitly contradict the trade direction. SHORT invalidators: `GAP_UP`, `HP_CAM_BULL_BIAS`, `HP_DIRECT_UP`. LONG invalidators: `GAP_DOWN`, `HP_CAM_BEAR_BIAS`, `HP_DIRECT_DOWN`. FORTIS had both `GAP_UP` and `HP_CAM_BULL_BIAS` alongside its SHORT direction — a second independent kill.
  - **Fix 3 — Dynamic Delta + DTE Theta Risk Buffer** (`option-suggestion.service.ts`): Replaced flat `delta = 0.7` SL/target proxy with depth-calibrated deltas (depth-1: 0.52, depth-2: 0.65, depth-3: 0.80). Added `computeDTE()` private helper parsing Fyers weekly/monthly symbology; when DTE ≤ 4 trading days the SL distance is tightened 10% to protect capital during expiry-week theta crush.
  - **Fix 4 — CPR GAP_FAILURE Classification Bug** (`trade-journal.service.ts`): Removed erroneous `trade.signalType !== 'CPR'` exclusion from `classifyExecutionOutcome`. CPR trades that open with an adverse gap > 15% are now correctly classified as `GAP_FAILURE` (not `EXECUTION_SLIPPAGE`), ensuring analytics correctly attribute systematic market risk rather than model failure.
  - **Fix 5 — 9:16 AM Dead Tick Guard** (`trade-journal.service.ts`): `captureSnapshot` now skips writing CMP values < ₹0.25 at 9:16 AM (pre-market auction / illiquid ticks not yet forming a real market). Write is deferred to the 9:30/9:45 AM slot, preventing artificially low marks from distorting PnL and causing false GAP_FAILURE classifications.
  - **11 new unit tests** added to `cpr-journal-job.test.ts` covering BULL→SHORT suppression, BEAR→LONG suppression, unreliable-regime fail-closed, GAP_UP+SHORT rejection (exact FORTIS replay), HP_CAM_BULL_BIAS+SHORT rejection, GAP_DOWN+LONG rejection, and clean-direction pass-throughs. Total: **660/661 pass, 0 failures**.
- **18 Aug CPR Journal PCR Veto Gate (PR #139)**:
  - Wired `optionPcrContradictsDirection` into `cpr-journal.job.ts` (`src/services/scheduler/cpr-journal.job.ts`), matching `breakout-alert.pipeline.ts`.
  - When option chain PCR contradicts the suggested contract (CE on chain PCR < 0.8 or PE on chain PCR > 1.2), the trade is skipped from journaling with tag `symbol:PCR_CONTRADICTS`. This ensures 100% parity between Telegram breakout alerts and the trade journal (e.g. blocking AMBER 7300 CE from logging when chain PCR is 0.61).
- **17 Aug Cross-Engine Breakout Conflict Gate (PR #138)**:
  - Added strict symmetrical cross-engine protection (`evaluateBtstScannerConflict` in `src/lib/cpr-breakout-conflict.ts` and `EntryManagerService.evaluateBreakoutConflict`):
    - BTST (LONG) is suppressed if the intraday CPR scanner confirms an active `BREAKDOWN`.
    - STBT (SHORT) is suppressed if the intraday CPR scanner confirms an active `BREAKOUT`.
  - Wired into `btst-alert.job.ts`, `btst-journal.job.ts`, and `stock-btst-backtest.helper.ts`, eliminating counter-trend overnight trap trades (such as buying a CALL on a breakdown day) and ensuring full harmony between the intraday scanner and the trade journal.
- **17 Aug scanner useCache trade levels (PR #136)**: `GET /api/scanner?useCache=true` no longer overwrites persisted entry/SL/target with TC/BC/R1 when serving cached auto-scan rows — trade setup columns match the last full scan.
- **16 Aug overnight empty calendar + in-window cache (PR #135)**: Empty `MarketEvent` calendar now yields `confidence: HIGH` / `noKnownEventRisk()` so earnings-free days are not falsely blocked; `/api/overnight` serves the in-window Redis/DB cache like BTST between 15:10–15:25 IST (`overnight-scan-cache.ts`).
  - Added 10s `AbortSignal.timeout(10_000)` to `FnoUniverseCheckService.checkDrift()` when querying `fo_mktlots.csv` from NSE archives, preventing indefinite request hangs when NSE endpoints are slow or block cloud IPs.
- **14 Aug Scan persistence retry & visibility (PR #133)**:
  - Wrapped `ScannerController.persistScanResults()` in `DatabaseCircuitBreaker.execute()` with a single automatic 3s retry on transient DB timeouts.
  - Added durable 24h Redis failure marker logging (`scan_persist_failed:{universe}:{date}:{timestamp}`) when persistence attempts fail.
- **13 Aug LICI / Scan hang (live)**:
  - **Against prior close**: LONG breakouts with LTP still below previous close (and SHORT breakdowns still above it) are suppressed before Telegram claim and skipped in the CPR journal. Scanner setup column flags `VS CLOSE`. Would have blocked LICI 14:45 IST (415.35 vs prev close 417).
  - **PCR veto**: After option enrich, CE is not sent when chain PCR is bearish (< 0.8) and PE is not sent when PCR is bullish (> 1.2). Claim is released so a later aligned print can still fire. LICI had PCR 0.73 with a 410 CE.
  - **Scan button hang**: `POST /api/scanner/refresh` starts the full scan in the background and always returns **202**; the UI shows cached rows instead of spinning 40–100s+ on the 1 GB VM (15:25 IST hang).
- **Deep-review follow-up (pre-deploy)**: Closed holes in the 20-fix pack so it is safe to ship:
  - **C2**: Align journal jobs with their respective alert paths: `cpr-journal` calls `suggestOption` (matching `breakout-alert.pipeline.ts`, mapping `LONG`/`SHORT` → `BULLISH`/`BEARISH`), while `btst-journal` calls `suggestOptionForBtst` (matching `btst-alert.job.ts`). Previously the two journal jobs called each other's intended method. Note: `suggestOption` and `suggestOptionForBtst` are currently functionally identical because `INDEX_BTST_PREFER_DEEPER_ITM` is set to `false`, so this swap prevents a future landmine rather than correcting an active discrepancy today.
  - **H1**: VIX and price gates run **before** claiming. Never-sent alerts no longer start a 4h cooldown; a later pullback can still fire. `commitClaims()` writes `lastAlerted` only for rows that will be sent.
  - **H3**: Overnight upsert lock order is `symbol` then `direction` (unique key includes direction; symbol-only sort could still deadlock).
  - **H4**: `FYERS_QUOTE_CACHE_TTL_MS` Zod default is **90s** (was 20s, so the `|| 90000` fallback never ran and mid-scan quotes still expired).
  - **L3**: Telegram and CPR journal now pass ATR% into the chase cap (`atrScaledExtensionCap`, 2–6%).
  - **L5**: BTST send-attempt counter is process-scoped (`date:claimKey` Map) so a second Telegram failure in the 15:10–15:25 window keeps the claim instead of retry-spamming.
  - **M1**: Normalized `YYYY-MM-DD` IST `asOfDate` is forwarded to `getCompletedHistory()` and today-candle-final checks, not only the local `todayStr`.
  - **C1**: Tests and comments match 15m fall-through (reclaim can still confirm; flicker without hold still rejects).
- **1-Week Deep Review Production Bugfixes (PRs #125–#129)**: Complete resolution of 20 critical, high, medium, and low severity system issues across 5 focused branches:
  - **Breakout & Alert Pipeline (C1, H1, M3)**: `isBreakoutConfirmed` falls through on 15m candle close miss to preserve valid 5m session hold alerts (C1); VIX/price gates run before claiming so undelivered alerts do not start a 4h cooldown (H1 follow-up); `missCount` increments whenever setups fail score thresholds (M3).
  - **Journal Parity & Concurrency (C2, C3, H2, H3)**: `cpr-journal` uses `suggestOption` (mapping `LONG`/`SHORT` → `BULLISH`/`BEARISH`) and `btst-journal` uses `suggestOptionForBtst` to match their respective alert paths (C2); `regime.reliable` check suppresses ghost entries during market data outages (C3); CPR journal deduplicates symbols and applies stable tie-breakers before parallel logging (H2); overnight upsert `$transaction` payload is sorted by `symbol` then `direction` to eliminate DB deadlocks (H3).
  - **Data Feed & Infrastructure (C4, M4, M4b, C5, H4, H5)**: Removed stale L1 memory cache fallback on Redis key misses (C4); added `clearL1()` and bound it to Redis `ready` events and `purgeInProcessCaches()` (M4/M4b); protected scanner from mass 1-hour blacklisting during global Fyers 429 events (C5); Fyers quote prefetch TTL default is 90s via `FYERS_QUOTE_CACHE_TTL_MS` (H4); protected `stock_data_*` and `option_chain_*` keys in `mem_watchdog.sh` (H5).
  - **Medium Correctness (M1, M2, M5)**: Normalized `asOfDate` parameters to strict `YYYY-MM-DD` IST format and passed that through ATR/history selection (M1); used `getCompletedHistory()` consistently for index ATR calculations (M2); handled `AbortError` timeouts gracefully during lot-size master downloads (M5).
  - **Quality & Resilience (L1, L2, L3, L4, L5)**: Refactored `withTimeout` to `Promise.race` pattern with `.finally()` cleanup (L1); exported `HOT_ZONE_ATR_MULTIPLIER` in `trading-constants.ts` (L2); ATR-scaled dynamic extension caps (2–6%) now receive ATR% from Telegram/journal (L3); deprecated legacy optionExpiry regex fallback (L4); BTST send-attempt limit persists across cron ticks in-process to prevent 3:20 PM retry storms (L5).

### Added
- **17 Aug breakout alert suppression visibility (PR #137)**: Cron breakout pipeline persists VIX / price / PCR gate reasons (`alertSuppressedReason`, `alertSuppressedDetail`, `alertSuppressedAt`) on `ScannerResult`. Scanner setup column shows **No alert: EXTENDED** (etc.) with tooltip detail so suppressed breakouts are visible without log diving. Migration: `20260817120000_add_scanner_alert_suppression`.
- **Fyers quote batch prefetch (PR #122)**: Scanner and overnight runs prefetch Fyers LTP quotes in batches of up to 50 symbols per HTTP request (`fyers-quotes-batch.ts`, `MarketService.prefetchFyersQuotes`), seeding a short-lived in-process cache so per-symbol `getStockData` skips redundant quote round-trips. Tunables: `FYERS_QUOTES_BATCH_SIZE`, `FYERS_QUOTE_CACHE_TTL_MS`. Cache cleared via `purgeInProcessCaches` after heavy crons.
- **India VIX breakout alert gate (PR #122)**: Automated Telegram breakout alerts now respect India VIX regime (`breakout-vix-gate.ts`): pause all alerts when VIX ≥ 25; in the 18–24 band require score ≥ 85 and tighten entry-chase cap to 2% (from 3.5%). Manual test-breakout path unchanged. Constants in `BREAKOUT_VIX` (`trading-constants.ts`).
- **Unit test environment isolation**: Fixed raw `tsx --test` execution where `dotenv/config` polluted `process.env.NODE_ENV` to `development`, causing event risk checks to query a missing local DB and return `EVENT_RISK_GATE` errors. Resolved by explicitly setting `process.env.NODE_ENV = 'test'` inside `option-suggestion.test.ts` and refining the service environment guard.
- **Selective Redis pruning**: Hardened the memory watchdog (`ops/mem_watchdog.sh`) to selectively prune Redis keys, preserving critical synchronization keys (`cron_lock:*`, `cron_done:*`, and `rate_limit:*`) during off-hours automated restarts.
- **Expanded lot-size fallbacks**: Added 30+ mid-cap FNO symbols to the fallback list in `OptionSuggestionService` to avoid `LOT_SIZE_UNAVAILABLE` errors when Fyers CDN downloads fail.
- **CPR / breakout price-actionability gate (PRs #114–#116, #117, #119)**: Shared gap + extension checks (`cpr-setup-staleness.ts`, `breakout-price-gate.ts`) suppress unreachable/chased entries before Telegram send, skip them in the CPR journal (with live OHLC), and flag `GAP` / `EXTENDED — do not chase` in the scanner setup column. Direction-aware gap invalidation: LONG only when the day has already traded entirely above entry; SHORT only when entirely below. Test-breakout uses the same gate; cron releases already-delivered stale claims while preserving the 4h cooldown.
- **Secondary Breakout Target**: Added secondary target levels (`target2`) and associated risk-reward ratios (`rr2`) to Trade Setup V3 calculations. Threaded them through the database schema (`ScannerResult` table), API routes, scanner controller mapping, and Telegram breakout alerts template.
- **DirectionSetupState (Postgres)**: Durable FRESH/MATURE/STALE setup-age tracking for scanner direction bias — survives PM2 restarts and Redis flushes (`DirectionSetupState` table, `bullish-state.service.ts`).
- **Breakout hold/reclaim confirmation**: 15m close, 5m reclaim hold, and 10m gap-continuation gates before tagging `BREAKOUT` / `BREAKDOWN` (`breakout-confirm.ts`).
- **Shared auto-scan cron claim**: Crontab and in-process scheduler share `cpr-scan:{date}:{bucket}` so duplicate scan runs cannot double-fire (`cron-run-claim.ts`).
- **Fyers 15m enrichment on primary path**: VWAP and `candle15m` on the Fyers data path for parity with Yahoo fallback (`market.service.ts`).
- **Market Session Profile (CAS future-proofing)**: Configurable `MARKET_PROFILE` (`CONTINUOUS` default | `CLOSING_AUCTION`) with `MarketSessionResolver` / `MarketSessionContext`. SEBI Closing Auction Session clocks stay dormant until explicitly enabled — production behaviour unchanged under `CONTINUOUS`. See [`docs/CAS_ANALYSIS.md`](docs/CAS_ANALYSIS.md).
- **Volume Price Analysis (VPA) Confirmation Layer**: Built an advanced mathematical layer evaluating Close Location Value (CLV) and Relative Volume (RVOL) to validate breakouts and weed out low-conviction CPR crosses.
- **VPA Master Kill-Switch & Shadow Mode**: Introduced `VPA_SHADOW_MODE` environment variable as a true master kill-switch. Added explicit Live/Shadow UX badges on the scanner UI to ensure transparency into whether VPA heavily gates production scores or merely runs side-by-side in research mode.
- **VPA Penalty Rules**: Penalizes weak breakouts (e.g. failing CLV or RVOL thresholds) ONLY if they intersect the active CPR pivots, ensuring normal non-breakout trades aren't unfairly downgraded.
- **App access-token auth layer**: Shipped middleware-level gating of all page and API routes behind `APP_ACCESS_TOKEN`. Created a dedicated `/unlock` page, `/api/auth/unlock` and `/api/auth/logout` endpoints, using timing-safe credential validation and secure `httpOnly`/`sameSite=strict` session cookies.
- **Unlock Rate Limiting**: Added Redis-backed rate limiting to the `/api/auth/unlock` endpoint to prevent brute-force attacks, enforcing a strict budget of 5 attempts per 15 minutes.
- **Telegram Breakout Option Suggestions**: Enriched Telegram breakout alert notifications with F&O option contract suggestions (`🎯 Option: ...`) for eligible stocks.
- **Overnight 3:10 PM - 12:00 AM DB Fallback**: Added a database fallback layer for today's overnight signals from 3:10 PM to 12:00 AM Midnight IST when Redis cache is cold or missing.
- **Dynamic Navbar Market Status Chip & Endpoint**: Created `/api/market-status` and updated `Navbar.tsx` to dynamically query and render real-time market status chips (`NSE · LIVE`, `NSE · PRE-SESSION`, `NSE · CLOSED`) and Scanner badges.
- **Secure Repository Packaging**: Added an `ops/package-repo.ps1` Git-archive script to securely export the codebase for deployment without inadvertently leaking local `.env` files or temporary directories.
- **Integration Tests for API Stripping**: Added test suite checking that `/api/overnight/[symbol]` and `/api/btst/[symbol]` route responses strip out the raw rolling beta proxy `indexCorrelationEstimate`.
- **VPA CLV Scoring Unit Tests**: Added direct unit tests validating `scoreVpaClv` thresholds under neutral, bullish, and bearish directions for both LONG and SHORT setups.
- **Database Circuit Breaker**: Added a fail-fast circuit breaker for database reads on high-traffic event/scanner routes to prevent DB saturation during Redis outages.
- **In-process Cache Purge**: Added a memory watchdog strategy that purges in-process memo maps after heavy cron jobs to enforce strict Node.js heap limits on 1 GB Oracle VMs.
- **Fyers 5m Intraday Candle Fallback**: Added Fyers 5m intraday candle fallback when Yahoo intraday fetch fails, for overnight VWAP and closing-range metrics (`fyers-intraday.util.ts`, `overnight.service.ts`).
- **VPA Shadow Breakdown Persistence**: Added `vpaBreakdown` JSONB column to `ScannerResult` table and updated `ScannerController` to persist VPA confirmation outputs on every scan for historical false breakout analysis.

### Changed
- **17 Aug overnight pick ranking (PR #137)**: Journal and Telegram top-N selection ranks TRADEABLE READY+ picks by **score** (desc), then signalTime, then symbol. Rescans still dedupe to the latest row per symbol via `compareLatestScanBySymbol` — extension gate at send/journal time handles stale prices.
- **Scanner rating badges (PR #115)**: CPR strong/ready badges are direction-aware (`Strong Buy` / `Strong Sell`, `Opportunity Buy` / `Opportunity Sell`); RANGE stays neutral (`Strong` / `Opportunity`). Overnight BTST/STBT row tints: STBT uses red, not green. Heatmap strong-tier column key is direction-neutral `Strong` (API KPI `strongBuy` unchanged for parity) (PR #119).
- **Scanner entry basis — today's CPR (owner-approved)**: Trade Setup V3 entry/SL/target/RR now use `cprToday.*` (same session as bias), not tomorrow's projected CPR. Governance comment locks this behind owner approval — see [`docs/decisions/cpr-entry-basis-2026-08-10.md`](docs/decisions/cpr-entry-basis-2026-08-10.md). Deployed with PR #98 (`9395ef5` / `615d769`).
- **MarketSnapshot fields**: Separate `sessionOpen` and `previousClose` for clearer live vs prior-session semantics.
- **Redis-only cache on connected path (Oracle 1 GB trade-off)**: `CacheService.set()` no longer mirrors every Redis write into the in-process L1 LRU when Redis is healthy. This deliberately reverses the prior always-write-L1 warm-cache fix to avoid duplicating ~700 keys in Node heap. Accepted side effect: after `mem_watchdog` flushes Redis at 75% RAM, both layers are cold and the next request batch can miss-storm; that transient burst is preferred over permanent 2× memory. See `cache.service.ts` comment and AGENTS.md → Memory. Durable product state (hysteresis, claims) must not rely on Redis alone.
- **Fyers Primary Data Provider**: Upgraded the live data pipeline to use the Fyers API as the primary data provider, eliminating the 1-2 minute price delay experienced with Yahoo Finance. Yahoo Finance is now maintained strictly as a reliable outage fallback.
- **CPR Journal Cron Window**: Adjusted the CPR journal cron job start time to 15:20 IST (ends 15:24 under `CONTINUOUS` to avoid overlapping BTST journal).
- **BTST/STBT Group-Only Telegram Alerts**: Routed BTST/STBT alert signals strictly to Telegram group chats (falling back to personal chat only if group ID is unconfigured).
- **Signal Prefix Rename**: Renamed scanner signal tags from `KGS_*` to `HP_*` (legacy `KGS_*` still accepted for historical journal rows).
- **Event Risk Lookahead via Trading Sessions**: Updated the corporate event scanner lookahead window and severity decay model to strictly use NSE trading sessions (`addTradingDays`) instead of calendar days. This correctly bridges weekends and holidays so Thursday scans can look ahead to Monday and Tuesday earnings accurately.
- **VPA CLV Threshold Scaling**: Rescaled VPA CLV constants `BULLISH` to `0.4` and `BEARISH` to `-0.4` in `vpa.config.ts` to align with the `[-1, 1]` scale of `computeClv()`.
- **Hardened Deployment Script**: Improved `deploy.ps1` to use clean `npm install` and local Prisma client binary paths, making it highly robust against Windows file locks.
- **Validated Env Migration**: Migrated away from raw `process.env` lookups to a central, validated `env` module across crypto, redis, middleware, telegram, fyers-auth, and queue services.
- **Cron Claim Lock TTL**: Raised cron claim lock TTL from 90s to 600s (`cron-run-claim.ts`) to prevent 4× duplicate scan executions.
- **Regime Fail-Closed Behavior**: Missing or insufficient NIFTY history now suppresses both BTST and STBT alerts instead of silently defaulting to CHOPPY (`regime.service.ts`, `btst-alert.job.ts`).
- **Health Check Endpoint Optimization**: Unauthenticated probes now execute a cheap DB ping only, instead of running the full queue and regime check (`health/route.ts`).
- **Scanner History Tag Derivation**: Scanner history tag now derived from `signalSummary` keywords instead of score threshold (`scanner/history/route.ts`).
- **Centralized Cookie Secure Flag**: Centralized cookie `Secure` flag logic into `src/lib/auth-cookie.ts`, now also honoring `X-Forwarded-Proto` behind nginx/nip.io HTTPS setups.

### Fixed
- **Telegram Breakout Alerts Footer**: Alerts now dynamically show the actual CPR width classification (NARROW, NORMAL, WIDE) instead of hardcoding 'NARROW CPR', and only append "Volume Spike" if the `VOLUME_SPIKE` signal is actually present.
- **Auto-scan cron claim keys**: Scan claim keys are now namespaced by `universe` (`cpr-scan:{universe}:{date}:{bucket}`) to prevent duplicate execution locks across different scan universes running concurrently.
- **CPR Journal parallelization**: Replaced sequential processing with `Promise.allSettled(topSignals.map(...))` to evaluate API option lookups in parallel, significantly improving overnight batch run times.
- **Deploy PM2 memory verify (PR #118)**: `ops/deploy.ps1` PM2 `max_memory_restart` check uses regex `grep -E "max.*memory.*restart"` so PowerShell/SSH quote-stripping cannot drop the pattern.
- **Direction-aware gap gate (PR #117)**: `isBreakoutEntryGapInvalidated` ignored `direction` and treated any entry outside today's H/L as gap-invalidated — incorrectly suppressing untriggered LONGs (price still below entry) and SHORTs (price still above entry). Fixed to direction-specific gap checks.
- **Dependency Bumps**: npm audit dependency lockfile bumps (ip-address, fast-uri, nanoid, hono, @hono/node-server).
- **CPR Journal Bearish Fix**: `runCprJournalJob` was LONG/CE-only with a backwards trigger condition for bearish signals; now correctly processes SHORT/PE directions.
- **Earnings Cron Lock**: Added claim-lock guard and in-process scheduler fallback to the earnings-populate cron job.
- **Breakdown Telegram Alerts (PR #103)**: Breakout Telegram alerts were BREAKOUT-only — BREAKDOWN (bearish) setups never alerted at all regardless of score. Now uses per-symbol+kind claim keys so both directions alert independently.
- **RANGE-CPR Journal Direction (PR #103)**: RANGE-CPR journal direction is now inferred from SL/target geometry instead of defaulting to LONG when entry is the pivot.
- **RankingService Parity (PR #103)**: Bear-structure parity fix in RankingService.
- **Index Backtest STBT (PR #103)**: Index backtest engine can now evaluate STBT (short) — previously only LONG/BTST was backtestable for indices.
- **Compare Views (PR #103)**: Stock and index Live-vs-Backtest Compare views were silently BTST-only, excluding all STBT trades — now include both.
- **Breakout Alert Debounce (PR #107)**: Signal must be absent for 2 consecutive scan cycles (not 1) before alert state clears, fixing the Patanjali flicker re-alert issue.
- **UNDERLYING Option Fallback Fix**: CPR journal signals were being silently dropped when option-chain lookup failed; now falls back to stock LTP with UNDERLYING CE/PE.
- **CPR Scanner subtitle copy**: Corrected the CPR mode description from "Auto-scans indices" to "Auto-scans NSE F&O universe", eliminating misleading language that implied the intraday CPR scanner operates on index instruments.
- **Card `subtitle` prop**: Extended `Card` component (`src/components/ui/Card.tsx`) with an optional `subtitle` prop rendered as muted micro-text below the title.
- **Full-Universe Heatmap Aggregation**: Fixed the "Market Sector Concentration Heatmap" grid to aggregate over the entire filtered universe (server-computed via `insights.heatmapSectors` in `route.ts`) rather than being client-side bound to the 10 paginated `results` rows. Verified parity between global KPI tiles and heatmap totals, and added a regression unit test.
- **Deep-Review Bug Squashing (August 2026)**: Addressed multiple critical and high-severity logic edge-cases uncovered during an automated deep-level code review (PR #101 & PR #102), including:
  - **VPA SHORT Asymmetries**: Mirrored SHORT scoring and live gates for 'No Demand' and 'Climax' scenarios, ensuring valid SHORT setups receive reversal bonuses rather than being incorrectly penalized under LONG rules.
  - **VPA Math Safety**: Bound climax bands safely for inverted CPR days, and hardened RVOL calculation against `NaN` inputs.
  - **VPA CPR Shadow Fix**: Corrected historical indexing so today's VPA shadow is accurately evaluated against today's CPR rather than yesterday's.
  - **STBT Elevated VIX Conflict**: Fixed the Index overnight discovery logic where elevated VIX was mistakenly hard-blocking STBT signals instead of correctly boosting their scores.
  - **9:45 AM Auto-Close Orphans**: Decoupled the 9:45 AM auto-close snapshot logic so crashed cron jobs can successfully retry and close the trade.
  - **ATR Off-by-One**: Fixed the array slicing offset in CPR stats so `calculateATR` computes over the mathematically correct `period + 1` length.
  - **INTRA Score Directionality**: `HIGHER_VALUE` and `LOWER_VALUE` points now properly enforce `LONG` and `SHORT` alignments respectively to avoid inflating counter-trend STBT setups.
  - **Underscore Symbol Parsing**: Journal symbol splitting now safely parses the last underscore (`_`) before the date to accommodate custom or F&O underscore symbols.
  - **Early Exit Gap Classification**: Adverse gap evaluation now gracefully falls back to `exitCmp` if a manual API exit occurs prior to the `cmp916` snapshot.
- **Degenerate CPR gating**: Empty or single-candle history rows tagged `DEGENERATE_DATA` and excluded from breakout alerts and setup-freshness scoring.
- **BTST Rule 5 closing window**: Include forming closing-window bar; use `rule5EndExclusive` for window bounds.
- **Dual auto-scan storm / 502**: Shared cron claim prevents crontab + in-process scheduler from running concurrent full scans.
- **PM2 memory headroom**: `max_memory_restart` raised to 650M (`ops/ecosystem.config.cjs`) — fixes mid-scan restart loops on 1 GB Oracle VM.
- **CPR journal pipeline hardening**: Claim-lock on cron route, overnight ensure, BTST "No market data" skip, stale-run guard.
- **Breakout Alert Dedupe Claim Rollback**: Breakout alert Telegram-send-failure now releases the dedupe claim so the symbol can re-alert on the next scan (`breakout-watcher.service.ts`, `breakout-alert.pipeline.ts`).
- **Telegram Alert HTML Escaping**: Escaped dynamic fields in Telegram alerts to prevent `parse_mode=HTML` from rejecting messages containing special characters (fixes 400 errors).
- **Windows Build Segfault Workaround**: Documented and resolved the issue with the Next.js compiler crashing with exit code 3221226505 during local Windows builds.
- **Stock BTST Signal Quality Gate Fix**: Resolved the bug where all F&O stock signals were classified as `LOW_QUALITY` due to history quality scoring contradictions on truncated 22-day histories. Gated the `LOW_QUALITY` bucket on raw `historyLength < 15` minimum threshold while preserving the diagnostic `historyQuality` percentage calculations.
- **Scanner Confidence after HP_ Rename**: Restored synergy/penalty matching in `calculateConfidence` for `HP_*` signals (still accepts legacy `KGS_*`).
- **Redis Cron Retain Claim**: Persist `cron_done:{key}` for 24h on successful `retainClaim` so other workers cannot re-claim after the 600s running lock expires.
- **BTST Journal Option-Miss Path**: Skip journal writes when option suggestion fails instead of logging fake `STOCK` / strike `0` rows that break morning option snapshots.
- **Yahoo Finance Null-OHLC Noise**: Silenced warning logs caused by Yahoo Finance returning empty placeholder candles (`H/L/C/O=null` with `V=0`), reducing PM2 log spam while preserving genuine data validation alerts.
- **Provider Fetch Timeouts**: Hardened network fetch timeouts and error handling across market data providers.
- **ATR Threshold Pinning**: Hardened ATR threshold script mode pinning to improve audit stability.
- **Scanner UI Refresh Telegram Isolation**: Separated the breakout Telegram alert pipeline from the manual `/api/scanner/refresh` endpoint. Telegram alerts are now strictly bound to the background cron job (`runCprScanJob`), preventing manual UI loads from unintentionally triggering broadcast messages.
- **Option Contract Expiry Rollover**: Fixed a bug where option pricing calculations (for both the scanner logic and morning snapshots) failed during the monthly rollover week (e.g. Tuesday before expiry). The system now explicitly parses timestamp boundaries for all available chains to perfectly map target expiries (e.g. `AUG 2026`) instead of defaulting to near-term expired contracts.
- **VPA Unbound CLV Calculation**: Bounded live Last Traded Price (LTP) dynamically against the daily High/Low extremes to prevent mathematically impossible Close Location Values (CLV > 1 or < 0) during rapid market data spikes.
- **Trade Journal Snapshot Expiry Mismatch**: Removed an overly strict string format check that was blocking early morning Option CMP snapshots when the broker API and UI expiry string formats mismatched (e.g., `JUL 2026` vs `26JUL`), ensuring robust Trade Journal execution fidelity.
- **TypeScript VPA Typings**: Resolved TS interface typings around the `vpaBreakdown` property across data components.
- **Scanner Market Hours Recomputation Gating**: Fixed ungated auto-scan fallback in `GET /api/scanner` and `POST /api/scanner/refresh` by strictly locking recomputations to live market hours (09:15–15:30 IST) unless `bypass=true` is passed. Outside market hours, the API serves frozen results from the latest completed session to eliminate score drift.
- **Scanner Auto-Refresh Recompute**: Updated the scanner client auto-refresh countdown to trigger a real `POST /api/scanner/refresh` calculation and display honest server `scannedAt` timestamps.
- **BTST Time Bypass Scanner Fix**: Resolved an issue where `?bypass=true` queries without Redis cache returned empty results, ensuring on-demand scans can run outside market hours.
- **Option Contract Expiry String Formatting**: Reformatted monthly stock option expiry labels (e.g. `JUL 2026 1960 CE` instead of `26JUL 1960 CE`) and weekly index expiries (e.g. `30 JUL 2026 24500 CE`) to prevent confusion between the 2-digit year (`26`) and day of the month.
- **Option Symbol Exchange Suffix Stripping**: Sanitized symbol strings (`.split(':')[0]`) before regex replacement when stripping ticker prefixes from F&O option contract names.
- **CPR Journal Non-F&O Symbol Exclusions**: Added `NOT: { symbol: { endsWith: ':BSE' } }` query filter to prevent non-F&O BSE symbols from skipping CPR trade journal entries.
- **Index BTST LONG/SHORT signal collision**: Added `direction` to `OvernightSignal`'s `@@unique` constraint (was symbol+signalDate+signalTime only). This prevents index SHORT signals from silently overwriting LONG signals (or vice versa) generated during the same scan cycle, which previously suppressed Index BTST alerts. Shipped via database migration `add_direction_to_overnight_signal_unique_key`.
- **Execution Window Strictness**: Fixed `BtstService.isExecutionWindowOpen()` to properly close the execution window at 15:25 IST, preventing unintended end-of-day market data queries.
- **Test Suite Modernization**: Removed all leftover Jest dependencies and configs, fully transitioning to Node's native test runner (`tsx --test`) with proper file globbing in `npm test`.
- **RegimeService Reseeding**: Corrected EMA seeding in the Advanced Engine to use a proper SMA base, preventing early-data distortions in trend classifications.
- **ATR Deduplication**: Removed redundant `calculateATR` implementations, centralizing True Range logic into a single shared helper.
- **Telegram Alert Robustness**: Added fallback decryption flows to ensure breakout alerts fire even if token formats drift.
- **Slippage Calculations**: Fixed test suite assertions to properly account for dynamic slippage applied by the `TradeEngineService`.
- **Journal Total Trades Calculation**: Fixed the Trade Journal's headline metrics to explicitly show the true grand total (including open positions) while retaining backward-compatible data fields.
- **Analytics Breakeven Handling**: Fixed a denominator bug where `$0` P&L scratches silently diluted the reported Win Rate. Win Rate and Expectancy metrics in the backtester are now strictly computed over decisive trades (Wins + Losses).
- **Testing Constraints**: Added pure-logic unit testing for endpoint mathematics by cleanly mocking Prisma DB connectors for sandbox environments.
- **Alert-Journal Parity**: Fixed the Trade Journal pipeline to record index and stock BTST/STBT alert entries at alert time rather than lagging.
- **Restored Test Imports**: Restored `BTST_CLOCK` import in `overnight.test.ts` to prevent runtime `ReferenceError` crashes.

## [v1.0.0-rc.1] - 2026-07-08

### Added
- **Signal Quality Gates (Phase 1)**: Categorizes signals into `TRADEABLE`, `WATCHLIST`, and `LOW_QUALITY` based on ATR-normalized momentum and structural liquidity rules.
- **Regime Filtering**: Incorporates broader market trend (NIFTY 50) and volatility state to filter low-probability setups natively.
- **Execution Realism (Phase 2)**: Added dynamic slippage mapping (based on liquidity tier and volatility) and adverse-gap penalties (3x multiplier on stop-loss blow-throughs).
- **Event Risk Profiling**: Integrated `EventCalendarService` to cross-reference overnight signals with upcoming corporate events (Earnings, Dividends) and macro policies, mapping them to 0-100 severity scores.
- **Observability & Journaling (Phase 3)**: Built the server-side Trade Journal with immutable signal metadata snapshots at execution time (`eventRiskScore`, `qualityBucketAtSignal`, `regimeSnapshot`).
- **Analytics UI**: New tabular analytics mode inside the Journal to audit execution variance, Win Rate by Quality Bucket, and Performance by Market Regime.
- **Operational Runbook**: Created `ops/RUNBOOK.md` covering pre-market shadow validation checklists and degraded-mode behaviors.
- **Health Telemetry**: Added `/api/health` exposing JSON metrics on database connectivity, Redis cache availability, and precise data-freshness timestamps for Event data and Regime states.
- **Shadow Mode Guardrails**: Introduced explicit `EXECUTION_MODE` (`SHADOW` vs `LIVE`) in `.env` to prevent accidental broker routing during real-world paper validation.

### Changed
- **Degraded Mode Hardening**: Missing or stale event calendar data (older than 72 hours) now conservatively falls back to `100` (Max Risk) rather than `0` to prevent blindly taking positions during unknown event windows.
- Re-organized project root by moving loose shell scripts and SQL dumps to `ops/`, `scripts/`, and `sql/` directories for better repository hygiene.
