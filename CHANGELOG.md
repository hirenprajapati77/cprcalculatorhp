# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

### Changed
- **Fyers Primary Data Provider**: Upgraded the live data pipeline to use the Fyers API as the primary data provider, eliminating the 1-2 minute price delay experienced with Yahoo Finance. Yahoo Finance is now maintained strictly as a reliable outage fallback.
- **CPR Journal Cron Window**: Adjusted the CPR journal cron job start time to 15:20 IST.
- **Event Risk Lookahead via Trading Sessions**: Updated the corporate event scanner lookahead window and severity decay model to strictly use NSE trading sessions (`addTradingDays`) instead of calendar days. This correctly bridges weekends and holidays so Thursday scans can look ahead to Monday and Tuesday earnings accurately.
- **BTST/STBT Group-Only Telegram Alerts**: Routed BTST/STBT alert signals strictly to Telegram group chats (falling back to personal chat only if group ID is unconfigured).
- **VPA CLV Threshold Scaling**: Rescaled VPA CLV constants `BULLISH` to `0.4` and `BEARISH` to `-0.4` in `vpa.config.ts` to align with the `[-1, 1]` scale of `computeClv()`.
- **Hardened Deployment Script**: Improved `deploy.ps1` to use clean `npm install` and local Prisma client binary paths, making it highly robust against Windows file locks.

### Fixed
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
