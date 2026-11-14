# Proposal: Yahoo Bar-Date Guard & Session Volume Resolution Policy

**Date:** 2026-11-14  
**Author:** Assistant (Follow-up to PR #318 Volume Fallback Test Suite)  
**Status:** Proposal / Pending Owner Policy Decision (NO CODE IMPLEMENTATION YET)  
**Affected Subsystems:** `src/services/market.service.ts`, `src/services/overnight/btst-ranking.service.ts`

---

## 1. Executive Summary

Test coverage added in PR #318 highlighted two remaining architectural concerns in the volume ingestion and scoring pipeline:
1. **Yahoo Intraday Bar-Date Guard:** Absence of an explicit session-date filter when reducing 15m intraday bars in Yahoo fallback mode.
2. **`Math.max` Volume Policy:** The decision in `resolveSessionVolume()` to take the maximum of daily candle volume (`stockVolume`) and accumulated intraday volume (`intradayVolume`), which introduces an upward +25 point score shift on near-threshold setups.

This document formalizes the problem statements, architectural tradeoffs, and implementation options for owner review prior to drafting executable code.

---

## 2. Topic 1: Yahoo 15-Minute Bar-Date Guard

### 2.1 Problem Description
In `src/services/market.service.ts` (`MarketService.getStockData()`), when Fyers quotes are unavailable or rate-limited, the system falls back to Yahoo Finance 15-minute intraday bars to compute:
- Cumulative session volume
- Session VWAP
- Latest 15m high / low
- Session OHLC

Currently, the reduction loop iterates over all returned 15m bars without strictly verifying that each candle's Unix timestamp converts to today's IST date (`todayStr`). If Yahoo returns cached bars from yesterday's close or early pre-market timestamps, those bars could contaminate today's session VWAP and volume.

### 2.2 Proposed Solution (No code yet)
Introduce a strict timestamp boundary filter:
```typescript
const candleDateStr = getISTDateString(new Date(candle.timestamp * 1000));
if (candleDateStr !== todayStr) {
  continue; // Discard bars outside current trading session
}
```
- If valid bars for `todayStr` equal zero, explicitly set `hasAggregatedIntraday = false` and fall back to the daily snapshot.
- Zero risk of cross-day volume contamination.

---

## 3. Topic 2: Session Volume Resolution Policy

### 3.1 Problem Description & Test Evidence
In `src/services/overnight/btst-ranking.service.ts`:
```typescript
export function resolveSessionVolume(
  dailyVolume: number,
  intradayVolume?: number,
  hasConfirmationCandles?: boolean
): number {
  if (!hasConfirmationCandles) return dailyVolume;
  return Math.max(dailyVolume, intradayVolume || 0);
}
```
As proven in unit test 4 of PR #318:
- When `dailyVolume` is 100,000 (1.0× avgVolume, 0 VDU pts) and `intradayVolume` is 250,000 (2.5× avgVolume), `Math.max` resolves to 250,000, triggering the +25 point VDU bonus (increasing total score from 85 to 110).
- If one data provider has an inflated or unadjusted volume anomaly, `Math.max` will always select the higher figure, biasing scores upward.

### 3.2 Policy Options for Owner Decision

| Option | Formula | Rationale | Risk / Tradeoff |
|---|---|---|---|
| **Option A (Current)** | `Math.max(dailyVolume, intradayVolume)` | Captures late block trades or delayed feed updates; maximizes sensitivity so valid volume spikes are not missed. | Asymmetric upward bias; can award +25 VDU points if either feed experiences an anomalous volume spike. |
| **Option B (Authoritative Intraday)** | `intradayVolume > 0 ? intradayVolume : dailyVolume` | Treats 15m aggregated session bars as authoritative truth during live trading hours (15:15–15:30 IST). | Vulnerable if intraday feed is missing early morning chunks (under-counts volume). |
| **Option C (Conservative Agreement)** | `Math.min(dailyVolume, intradayVolume)` | Prevents false-positive volume breakouts; requires both feeds to confirm the volume expansion. | Highly conservative; will reject valid volume surges if one feed has reporting lag. |
| **Option D (Tolerance Gated)** | If $|V_{\text{daily}} - V_{\text{intra}}| / V_{\text{daily}} \le 20\%$, use `intradayVolume`; else flag discrepancy in shadow monitor | Balances parity with auditability; logs anomalies to `VolumeShadowMonitorService`. | Adds branching logic and threshold constant. |

---

## 4. Requested Owner Decision
1. **Yahoo Bar-Date Guard:** Approve implementing the date check filter in `market.service.ts`? (Recommended: Yes).
2. **Volume Sourcing Policy:** Which option (A, B, C, or D) should be adopted as the official platform standard?
