# Decision Memo: ORB Minimum Risk Buffer (0.5%) & Max Stop Loss Cap (3.0%)

**Date:** 2026-11-24  
**Status:** Approved & Implemented  
**Scope:** `src/services/scanner.service.ts` (`computeTradeSetup`)

---

## 1. Context & Problem Statement
In Step 3 Opening Range Breakout (ORB) trade setup computation:
- **LONG ORB:** Entry is anchored to `orHigh`, and initial Stop Loss (SL) is anchored to `orMidpoint`.
- **SHORT ORB:** Entry is anchored to `orLow`, and initial Stop Loss (SL) is anchored to `orMidpoint`.

When a stock experiences a flat, illiquid, or abnormally narrow opening range (e.g. `orHigh === orLow`, or `orRange < 0.005 * entry`):
$$\text{risk} = \text{entry} - \text{sl} = 0$$
When $\text{risk} \to 0$, subsequent Reward-to-Risk ratio calculations $\frac{\text{target} - \text{entry}}{\text{risk}}$ diverge to $\infty$ or produce `NaN`, triggering corrupt risk metrics across Telegram alerts, scanner tables, and trade sizing.

Furthermore, on days with massive opening flash wicks, an uncapped midpoint could place the stop loss arbitrarily far away (e.g. 8–10% from entry), creating severe drawdown risk.

---

## 2. Decided Implementation
In `ScannerService.computeTradeSetup`:
1. **Minimum Risk Buffer (0.5%):**
   - For LONG: `minSL = entry * 0.995`. Stop loss cannot be higher than 0.5% below entry.
   - For SHORT: `maxSL = entry * 1.005`. Stop loss cannot be lower than 0.5% above entry.
   - **Behavior:** This rule only takes effect when `orRange < 1.0%` of entry. On any normal opening range ($\ge 1.0\%$), `orMidpoint` is already $\ge 0.5\%$ away from entry and is used as-is.
2. **Maximum Stop Loss Cap (`MAX_SL_PCT = 3.0%`):**
   - For LONG: `maxDistanceSL = entry * (1 - MAX_SL_PCT)`.
   - For SHORT: `maxDistanceSL = entry * (1 + MAX_SL_PCT)`.
   - Matches the standard CPR pullback stop loss ceiling (L-04).

### Formulas
```ts
// LONG ORB:
const midpointSL = or.orMidpoint;
const minSL = entry * 0.995;
const maxDistanceSL = entry * (1 - MAX_SL_PCT);
sl = Math.max(Math.min(midpointSL, minSL), maxDistanceSL);

// SHORT ORB:
const midpointSL = or.orMidpoint;
const maxSL = entry * 1.005;
const maxDistanceSL = entry * (1 + MAX_SL_PCT);
sl = Math.min(Math.max(midpointSL, maxSL), maxDistanceSL);
```

---

## 3. Alternatives Considered
1. **Reject ORB setup when `orRange / entry < 0.005`:**
   - *Pros:* Completely eliminates narrow ranges from ORB consideration.
   - *Cons:* Leaves setup in an unanchored state unless explicitly falling back to CPR pullback. Clamping the stop loss guarantees a valid trade structure regardless of edge-case pricing data.
2. **Dynamic ATR-scaled buffer:**
   - *Pros:* Adapts to individual stock volatility.
   - *Cons:* Adds dependency on completed ATR before opening range has settled. 0.5% floor provides a clean, predictable invariant that prevents $\text{risk} \le 0$.
