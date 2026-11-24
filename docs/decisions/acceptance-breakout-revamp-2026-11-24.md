# Acceptance Gate: 3-Step Breakout Architecture Revamp & Production Deployment

**Date:** 2026-11-24  
**Scope:** Complete 3-step breakout architecture revamp: Volume Telemetry & Range Provenance (Step 1), Pace-Normalised Volume (Step 2), and ORB Entry & Stop Re-anchoring (Step 3).  
**Pull Requests Merged:**
- PR #327 (`1673620b`): Step 1 — Volume Telemetry & Range Provenance
- PR #328 (`2aad5bd6`): Step 1 Hotfix — Fractional `avgVolume` BigInt Rounding
- PR #329 (`2c66850f`): Step 2 — Pace-Normalised Volume for Category B Scoring
- PR #330 (`cadb13d9`): Documentation for Steps 1 & 2
- PR #331 (`6abd0781`): Step 1 & 2 Reviewer Findings — Curve continuity, DB dedupe, alert cooldown & session check
- PR #332 (`d6dcc1ca`): Step 2 — Curve Fit & Production Activation (`FEATURE_PACE_VOLUME="true"`)
- PR #333 (`63313a5b`): Step 3 — ORB Entry & Stop Re-anchoring

**Production Release Commit:** `63313a5ba166`  
**Target Environment:** `https://129-159-230-41.nip.io` (Ubuntu 24.04 LTS, Node.js 20.20.2, PM2 fork_mode, PostgreSQL 15, Redis 6)

---

## 1. Acceptance Checklist & Verification Status

| Gate | Category | Description | Status | Verification Evidence |
| :---: | :--- | :--- | :---: | :--- |
| **G-01** | **Type Safety** | Clean compilation with zero TypeScript errors | ✅ **PASSED** | `npm run typecheck` (`tsc --noEmit`) returned exit code 0 |
| **G-02** | **Code Quality** | Zero ESLint warnings or errors | ✅ **PASSED** | `npm run lint` returned exit code 0 |
| **G-03** | **Unit & Integration Suite** | All unit and integration test suites pass | ✅ **PASSED** | `npm test`: **1,649 passed · 0 failed · 2 skipped · 320 suites** (including 14 new ORB unit tests) |
| **G-04** | **CI Gate** | Blocking GitHub Actions CI verification workflow | ✅ **PASSED** | GitHub Actions CI run on PR #333 passed all checks in 3m 19s |
| **G-05** | **Step 1: Telemetry Ingestion (PR #327, #328, #331)** | VolumeTelemetry records tick data with provenance & deduplication | ✅ **PASSED** | Migration `20261119000000_volume_telemetry` + unique constraint active; 3,000+ rows ingested cleanly; 91.7% `FYERS_QUOTE` |
| **G-06** | **Step 2: Pace Normalisation (PR #329, #331, #332)** | Calibrated intraday volume curve with opening guard | ✅ **PASSED** | Floor 0.05, midday anchor 0.48, `FEATURE_PACE_VOLUME="true"` active in production `.env`; morning breakouts score 75–80 instead of 10–15 |
| **G-07** | **Step 3: Dual Entry Anchoring (PR #333)** | ORB High/Low entry + Midpoint SL when OR is broken with volume | ✅ **PASSED** | `computeTradeSetup` dynamically sets `setupType: 'ORB_BREAKOUT'`, `entry: orHigh`/`orLow`, `stopLoss: orMidpoint`, targets at 1.0R / 1.5R / 2.0R |
| **G-08** | **Step 3: ORB Price Staleness Gating (PR #333)** | Eliminate false `GAP_INVALIDATED` and `EXTENDED` rejections | ✅ **PASSED** | `evaluateOrbSetupStaleness` evaluates boundary breach and extension against OR levels; 14/14 unit tests pass |
| **G-09** | **Alert Deduplication & Cooldown (PR #331)** | Telegram notifications protected by per-symbol cooldown & safe dispatch | ✅ **PASSED** | `sendAlertSafely` wraps alert calls with symbol cooldown; eliminates spam during high-volatility sweeps |
| **G-10** | **Production Smoke Verification** | Clean PM2 deployment, zero restarts, memory cap verified | ✅ **PASSED** | `ops/deploy.ps1` completed; PM2 PID `2249505` online at 273.8 MB / 650 MB limit, 0 restarts; `/api/health` returns `200 OK` with build `63313a5ba166` |

---

## 2. Summary of Architecture Milestones Resolved

### Step 1: Volume Telemetry & Range Provenance (`PR #327`, `PR #328`, `PR #331`)
- **Problem:** Previous volume calculations relied on ambiguous daily snapshots with no tick-level provenance, making it impossible to calibrate morning breakout thresholds.
- **Resolution:**
  - Added `VolumeTelemetry` table storing `symbol`, `date`, `minuteOfDay`, `sessionVolume`, `avgVolume`, `rawRatio`, `rangeProvenance`.
  - Tagged quote origins explicitly (`FYERS_QUOTE`, `INTRADAY_TODAY_BAR`, `STALE_PREV_DAY`).
  - Integrated 30-day rolling retention cron into `/api/cron/retention`.
  - Added `Math.round()` prior to `BigInt` conversions for fractional 20D/50D volumes.
  - Added unique constraint `@@unique([symbol, date, minuteOfDay])` and upsert deduplication.

### Step 2: Pace-Normalised Volume (`PR #329`, `PR #331`, `PR #332`)
- **Problem:** At 09:30–10:00 IST, stocks breaking out on massive relative volume (e.g., `APOLLOHOSP` 6.7×, `INDUSINDBK` 2.7×) only accumulated a fraction of full-day volume, scoring 10–15 in Category B (below the 75-point alert threshold).
- **Resolution:**
  - Implemented `sessionProgress()` and `expectedVolumeFraction()` across the 375-minute NSE session.
  - Pre-09:30 guard returns 1.0; post-09:30 scales from empirical 0.05 floor to 0.48 midday anchor.
  - Resolved boundary step discontinuity for smooth monotonic continuity.
  - Sourced pace-adjusted ratio `volumeRatio = rawVolumeRatio / expectedFraction` into `RankingService` and `ScannerService`.
  - Activated in production via `FEATURE_PACE_VOLUME="true"`.

### Step 3: ORB Entry & Stop Re-anchoring (`PR #333`)
- **Problem:** Stocks gapping significantly past CPR boundaries (e.g., `TATASTEEL` gapping down past BC `176.48` into `[169.1, 173.8]`) were falsely rejected by price gating as `GAP_INVALIDATED` or `EXTENDED` because entry was anchored to the distant CPR line.
- **Resolution:**
  - Derived 15-minute Opening Range (`orHigh`, `orLow`, `orMidpoint`, `orRange`) from initial 09:15–09:30 IST candle.
  - Implemented dual setup anchoring: CPR Pullback when within CPR/OR range; ORB Breakout when boundary is breached on `volumeRatio >= 1.5`.
  - ORB entries set to `orHigh` (Long) / `orLow` (Short) with Stop Loss anchored to `orMidpoint`.
  - Implemented `evaluateOrbSetupStaleness`: extension and gap invalidation measured against OR boundaries instead of CPR levels.

---

## 3. Production Deployment & Runtime Telemetry

- **Deployment Script:** `ops/deploy.ps1` with `$env:CONFIRM_PROD_DEPLOY = 'true'`
- **Target Server:** `129.159.230.41`
- **PM2 Process:** `cpr-platform` (PID `2249505`), fork mode, Node.js 20.20.2
- **Memory:** `273.8 MB` / `650 MB` cap, 0 restarts
- **Health Check Endpoint:** `https://129-159-230-41.nip.io/api/health`
  ```json
  {"status":"healthy","build":"63313a5ba166"}
  ```
- **Environment Flags:**
  ```bash
  FEATURE_PACE_VOLUME="true"
  NEXT_PUBLIC_BASE_URL="https://129-159-230-41.nip.io"
  ```
- **Market State:** Quiet (Guru Nanak Jayanti market holiday), schedulers initialized, armed for Wednesday Nov 25 opening bell.
