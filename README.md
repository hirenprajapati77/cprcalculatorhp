# CPR PRO — Algorithmic BTST/STBT Execution Engine

A production-grade algorithmic validation engine built with Next.js 15, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and Redis caching. This platform has evolved from a standalone Central Pivot Range (CPR) charting terminal into a high-fidelity, execution-aware overnight trading system designed for disciplined shadow validation and eventual live deployment.

---

## ⚡ Features

- **Overnight Validation Engine:** Advanced Engine (`OvernightService`, score 0–130) drives live UI, Telegram alerts, and Trade Journal picks from one `OvernightSignal` source of truth. Simple Engine remains for backtests and research Shadow scoring only.
- **End-to-End Journaling UI (Phase 3):** Full-stack trade journal with interactive data tables, inline editing for manual exits, CSV export, and signal analytics dashboards tracking Win Rate, Avg PnL, and Exec Variance.
- **Intraday Snapshots (T+1):** Automated cron jobs capture exact option prices at 9:16, 9:30, 9:45, and 10:00 AM on the next trading day, locking in true execution data for journal fidelity.
- **Advanced CPR Analytics:** Rolling 20-day CPR compression checks, dynamic Pivot-Distance grading, and relationship matching (Higher/Lower/Inside/Overlapping).
- **Strict Quality Gates:** Filters low-probability setups utilizing broader market regime alignment (NIFTY 50 trend), structural liquidity rules, and 15-day ATR momentum histories.
- **Event-Risk Profiling:** Automatically cross-references setups against corporate (Earnings/Dividends) and macro events, applying a hard fallback if calendar data goes stale.
- **Server-Side Journaling:** Immutable signal metadata snapshots — **Advanced** score (authoritative) plus optional **Shadow** (Simple V2 research), regime, and event risk — bound to every generated trade.
- **Aesthetic Terminal UI:** Responsive dark-themed dashboard mapping raw CPR calculations alongside execution telemetry (Recharts).
- **Resilient Fallback Design:** Database Circuit Breaker pattern with gracefully degraded cached responses, ensuring 99.9% uptime for the UI even during database outages.
- **Strict Environment Validation:** Zod-enforced environment variable schemas fail fast at startup if configuration is invalid. **`APP_ACCESS_TOKEN` is required in production.**
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

1. **Overnight Signal Discovery**: Scans the `NSE_FNO` universe during **15:10–15:25 IST** (confirm slice 15:20–15:25). Journal cron finalizes picks at **15:25–15:30 IST**. Scoring uses VDU, narrow CPR, Higher/Lower Value, VWAP, 15m confirmation, and close strength (max 130).
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

**Recent Updates (July 2026):**
- **Unified Index Scanner**: Shipped new index scanner (`/api/index-scan`) aggregating intraday and overnight BTST signals for index instruments (`^NSEI`, `^NSEBANK`, `^BSESN`). Features regime-aligned modifiers and elevated-VIX ignore gates.
- **Bypass Retention Mode**: Supported `?bypass=true` queries on BTST and Overnight endpoints allowing client UIs to view cached execution data up to midnight (12:00 AM IST) without executing redundant live scans.
- **Security & Performance Hardening**: 
  - Standardized `timingSafeEqual` constant-time middleware comparisons to prevent token length attacks.
  - Implemented `yahoo5mChartMemo` lookup caching in index scanner, sharing a single live fetch.
  - Enforced calendar event freshness checks by default in production and optimized bulk database checks.
- Shipped interactive Trade Journal UI (with analytics charts, CSV export, and signal breakdowns).
- Implemented T+1 morning automated option price snapshots via cron (9:16 AM, 9:30 AM, 9:45 AM, 10:00 AM) to build realistic outcome data.
- Standardized security deployment for API cron endpoints via strict token validation (`CRON_SECRET`).

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
   ```
   Production will refuse to start without `APP_ACCESS_TOKEN`. Schedule `btst-journal` crontab inside **15:25–15:30 IST**.
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
