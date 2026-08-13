# Decision memo: India VIX gating directionality for breakouts

**Status:** Owner sign-off pending
**Date:** 2026-08-13  
**Scope:** Investigation + documentation only (no code changes to `breakout-vix-gate.ts` or `trading-constants.ts` in this task)  
**Related:** PR #122 (which added `filterBreakoutsForVixRegime()`)

---

## What the current gate does

PR #122 introduced VIX-based gating for automated breakout Telegram alerts via `filterBreakoutsForVixRegime()`. Currently, this logic is strictly **symmetric**:
- **Pause:** If India VIX ≥ 25, ALL alerts (both bullish breakouts and bearish breakdowns) are paused identically.
- **Tighten:** If India VIX is 18–24.99, BOTH directions are tightened identically (minimum score 85, entry-chase cap tightened to 2%).

There are no test cases distinguishing direction in `breakout-vix-gate.test.ts`, and no stated reasoning for applying this equally to the short side.

---

## Data Findings (Historical TradeJournal Analysis)

To evaluate if the data supports treating long and short setups differently in high-VIX environments, a script queried the `TradeJournal` for `signalType = 'CPR'`, inferred the direction of each trade using `inferCprJournalDirection` from `src/lib/cpr-direction.ts`, and mapped each trade date to historical India VIX closing data fetched dynamically via `yahoo-finance2`.

**Sample Sizes & Performance:**
Out of 34 closed CPR trades found in the journal:

| Direction | Regime | Total Trades | Wins | Losses | BE | Win Rate (excl. BE) | Avg PnL |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **LONG** | Calm (VIX < 18) | 18 | 9 | 8 | 1 | 52.94% | 13.01% |
| **SHORT** | Calm (VIX < 18) | 10 | 7 | 3 | 0 | 70.00% | 29.93% |
| **LONG** | Elevated (VIX ≥ 18) | 0 | 0 | 0 | 0 | N/A | N/A |
| **SHORT** | Elevated (VIX ≥ 18) | 0 | 0 | 0 | 0 | N/A | N/A |

*(Note: 6 trades lacked sufficient data or VIX mapping and were excluded).*

**Conclusion from data:** **Insufficient data.** With exactly $n=0$ trades executed on days with VIX ≥ 18, there is absolutely no historical CPR journal data available to draw an empirical conclusion on how long vs. short setups perform during elevated volatility. 

---

## The trading-logic argument

Since the data is inconclusive, we must rely on structural market logic, referencing past architectural decisions on this exact codebase (e.g., the 3 prior bugs where bidirectional systems incorrectly applied long-only logic).

### The case for Symmetric Gating (Keep as-is)
VIX is a broad-market fear and uncertainty gauge. High VIX implies erratic liquidity, wider spreads, and violent mean-reversion whipsaws. During genuine panic, technical levels (both resistance AND support) become unreliable. A breakdown might succeed, or it might get caught in a vicious 2% short-covering spike that blows past the stop loss. Gating both directions symmetrically protects capital from sheer randomness. (Note: Unlike the overnight STBT case, which specifically involves holding short exposure overnight into a structural gap-down bias, intraday breakout trades are heavily exposed to intraday chop).

### The case for Asymmetric Gating (Change to favor shorts)
High VIX strongly correlates with market panic and selling pressure. When the market is scared, the path of least resistance is usually down. Therefore, bearish breakdowns have a structural tailwind during high VIX regimes. Mirroring the logic applied to the overnight VIX-elevated gate (where STBT was exempted from the IGNORE force-out), pausing short breakdowns during panic selling might mean missing the highest-conviction bearish moves of the year. 

---

## Options (owner chooses)

### (a) Keep symmetric pause/tighten as-is
- Leave `breakout-vix-gate.ts` treating both directions identically.
- Add a governance comment in `breakout-vix-gate.ts` above `filterBreakoutsForVixRegime()` citing this memo so future maintainers know the symmetry is intentional and reviewed.

### (b) Make it asymmetric (Favor Short Setups)
- Modify `breakout-vix-gate.ts` so that **bearish** breakdowns bypass the Pause/Tighten logic, or face a looser threshold.
- Concretely:
  - VIX ≥ 25: Pause LONG breakouts, but allow SHORT breakdowns to proceed (perhaps under Tighten rules instead of Pause).
  - VIX 18–24.99: Tighten LONG breakouts, but apply Normal rules to SHORT breakdowns.

---

## Decision

**Owner sign-off recorded [DATE]**

- [ ] (a) Keep symmetric pause/tighten as-is + add governance comment
- [ ] (b) Make it asymmetric (Favor Short Setups)

Owner: ___________  Date: ___________
