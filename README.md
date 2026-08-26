# CPR PRO — Algorithmic BTST/STBT Execution Engine

A production-grade algorithmic validation engine built with Next.js 15, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and Redis caching. This platform has evolved from a standalone Central Pivot Range (CPR) charting terminal into a high-fidelity, execution-aware overnight trading system designed for disciplined shadow validation and eventual live deployment.

---

## ⚡ Features

- **Overnight Validation Engine:** Advanced Engine (`OvernightService`, score 0–130) drives live UI, Telegram alerts, and Trade Journal picks from one `OvernightSignal` source of truth. Simple Engine remains for backtests and research Shadow scoring only.
- **Volume Price Analysis (VPA) Confirmation Layer**: Implements algorithmic footprint tracking (Close Location Value & Relative Volume) to computationally filter weak breakouts. Features a robust `VPA_SHADOW_MODE` master kill-switch to execute mathematically without interfering with base production scores until proven.
- **End-to-End Journaling UI (Phase 3):** Full-stack trade journal with interactive data tables, inline editing for manual exits, CSV export, and signal analytics dashboards tracking Win Rate, Avg PnL, and Exec Variance.
- **Intraday Snapshots (T+1):** Automated cron jobs capture exact option prices at 9:16, 9:30, 9:45, and 10:00 AM on the next trading day, locking in true execution data for journal fidelity.
- **Advanced CPR Analytics:** Rolling 20-day CPR compression checks, dynamic Pivot-Distance grading, and relationship matching (Higher/Lower/Inside/Overlapping).
- **Strict Quality Gates:** Filters low-probability setups utilizing broader market regime alignment (NIFTY 50 trend), structural liquidity rules, and 15-day ATR momentum histories.
- **Event-Risk Profiling:** Automatically cross-references setups against corporate (Earnings/Dividends) and macro events, applying a hard fallback if calendar data goes stale.
- **Server-Side Journaling:** Immutable signal metadata snapshots — **Advanced** score (authoritative) plus optional **Shadow** (Simple V2 research), regime, and event risk — bound to every generated trade.
- **Aesthetic Terminal UI:** Responsive dark-themed dashboard mapping raw CPR calculations alongside execution telemetry (Recharts).
- **Resilient Fallback Design:** Database Circuit Breaker pattern with gracefully degraded cached responses, ensuring 99.9% uptime for the UI even during database outages.
- **Strict Environment Validation:** Zod-enforced environment variable schemas fail fast at startup if configuration is invalid. **`APP_ACCESS_TOKEN` is required in production.**
- **Market Session Profile (CAS-ready):** Timings come from `MARKET_PROFILE` (`CONTINUOUS` default = current production clocks). `CLOSING_AUCTION` is dormant until explicitly enabled — see [`docs/CAS_ANALYSIS.md`](docs/CAS_ANALYSIS.md).
- **Redis First Caching:** All module-level maps replaced with TTL-managed Redis caches for horizontal scalability.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 15 (App Router, Server Components), TypeScript, Tailwind CSS, React Hook Form, Zod, Recharts, Framer Motion, Lucide React.
- **Backend:** Next.js API Routes, Prisma ORM, PostgreSQL, Redis.
- **Testing:** Node.js native test runner (`node:test`, `node:assert`), TSX.
- **DevOps:** Docker, Docker Compose.

---

## 🏛️ Architecture & Execution Model

The platform goes beyond raw signal generation by implementing a realistic, multi-layered execution architecture:

1. **Overnight Signal Discovery**: Scans the `NSE_FNO` universe during **15:10–15:25 IST** under the default `CONTINUOUS` profile (confirm slice aligned with Rule 5). Journal cron finalizes picks at **15:25–15:30 IST**. Scoring uses VDU, narrow CPR, Higher/Lower Value, VWAP, 15m confirmation, and close strength (max 130). Under `MARKET_PROFILE=CLOSING_AUCTION`, discovery/journal windows follow SEBI CAS clocks (continuous ends 15:15; official close ~15:35) for eligible symbols via `MarketSessionResolver`.
2. **Signal Quality Gates (Phase 1)**: Evaluates raw signals against dynamic thresholds, assigning them into `TRADEABLE`, `WATCHLIST`, or `LOW_QUALITY` buckets. It incorporates:
   - **Regime Filtering**: Matches signal direction against the broader market trend (NIFTY 50 Bull/Bear) and volatility context.
   - **Liquidity & History Rules**: Requires minimum daily average volume and robust historical data (minimum 15 days) to ensure reliable ATR calculations.
3. **Execution Realism (Phase 2)**:
   - **Event Risk Profiling**: Uses a bulk-fetching `EventCalendarService` to flag individual stock and macro events (e.g., Earnings, RBI Policy) that could unpredictably override technical signals. *(Note: Macro events currently require manual database insertion).*
   - **Dynamic Slippage**: Slippage is not hardcoded. It dynamically scales based on the stock's liquidity tiers and the market's current volatility regime (`HIGH` / `NORMAL` / `LOW`).
   - **Gap Penalties**: Differentiates between favorable and adverse gaps. Implements a severe penalty multiplier (3x) for adverse stop-loss blow-throughs (auction fills) while applying standard slippage to favorable target gaps.
4. **Observability & Journaling (Phase 3 - Completed)**: End-to-end telemetry (e.g., `eventRiskReason`, `slippageModelVersion`, `regimeSnapshot`) tracks exactly *why* a model generated or downgraded a signal, allowing for direct parity analysis against the executed `TradeJournal`. With the new UI layers, execution outcomes (`EXECUTION_SLIPPAGE`, `GAP_FAILURE`, `MODEL_VALID`) are visually audited inside the native journal tab.

---

## 📜 Releases & Changelog
For a detailed version history and architectural changes, please see the **[CHANGELOG.md](CHANGELOG.md)**.
Release `v2.0.0-production` marks the formal transition from a technical terminal into a fully observability-layered overnight execution engine.

**Recent Updates (August 2026):**
- **PR #147 — Deep Code Review: 18 Production Bug Fixes (Aug 26)**: Systematic security, reliability and correctness fixes across all market-tools modules added this week. **Critical**: Auth gate on unauthenticated `?refresh=true` DDoS vector, null-dereference crash in scanner route (`signalSummary?.includes`), and CPR journal 60s retry storm when signals suppressed. **High**: `BigInt(NaN)` crash on malformed bhavcopy volume, OHLC NaN SQL injection, non-transactional batch upserts leaving partial-day data, backfill skip threshold raised from 500→2000 rows, fail-fast on missing `.next/BUILD_ID`, middleware `startsWith` auth bypass, Redis TTL pipeline race condition, and precompute job single-catch-all killing all 3 caches. **Medium**: `memInterval` scope fix + removal of `prisma.$disconnect` from library fn, Cup & Handle off-by-one in handle depth loop, missing `force-dynamic` on breadth route, `useEffect` AbortController cleanup. **Low**: redundant `@@index` in Prisma schema, `server.on('error')` handler, edge-case unit tests for empty/single-candle inputs. `tsc --noEmit` verified 0 errors.
- **PR #145 — Market Tools Phase 3: 52W High Pattern Breakout Scanner (Aug 26)**: Institutional chart pattern scanner detecting William O'Neil & Mark Minervini patterns (Cup & Handle, Flat Base, Double Bottom, VCP) across 2,600+ NSE `EQ` symbols. Features 250-day history depth guards, prior-day baseline 52W highs (`1 PRECEDING`), 20D RVOL volume confirmation, 0–100 composite Total Score with quality tiers (A+, A, B, C), deterministic pattern hierarchy tie-break, `/api/market-tools/pattern-breakout` endpoint, and responsive dark-theme dashboard with interactive pattern filter pills, search, and expandable structural detail cards.
- **PR #144 — Market Tools Phase 2: Multi-Year Breakout Scanner (Aug 25)**: Scans 2,600+ NSE `EQ` symbols from `DailyOhlcv` history. Computes trailing max highs across 1Y (250d), 2Y (500d), 3Y (750d), 5Y (1250d), 10Y (2500d), and ATH windows using SQL window functions (`ROWS BETWEEN N PRECEDING AND 1 PRECEDING`, excluding current day). Features strict history-depth guards (`historyDays >= windowDays`) returning `null` for windows lacking depth on current 261-day dataset (self-activating as daily Bhavcopy data grows), strongest BO hierarchy ranking, `/api/market-tools/breakout` endpoint, and responsive dark-theme UI with window tabs and sector filters.
- **PR #140 — CPR Journal Robustness Hardening / FORTIS Post-Mortem (Aug 20)**: Five layered fixes applied after forensic analysis of the FORTIS Aug 19 PE trade loss (−32% option P&L on +0.78% adverse spot gap). (1) **Regime gate**: CPR journal now fetches market regime and suppresses SHORT/PE in BULL regimes, LONG/CE in BEAR regimes — fail-closed when Nifty data is unreliable (`cpr-journal.job.ts`, `regime.service.ts`). (2) **Signal confluence filter**: New `validateCprSignalConfluence()` in `cpr-direction.ts` blocks `GAP_UP + SHORT`, `HP_CAM_BULL_BIAS + SHORT`, `HP_DIRECT_UP + SHORT`, and their LONG-side mirrors — the exact FORTIS tagging combination. (3) **Dynamic delta**: `option-suggestion.service.ts` replaces flat `delta=0.7` with depth-calibrated values (0.52/0.65/0.80) plus a DTE≤4 theta buffer (10% SL tighten) via the new `computeDTE()` helper. (4) **CPR GAP_FAILURE fix**: Removed erroneous `signalType !== 'CPR'` exclusion from `classifyExecutionOutcome` so CPR gap losses classify correctly as `GAP_FAILURE` not `EXECUTION_SLIPPAGE`. (5) **Dead tick guard**: `captureSnapshot` skips CMP < ₹0.25 at 9:16 AM; retries at 9:30/9:45. 11 new unit tests added; total 660/661 pass, 0 failures.
- **PR #139 — CPR Journal PCR Veto Gate (Aug 18)**: Wired `optionPcrContradictsDirection` into `cpr-journal.job.ts` so trades with PCR-contradicted option chains (e.g. CE on chain PCR < 0.8) are skipped from journaling (`symbol:PCR_CONTRADICTS`), ensuring 100% parity between Telegram alerts and trade journal entries.
- **PR #138 — Cross-Engine Breakout/Breakdown Conflict Gate (Aug 17)**: Symmetrical cross-engine filter (`evaluateBtstScannerConflict` / `EntryManagerService.evaluateBreakoutConflict`) suppressing BTST (LONG) on active intraday `BREAKDOWN` and STBT (SHORT) on active intraday `BREAKOUT` across alert crons, journal logging, and backtest helpers, preventing contradictory overnight picks.
- **PR #137 — Score-first overnight picks + breakout suppression UI (Aug 17)**: Overnight journal/alert top-N ranks by score (freshness tie-break); rescans dedupe to latest `signalTime` per symbol. Breakout Telegram gate suppressions (EXTENDED, VIX, PCR, etc.) persist on `ScannerResult` and render as **No alert: …** badges in the scanner setup column.
- **PR #136 — useCache trade levels (Aug 17)**: `GET /api/scanner?useCache=true` preserves stored entry/SL/target instead of overwriting with TC/BC/R1 on cached auto-scan responses.
- **PR #135 — Overnight empty calendar + in-window cache (Aug 16)**: Empty earnings calendar → `noKnownEventRisk()` / HIGH confidence; `/api/overnight` serves in-window cache during 15:10–15:25 IST like BTST.
- **PR #134 — NSE F&O drift fetch timeout (Aug 14)**: Added 10s `AbortSignal.timeout(10_000)` to `FnoUniverseCheckService.checkDrift()` when fetching `fo_mktlots.csv` from NSE archives, preventing indefinite request stalls.
- **PR #133 — Scanner persistence retry & failure visibility (Aug 14)**: Wrapped `ScannerController.persistScanResults()` in `DatabaseCircuitBreaker.execute()` with single 3s retry and 24h Redis failure marker logging (`scan_persist_failed:{universe}:{date}:{timestamp}`) on persistence timeouts.
- **PR #132 — C2 documentation & method alignment (Aug 13)**: Corrected C2 documentation and aligned `cpr-journal` with `suggestOption` and `btst-journal` with `suggestOptionForBtst`.
- **PR #130 & #131 — LICI bull-trap suppression & PCR gate cooldown (Aug 13)**: Suppressed LONG breakouts below prior close and SHORT breakdowns above prior close; standardized `MarketRegime.reliable === false` handling in `btst-journal.job.ts`.
- **PR #122 — Fyers quote batching + India VIX breakout gate (Aug 12)**: Prefetch Fyers LTP quotes in ≤50-symbol batches before scanner/overnight runs to cut REST churn and 429 rate limits; per-symbol history unchanged. Cron-only breakout Telegram alerts gated on India VIX — pause at ≥25, tighten score/chase in 18–24 band. Env: `FYERS_QUOTES_BATCH_SIZE`, `FYERS_QUOTE_CACHE_TTL_MS`.
- **PRs #114–#119 — Price-actionability + direction-aware UI (Aug 12)**: Telegram breakout alerts, CPR journal, and scanner setup column share gap/extension gates (no chase alerts). Gap checks are direction-aware so pending entries are not false-invalidated. Rating badges show Buy/Sell by direction; STBT rows tint red. Heatmap strong tier labeled `Strong`. Test-breakout uses the live gate; stale delivered claims clear `hadBreakout` while keeping the 4h cooldown. Deploy PM2 memory verify hardened against SSH quote-stripping. Selective Redis pruning in `mem_watchdog.sh` preserves cron claims/locks. Expanded lot-size fallbacks (30+ mid-caps) protect OptionSuggestion. Fixed test environment pollution from `.env` during direct test runs.
- **PR #108 — Secondary Breakout Target (target2 & rr2)**: Added secondary target levels (`target2`) and associated risk-reward ratios (`rr2`) to Trade Setup V3 calculations. Threaded them through the database schema (`ScannerResult` table migration), API routes, and Telegram breakout alerts template.
- **PR #98 — tradable scanner hardening (deployed)**: Today's-CPR entry/SL/target/RR (owner-approved option a), breakout hold/reclaim/15m confirmation, `DirectionSetupState` in Postgres, shared auto-scan cron claim, Fyers 15m VWAP enrichment, degenerate-history gating, PM2 650M headroom. Entry-basis decision: [`docs/decisions/cpr-entry-basis-2026-08-10.md`](docs/decisions/cpr-entry-basis-2026-08-10.md).
- **VPA Shadow Breakdown Persistence**: Persisted `vpaBreakdown` JSON metrics directly into `ScannerResult` in PostgreSQL to accumulate historical shadow analysis for false breakout evaluation.
- **Stock BTST Signal Quality Gate Fix**: Resolved the bug where all F&O stock signals were classified as `LOW_QUALITY` due to history quality scoring contradictions on truncated 22-day histories. Gated the `LOW_QUALITY` bucket on raw `historyLength < 15` minimum threshold while preserving the diagnostic `historyQuality` percentage calculations.
- **Market Session Profile (CAS)**: Added `MARKET_PROFILE=CONTINUOUS|CLOSING_AUCTION` with `MarketSessionResolver` so SEBI Closing Auction Session can be enabled without rewriting scoring. Default remains current production clocks. Full analysis: [`docs/CAS_ANALYSIS.md`](docs/CAS_ANALYSIS.md).
- **Aug-4 reliability fixes**: Scanner confidence accepts `HP_*` (post-rename); Redis cron retainClaim survives across workers; BTST journal skips option-miss instead of fake `STOCK`/strike-0 rows.

**Recent Updates (July 2026):**
- **Shadow VPA Confirmation Layer**: Added modular Wyckoff/Volume Price Analysis (VPA) scoring to signal metadata, viewable in the scanner/journal UI without affecting core BTST logic.
- **Performance & Logic Hardening**: Optimized Trade Journal summary queries to prevent OOM errors, corrected directional score logic for Long/Short setups, and improved Top Option mapping efficiency.
- **CPR Scanner Real Auto-Refresh**: Fixed scanner client timer to trigger real `POST /api/scanner/refresh` calculations and display honest server `scannedAt` timestamps.
- **Overnight Signal Availability & Bypass**: Enhanced `/api/overnight` with database fallback between **3:10 PM and 12:00 AM Midnight IST** and on-demand calculation when `?bypass=true` is enabled.
- **Option Contract Expiry Formatting**: Reformatted monthly stock option contract names to `JUL 2026 1960 CE` (full 4-digit year) and weekly index options to `30 JUL 2026 24500 CE`, eliminating month-vs-date ambiguity.
- **Telegram Breakout Option Suggestions**: Integrated option contract lookup (`🎯 Option: ...`) directly into Telegram breakout alert messages.
- **Fyers Primary Data Provider**: Upgraded the live data pipeline to use the Fyers API as the primary data provider, eliminating the 1-2 minute price delay experienced with Yahoo Finance. Yahoo Finance is now maintained strictly as a reliable outage fallback.
- **Telegram Alert Cron Isolation**: Re-architected the Telegram breakout alert pipeline to strictly bind to background cron jobs, ensuring that manual UI refreshes (`/api/scanner/refresh`) no longer unintentionally trigger broadcast messages to the channel.
- **Event Risk Lookahead via Trading Sessions**: Transitioned the corporate event risk scanner (Earnings, Dividends) to evaluate lookahead windows and decay models using true NSE trading sessions (`addTradingDays`) rather than static calendar days, properly bridging weekends and market holidays.
- **Unified Index Scanner**: Shipped new index scanner (`/api/index-scan`) aggregating intraday and overnight BTST signals for index instruments (`^NSEI`, `^NSEBANK`, `^BSESN`). Features regime-aligned modifiers and elevated-VIX ignore gates.
- **Security & Rate Limiting**: Added Redis-backed rate limiting (`/api/auth/unlock`), middleware access token validation, and constant-time comparisons.
- Shipped interactive Trade Journal UI (with analytics charts, CSV export, and signal breakdowns).
- Implemented T+1 morning automated option price snapshots via cron (9:16 AM, 9:30 AM, 9:45 AM, 10:00 AM) to build realistic outcome data.
- Standardized security deployment for API cron endpoints via strict token validation (`CRON_SECRET`).
- Added an `ops/package-repo.ps1` Git-archive script to securely export the codebase for deployment without inadvertently leaking local `.env` files.

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18.17.0 or higher (Node v24+ recommended)
- NPM v9+

### 1. Installation
Clone or navigate to the directory and install dependencies:
```bash
npm install
```

### 2. Database Auto-Setup (SQLite / Postgres)
Run the custom setup script in the project root. This script checks for PostgreSQL connection settings. If none are found, it automatically converts the Prisma provider to SQLite and configures a local `dev.db` out of the box:
```bash
node prisma-setup.js
```

### 3. Running Locally
Launch the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

#### ⚠️ Windows Next.js Build Workaround
On Windows environments using newer Node versions (e.g., Node v24+), running `npm run build` or `next build` may crash with a segmentation fault (`exit code 3221226505` / `0xC0000005`) during static page generation.

If this occurs, you can bypass the issue by temporarily appending the following configuration to `next.config.ts` during your build:
```typescript
const nextConfig: NextConfig = {
  // ... other configs
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};
```
Once the build completes, you can safely revert `next.config.ts` so as not to commit environment-specific performance limiters.

---

## 🧪 Testing

Execute the unit and schema validation test suite using Node's native runner:
```bash
npm test
```

*Note: For testing BTST endpoints locally outside the strict 15:10–15:25 IST execution window, you can use the `BTST_BYPASS_WINDOW=true` environment variable.*

---

## 🐳 Docker Deployment (Shadow Validation)

The platform is fully containerized and production-ready for controlled shadow trading.

1. **Configure Environment:** Ensure your `.env` is explicitly gated:
   ```env
   EXECUTION_MODE="SHADOW"
   APP_VERSION="v2.0.0-production"
   APP_ACCESS_TOKEN="your_secure_app_access_token"
   CRON_SECRET="your_secure_cron_secret"
   # Default = current production clocks. Set CLOSING_AUCTION only after CAS validation.
   MARKET_PROFILE="CONTINUOUS"
   ```
   Production will refuse to start without `APP_ACCESS_TOKEN`. Schedule `btst-journal` crontab inside **15:25–15:30 IST** (CONTINUOUS profile).

### 🔒 Gated Access Control
To protect browser APIs and dashboard pages, the platform utilizes a session-based access gate:
- **Explicit Unlock Required:** Access to dashboard pages (like `/scanner`, `/settings`, etc.) requires visiting `/unlock` and entering the configured `APP_ACCESS_TOKEN` passcode.
- **Secure Sessions:** On successful validation, a secure `app_access_token` HttpOnly cookie is set (SameSite=Strict, Path=/, MaxAge=7 days, Secure matching request/base URL protocol).
- **API Security:** All standard `/api/*` endpoints require the valid HttpOnly cookie or an `Authorization: Bearer <TOKEN>` header.
- **Exemptions:** Public routes (`/unlock`, `/about`, `/faq`, `/share/*`), Fyers API callback handlers, and cron triggers (which authenticate via `x-cron-secret`) are exempt.

2. **Pre-flight Check:** Run the deployment verification script on your host to catch config or schema mismatches before boot:
   ```bash
   bash scripts/deploy-check.sh
   ```
3. **Deploy:**
   ```bash
   docker compose up -d --build
   ```

### Server Smoke Test
Immediately after deploying, verify the engine's baseline health to ensure data freshness:
- [ ] Container startup logs successfully report `APP_VERSION`, `EXECUTION_MODE=SHADOW`, and DB connectivity.
- [ ] The `/api/health` endpoint payload returns `status: "healthy"`.
- [ ] Regime Snapshot Freshness and Event Data Freshness are marked healthy. *(Note: Stale event data >72h will universally block trades due to the engine's hard fallback policy).*
- [ ] Verify Docker container **cron** timing matches IST.

### Example Health Route Payload
You can poll `http://localhost:3000/api/health` to receive this validation payload:
```json
{
  "status": "healthy",
  "version": "v2.0.0-production",
  "executionMode": "SHADOW",
  "checks": {
    "database": "healthy",
    "redis": "connected",
    "signals": "healthy",
    "events": "healthy",
    "regime": "healthy"
  },
  "timestamps": {
    "latestSignal": "2026-07-08T09:45:00.000Z",
    "latestEvent": "2026-07-08T06:30:00.000Z",
    "latestRegime": "2026-07-08T04:15:00.000Z"
  }
}
```

For daily operational guidelines, refer to the **[Operational Runbook (ops/RUNBOOK.md)](ops/RUNBOOK.md)**.
