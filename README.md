# CPR PRO — Advanced Central Pivot Range Platform

A production-grade, high-fidelity Central Pivot Range (CPR) trading terminal built with Next.js 15, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and Redis caching.

---

## ⚡ Features

- **Central Pivot Range Engine:** Calculates Pivot Point, Top Central (TC), Bottom Central (BC), Resistance levels (R1–R4), and Support levels (S1–S4) using Daily High, Low, and Close parameters.
- **Aesthetic Trading Terminal UI:** Responsive dark-themed trading dashboard with glowing indicators, count-up animations, width progress bars, and custom trading insights.
- **Interactive Visualizations:** Horizontal level charts plotted dynamically on the price boundaries (via Recharts).
- **Session Overlay:** Multi-session comparison line charts displaying historical Pivot, TC, BC, R1, and S1 lines side-by-side to detect market momentum.
- **Dual-Storage Vault:** Session history synced with both browser local storage (local backup) and a backend database.
- **Data Export & Sharing:** Copy formatted levels in one click, download structured CSV data reports, or share public calculations via read-only tokenized URLs.
- **Resilient Fallback Design:** Dual-database compatibility (PostgreSQL in production, SQLite fallback in development) and caching fallbacks (Redis with in-memory map).

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
   - **Dynamic Slippage**: Slippage is not hardcoded. It dynamically scales based on the stock's liquidity tiers and the market's current volatility regime (HIGH/LOW/NORMAL).
   - **Gap Penalties**: Differentiates between favorable and adverse gaps. Implements a severe penalty multiplier (3x) for adverse stop-loss blow-throughs (auction fills) while applying standard slippage to favorable target gaps.
4. **Observability & Journaling (Phase 3 - Completed)**: End-to-end telemetry (e.g., `eventRiskReason`, `slippageModelVersion`, `regimeSnapshot`) tracks exactly *why* a model generated or downgraded a signal, allowing for direct parity analysis against the executed `TradeJournal`. With the new UI layers, execution outcomes (`EXECUTION_SLIPPAGE`, `GAP_FAILURE`, `MODEL_VALID`) are visually audited inside the native journal tab.

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

## 🐳 Docker Deployment

The platform is fully containerized. Start the Next.js standalone application along with dedicated PostgreSQL database and Redis caching servers:

```bash
docker compose up --build
```
This binds:
- Next.js Web App: [http://localhost:3000](http://localhost:3000)
- PostgreSQL Database: `localhost:5432`
- Redis Cache: `localhost:6379`
