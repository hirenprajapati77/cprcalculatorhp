# Decision Memo: Option Lot-Size Heuristic for Unmapped Contracts

**Date:** 2026-11-13  
**Covers:** `src/lib/pnl.ts` (Commit `7ef8595c`, PR #287)  
**Status:** Approved by Owner (Hiren Prajapati)  

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

## 2. Rationale: SEBI Minimum Contract Value Revision

Under SEBI circular guidelines, the minimum contract size for index and stock derivatives in the Indian equity market was revised upwards from ₹5 Lakhs (`500_000`) to ₹15–20 Lakhs (`1_500_000`).

Exchange lot sizes are dynamically calibrated such that:
$$\text{Lot Size} \times \text{Strike Price} \approx ₹15,00,000 \text{ to } ₹20,00,000$$

Using `1_500_000 / strike` reflects the modern regulatory contract sizing framework.

---

## 3. Scope & Operational Impact

- **Narrow Scope:** Applies only to fallback cases where a stock is absent from `FALLBACK_LOT_SIZES`. The static dictionary in `option-suggestion.service.ts` and `pnl.ts` already contains explicit exchange lot sizes for active F&O symbols.
- **Journal Impact:** Affects estimated friction and gross P&L calculations for journal entries on unmapped symbols by scaling lot size approximation to match ₹15 Lakhs notional value.
- **Decision:** Confirmed and retained in `src/lib/pnl.ts`. Future modifications to `pnl.ts` strictly require pre-merge review under the frozen core policy.
