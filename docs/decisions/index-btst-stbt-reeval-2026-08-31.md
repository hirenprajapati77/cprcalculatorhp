# Decision memo: Index BTST & STBT re-evaluation

**Status:** For Review
**Date:** 2026-08-31
**Scope:** Historical backtest re-evaluation for NIFTY, BANKNIFTY, and SENSEX indices across 2024, 2025, and 2026-H1 (modeled option cost methodology).

---

## Backtest Methodology & Cost Assumptions

- **Date Range:** 2024-01-01 to 2026-06-30 (2026-H1).
- **Scoring Model:** 130-point Advanced Index score adapter (scaled to 90-point daily candles without intraday features, Ready threshold at 59/90).
- **Cost Modeling:** Black-Scholes-modeled option transaction costs (overnight Theta decay + 2-leg Bid-Ask spreads) expressed as % of underlying spot.
  - **NSE Index Options (NIFTY/BANKNIFTY):** Bid-ask spread estimated as max(1 tick, 0.5% of option premium) × 2 legs.
  - **BSE Index Options (SENSEX):** Bid-ask spread estimated as max(1 tick, 1.0% of option premium) × 2 legs.
  - **Theta decay:** 1 calendar day of decay for Mon-Thu signals; 3 calendar days of decay for Friday (weekend hold) signals.
- **Option P&L:** Modeled option P&L = `0.50 * raw_return - cost` (representing 0.50 Delta option replication).

---

## Performance Metrics Breakdown

### NIFTY

| Period | Direction | Trades | Win Rate | Avg Win | Avg Loss | Expectancy | Avg R |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **2024** | **BTST (Long)** | 98 | 30.6% | 0.19% | -0.23% | -0.100% | 0.82 |
| | **STBT (Short)** | 14 | 28.6% | 0.17% | -0.26% | -0.140% | 0.64 |
| | **Combined** | 112 | 30.4% | 0.18% | -0.23% | -0.105% | 0.79 |
| **2025** | **BTST (Long)** | 84 | 35.7% | 0.20% | -0.24% | -0.078% | 0.87 |
| | **STBT (Short)** | 25 | 40.0% | 0.26% | -0.23% | -0.034% | 1.13 |
| | **Combined** | 109 | 36.7% | 0.22% | -0.23% | -0.068% | 0.93 |
| **2026-H1** | **BTST (Long)** | 30 | 26.7% | 0.12% | -0.35% | -0.221% | 0.36 |
| | **STBT (Short)** | 9 | 44.4% | 0.79% | -0.65% | -0.009% | 1.22 |
| | **Combined** | 39 | 30.8% | 0.34% | -0.40% | -0.172% | 0.86 |
| **Total** | **BTST (Long)** | 212 | 32.1% | 0.19% | -0.25% | -0.109% | 0.75 |
| | **STBT (Short)** | 48 | 37.5% | 0.36% | -0.31% | -0.060% | 1.15 |
| | **Combined** | 260 | 33.1% | 0.22% | -0.26% | -0.100% | 0.86 |

### BANKNIFTY

| Period | Direction | Trades | Win Rate | Avg Win | Avg Loss | Expectancy | Avg R |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **2024** | **BTST (Long)** | 93 | 32.3% | 0.21% | -0.28% | -0.124% | 0.75 |
| | **STBT (Short)** | 11 | 27.3% | 0.20% | -0.75% | -0.488% | 0.27 |
| | **Combined** | 104 | 31.7% | 0.21% | -0.34% | -0.162% | 0.63 |
| **2025** | **BTST (Long)** | 89 | 33.7% | 0.23% | -0.27% | -0.101% | 0.85 |
| | **STBT (Short)** | 18 | 33.3% | 0.24% | -0.36% | -0.158% | 0.66 |
| | **Combined** | 107 | 33.6% | 0.23% | -0.28% | -0.111% | 0.81 |
| **2026-H1** | **BTST (Long)** | 25 | 24.0% | 0.15% | -0.44% | -0.299% | 0.33 |
| | **STBT (Short)** | 11 | 54.5% | 0.70% | -0.93% | -0.040% | 0.75 |
| | **Combined** | 36 | 33.3% | 0.42% | -0.54% | -0.219% | 0.78 |
| **Total** | **BTST (Long)** | 207 | 31.9% | 0.21% | -0.30% | -0.135% | 0.72 |
| | **STBT (Short)** | 40 | 37.5% | 0.42% | -0.60% | -0.216% | 0.70 |
| | **Combined** | 247 | 32.8% | 0.25% | -0.34% | -0.148% | 0.73 |

### SENSEX

| Period | Direction | Trades | Win Rate | Avg Win | Avg Loss | Expectancy | Avg R |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **2024** | **BTST (Long)** | 101 | 27.7% | 0.17% | -0.22% | -0.115% | 0.77 |
| | **STBT (Short)** | 15 | 26.7% | 0.22% | -0.32% | -0.177% | 0.68 |
| | **Combined** | 116 | 27.6% | 0.18% | -0.24% | -0.123% | 0.75 |
| **2025** | **BTST (Long)** | 84 | 35.7% | 0.18% | -0.26% | -0.104% | 0.70 |
| | **STBT (Short)** | 25 | 44.0% | 0.25% | -0.24% | -0.025% | 1.04 |
| | **Combined** | 109 | 37.6% | 0.20% | -0.26% | -0.086% | 0.78 |
| **2026-H1** | **BTST (Long)** | 28 | 28.6% | 0.13% | -0.37% | -0.229% | 0.35 |
| | **STBT (Short)** | 9 | 44.4% | 0.65% | -0.56% | -0.023% | 1.16 |
| | **Combined** | 37 | 32.4% | 0.30% | -0.41% | -0.179% | 0.74 |
| **Total** | **BTST (Long)** | 213 | 31.0% | 0.17% | -0.26% | -0.126% | 0.67 |
| | **STBT (Short)** | 49 | 38.8% | 0.33% | -0.32% | -0.071% | 1.01 |
| | **Combined** | 262 | 32.4% | 0.21% | -0.27% | -0.115% | 0.77 |

### Combined (All Indices)

| Period | Direction | Trades | Win Rate | Avg Win | Avg Loss | Expectancy | Avg R |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **2024** | **BTST (Long)** | 292 | 30.1% | 0.19% | -0.24% | -0.113% | 0.78 |
| | **STBT (Short)** | 40 | 27.5% | 0.20% | -0.42% | -0.249% | 0.47 |
| | **Combined** | 332 | 29.8% | 0.19% | -0.27% | -0.129% | 0.72 |
| **2025** | **BTST (Long)** | 257 | 35.0% | 0.21% | -0.26% | -0.095% | 0.80 |
| | **STBT (Short)** | 68 | 39.7% | 0.25% | -0.27% | -0.064% | 0.92 |
| | **Combined** | 325 | 36.0% | 0.22% | -0.26% | -0.088% | 0.83 |
| **2026-H1** | **BTST (Long)** | 83 | 26.5% | 0.13% | -0.38% | -0.247% | 0.34 |
| | **STBT (Short)** | 29 | 48.3% | 0.71% | -0.71% | -0.025% | 1.00 |
| | **Combined** | 112 | 32.1% | 0.36% | -0.45% | -0.190% | 0.80 |
| **Total** | **BTST (Long)** | 632 | 31.6% | 0.19% | -0.27% | -0.123% | 0.71 |
| | **STBT (Short)** | 137 | 38.0% | 0.36% | -0.40% | -0.110% | 0.91 |
| | **Combined** | 769 | 32.8% | 0.23% | -0.29% | -0.121% | 0.78 |

---

## Decision Options

### (a) Keep both Index BTST and STBT Enabled

- Leave both `INDEX_BTST_ENABLED` and `INDEX_STBT_ENABLED` at their default `true` values.
- Continue seeking and alerting Nifty, Bank Nifty, and Sensex overnight setups.

### (b) Disable Index BTST (Long) Only

- Set `INDEX_BTST_ENABLED=false` in the server environment.
- Skip index long signals but keep index short signals active.

### (c) Disable Index STBT (Short) Only

- Set `INDEX_STBT_ENABLED=false` in the server environment.
- Skip index short signals but keep index long signals active.

### (d) Disable both Index BTST and STBT

- Set both `INDEX_BTST_ENABLED=false` and `INDEX_STBT_ENABLED=false` in the server environment.
- Completely silence index-level overnight signals and alerts.

---

## Decision

**Hiren sign-off pending**

- [ ] (a) Keep both Index BTST and STBT Enabled
- [ ] (b) Disable Index BTST (Long) Only
- [ ] (c) Disable Index STBT (Short) Only
- [ ] (d) Disable both Index BTST and STBT

Owner: Hiren  Date: __________________
