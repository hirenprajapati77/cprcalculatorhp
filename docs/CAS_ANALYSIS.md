# NSE Closing Auction Session (CAS) — Platform Analysis

**CPR / BTST / STBT Calculator Platform**  
**Date:** 4 Aug 2026  
**Status:** Implemented as Market Profile plumbing — default `MARKET_PROFILE=CONTINUOUS` (zero production drift). Flip to `CLOSING_AUCTION` only after Production Validation.

**SEBI source:** Circular HO/47/11/11(3)2025-MRD-POD2/I/2765/2026 (16 Jan 2026)  
**CAS effective:** 3 August 2026 (F&O cash names)  
**Pre-open restructure:** 7 September 2026 — Phase 2 / out of scope

---

## 1. Executive summary

NSE Closing Auction Session (CAS) changes how F&O-eligible cash stocks discover their official close.

| Phase | Time (IST) | What happens |
|-------|------------|--------------|
| Continuous trading | 09:15 – **15:15** | Normal LTP, stops, breakouts |
| CAS (4 SEBI sub-phases) | **15:15 – 15:35** | Transition → order entry → random close → matching |
| Official close | **~15:35** | Equilibrium uncross |
| F&O derivatives | often to **15:40** | Hedge/adjust window |
| Post-close (cash) | **15:50 – 16:00** | Trades at closing price (v1 non-goal) |

**Applicability (SEBI 4.1):** stocks with active F&O contracts today. Non-F&O remain continuous to 15:30 + last-30m VWAP. Eligibility is resolved via `MarketSessionResolver.supportsClosingAuction(symbol)` so SEBI can expand later without redesign.

---

## 2. MarketSessionResolver (approved design)

Do **not** hard-code `casAppliesToFnOOnly: boolean`. Use:

```ts
interface MarketSessionContext {
  symbol: string;
  isFnO: boolean;
  supportsClosingAuction: boolean;
  profile: 'CONTINUOUS' | 'CLOSING_AUCTION';
}

MarketSessionResolver.resolve(symbol, { isFnO })
MarketSessionResolver.supportsClosingAuction(symbol, { isFnO })
```

Phase-1 rule body: `profile === CLOSING_AUCTION && isFnO`. When SEBI expands to ETFs / large-caps / entire cash, change that one function.

---

## 3. Profiles

### CONTINUOUS (default — production identity)

| Knob | Value |
|------|-------|
| cashContinuousEnd | 15:30 |
| discovery | 15:10 → 15:25 excl |
| rule5Window | 15:15 → 15:30 excl |
| btst journal | 15:25 → 15:30 |
| cpr journal | 15:20 → 15:24 |
| freezeBreakoutsAfterContinuousEnd | false |
| supportsClosingAuction | always false |

### CLOSING_AUCTION (dormant until env flip)

| Knob | Value |
|------|-------|
| cashContinuousEnd | **15:15** |
| discovery | 15:10 → **15:15** excl |
| rule5Window | **15:00 → 15:15** excl |
| casEnd / officialClose | **15:35** |
| journal | after **15:35** |
| fnoSessionEnd | **15:40** |
| freezeBreakoutsAfterContinuousEnd | true |
| supportsClosingAuction | F&O (phase 1) via resolver |

---

## 4. Production Validation (QA — CONTINUOUS)

Under `MARKET_PROFILE=CONTINUOUS` (default):

- [ ] Scanner output identical
- [ ] BTST identical
- [ ] STBT identical
- [ ] Overnight identical
- [ ] CPR identical
- [ ] Trade Journal identical
- [ ] Telegram alerts identical

---

## 5. Phase 2 (explicit non-goals)

Keep out of v1:

- Auction imbalance analytics / institutional flow / closing pressure / auction alpha
- Modelling CAS phases 1–4 as separate strategy states
- Post-close 15:50–16:00 trading / journaling
- Pre-open redesign (Sep 7, 2026)
- Order placement / ±3% band / reference VWAP computation
- Score / ranking / CPR / VPA / options / backtest math changes

---

## 6. Code map

| Module | Role |
|--------|------|
| `src/config/market-profile.ts` | Profiles + Resolver + Context |
| `src/config/trading-constants.ts` | Windows derived from active profile |
| `src/lib/market-hours.ts` | `getSessionState`, `shouldFreezeBreakouts` |
| `src/services/alert/breakout-alert.pipeline.ts` | CAS freeze via resolver |
| `MARKET_PROFILE` env | Default `CONTINUOUS` |

---

*Document version: 2026-08-04 — aligned with SEBI CAS 15:15–15:35 IST and MarketSessionResolver refinement.*
