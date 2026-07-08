# CPR PRO — Algorithmic BTST/STBT Execution Engine

A production-grade algorithmic validation engine built with Next.js 15, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and Redis caching. This platform has evolved from a standalone Central Pivot Range (CPR) charting terminal into a high-fidelity, execution-aware overnight trading system designed for disciplined shadow validation and eventual live deployment.

---

## ⚡ Features

- **Overnight Validation Engine:** High-fidelity BTST/STBT signal generation with parallel tracking of live expectations vs executed reality.
- **Strict Quality Gates:** Filters low-probability setups utilizing broader market regime alignment (NIFTY 50 trend), structural liquidity rules, and 15-day ATR momentum histories.
- **Event-Risk Profiling:** Automatically cross-references setups against corporate (Earnings/Dividends) and macro events, applying a hard fallback if calendar data goes stale.
- **Server-Side Journaling:** Immutable signal metadata snapshots (V2 Score, Regime, Event Risk) bound to every generated trade for off-line divergence analysis.
- **Aesthetic Terminal UI:** Responsive dark-themed dashboard mapping raw CPR calculations alongside execution telemetry (Recharts).
- **Resilient Fallback Design:** Dual-database compatibility (PostgreSQL/SQLite) and robust caching fallbacks (Redis/In-memory).

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 15 (App Router, Server Components), TypeScript, Tailwind CSS, React Hook Form, Zod, Recharts, Framer Motion, Lucide React.
- **Backend:** Next.js API Routes, Prisma ORM, PostgreSQL, Redis.
- **Testing:** Node.js native test runner (`node:test`, `node:assert`), TSX.
- **DevOps:** Docker, Docker Compose.

---

## 🏛️ Architecture & Execution Model

The platform goes beyond raw signal generation by implementing a realistic, multi-layered execution architecture:

1. **Overnight Signal Discovery**: Scans the `NSE_FNO` universe for potential BTST/STBT setups based on CPR, gaps, and momentum parameters.
2. **Signal Quality Gates (Phase 1)**: Evaluates raw signals against dynamic thresholds, assigning them into `TRADEABLE`, `WATCHLIST`, or `LOW_QUALITY` buckets. It incorporates:
   - **Regime Filtering**: Matches signal direction against the broader market trend (NIFTY 50 Bull/Bear) and volatility context.
   - **Liquidity & History Rules**: Requires minimum daily average volume and robust historical data (minimum 15 days) to ensure reliable ATR calculations.
3. **Execution Realism (Phase 2)**:
   - **Event Risk Profiling**: Uses a bulk-fetching `EventCalendarService` to flag individual stock and macro events (e.g., Earnings, RBI Policy) that could unpredictably override technical signals.
   - **Dynamic Slippage**: Slippage is not hardcoded. It dynamically scales based on the stock's liquidity tiers and the market's current volatility regime (`HIGH` / `NORMAL` / `LOW`).
   - **Gap Penalties**: Differentiates between favorable and adverse gaps. Implements a severe penalty multiplier (3x) for adverse stop-loss blow-throughs (auction fills) while applying standard slippage to favorable target gaps.
4. **Observability & Journaling (Phase 3 - Completed)**: End-to-end telemetry (e.g., `eventRiskReason`, `slippageModelVersion`, `regimeSnapshot`) tracks exactly *why* a model generated or downgraded a signal, allowing for direct parity analysis against the executed `TradeJournal`. With the new UI layers, execution outcomes (`EXECUTION_SLIPPAGE`, `GAP_FAILURE`, `MODEL_VALID`) are visually audited inside the native journal tab.

---

## 📜 Releases & Changelog
For a detailed version history and architectural changes, please see the **[CHANGELOG.md](CHANGELOG.md)**.
Release `v1.0.0-rc.1` marks the formal transition from a technical terminal into a fully observability-layered overnight execution engine.

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

---

## 🐳 Docker Deployment (Shadow Validation)

The platform is fully containerized and production-ready for controlled shadow trading.

1. **Configure Environment:** Ensure your `.env` is explicitly gated:
   ```env
   EXECUTION_MODE="SHADOW"
   APP_VERSION="v1.0.0-rc.1"
   ```
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
  "version": "v1.0.0-rc.1",
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
