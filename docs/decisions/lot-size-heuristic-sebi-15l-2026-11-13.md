# Decision Memo: Option Lot-Size Heuristic for Unmapped Contracts

**Date:** 2026-11-13  
**Covers:** `src/lib/pnl.ts` (Commit `7ef8595c`, PR #287)  
**Status:** Pending owner confirmation  

---

## 1. Context & Background

In `src/lib/pnl.ts`, `resolveOptionLotSize` computes the estimated lot size for an option contract:
1. Looks up `FALLBACK_LOT_SIZES[symbol]` (covers indices and main F&O universe).
2. For any symbol missing from the explicit lot-size map, it derives an approximation from the strike price:
   ```typescript
   if (strike && strike > 0) {
     const approx = Math.round(1_500_000 / strike);
     return Math.max(25, approx);
   }
   ```

Previously, this formula used `500_000 / strike`.

---

## 2. Rationale & Limitations

- **Exchange Authority:** Actual contract lot sizes are determined and published exclusively by the respective exchanges (NSE/BSE) via periodic circulars.
- **Heuristic Only:** The formula `Math.round(1_500_000 / strike)` is purely an internal fallback heuristic to prevent division-by-zero or single-share distortion in simulated friction and P&L calculations when a newly added or unmapped derivative contract lacks an entry in `FALLBACK_LOT_SIZES`.
- **Contract Value Baseline:** The formula aligns with the ₹15 Lakhs minimum contract value baseline for equity and index derivatives. Exchange lot sizes are calibrated periodically such that notional contract values fall within regulatory bands.

---

## 3. Scope & Operational Impact

- **Narrow Scope:** Applies only to fallback cases where a stock is absent from `FALLBACK_LOT_SIZES`. The static dictionary in `option-suggestion.service.ts` and `pnl.ts` already contains explicit exchange lot sizes for active F&O symbols.
- **Journal Impact:** Affects estimated friction and gross P&L calculations for journal entries on unmapped symbols by scaling lot size approximation to match ₹15 Lakhs notional value.
- **Status:** Pending written confirmation by owner. Future modifications to `pnl.ts` strictly require pre-merge review under the frozen core policy.
