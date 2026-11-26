# Decision Memo: ORB signal time cut-off

**Date:** 2026-11-26
**Status:** Approved (implementation pending)
**Scope:** `src/lib/market-hours.ts` (`isOrbBreakout`, `getOpeningRange`), `src/services/signal.service.ts`,
`src/services/scanner.service.ts` (`computeTradeSetup` ORB branch), alert pipeline/price gate
**Related:** `orb-risk-buffer-memo.md`, `pace-volume-flag-off-2026-11-24.md`

## 1. Observation
`isOrbBreakout` checks only price vs the 09:15–09:30 opening range plus the volume bars. It has no
time-of-day limit. In live `[PaceShadow]` output on 2026-11-26 at 12:40–12:45 IST (minute 760–765),
four of five logged long-side hits also carried `ORB_LONG`. At that hour "price above the morning high" is
a session breakout, not an opening-range breakout, and the ORB trade setup (entry at OR high, stop at OR
midpoint) was designed for the morning expansion window. This is a scoping gap, not a calculation bug.

## 2. Options
A. **Hard cut-off minute for generating ORB signals/setups** (recommended). After the cut-off,
   `ORB_LONG`/`ORB_SHORT` and `setupType = ORB_BREAKOUT` are no longer produced. CPR `BREAKOUT`/`BREAKDOWN` are unaffected.
B. Keep generating but relabel late hits (e.g. `SESSION_BREAKOUT`). More code, new signal name downstream.
C. Do nothing. Late ORB hits keep their entry/stop semantics but no longer mean what the name says.

## 3. Recommendation
Option A with `ORB_CUTOFF_MINUTE` as a named constant in `src/config/trading-constants.ts`.
Default proposal: **11:30 IST (minute 690)**; the stricter alternative is 10:30 (630).
The value is a judgement call, so validate it before shipping (section 5). Until validated, 11:30 is the
less disruptive choice because it only removes the clearest midday cases.

## 4. Design notes
- Put the cut-off in the **signal decision**, not in `getOpeningRange`. `getOpeningRange` also feeds the
  `orHigh/orLow/orEntry` fields the alert watcher and price gate use to track an ORB alert that was already sent;
  returning null after the cut-off would strip the levels from setups that are still live.
- Implement once, e.g. `isOrbWindowOpen(now, asOfDate)`, and call it from the three sites:
  `signal.service.ts` ORB block, the shadow ORB re-evaluation in the same file (so shadow stays consistent), and
  `scanner.service.ts` `computeTradeSetup`. Do not duplicate the minute comparison.
- Replay/backtests (`asOfDate` set) have no live clock; follow `getOpeningRange`'s existing convention and
  skip the cut-off there, or define it from the candle timestamp if one is available. Decide explicitly.
- Existing ORB alerts sent before the cut-off must still be evaluated by `evaluateOrbSetupStaleness`
  after it; only new signal generation stops.
- Behavior change: this reduces ORB signal count. No schema change, no flag.

## 5. Validate before choosing the minute
Bucket past ORB signals by time of day and compare follow-through (e.g. close vs entry, or hit of the
configured target before the stop) for signals before 10:30, 10:30–11:30 and after 11:30. If the journal does not
store signal time and setup type, the `[PaceShadow]`/scan logs plus 15m candles can reconstruct a first sample.
A small sample should move the default only if the difference is large.

## 6. Tests required
- `isOrbWindowOpen` boundaries (just before, at, after cut-off; replay mode).
- `signal.service` does not emit ORB after the cut-off but still emits CPR `BREAKOUT`.
- `computeTradeSetup` returns no `ORB_BREAKOUT` setup after the cut-off, still returns `CPR_PULLBACK`.
- A pre-cut-off ORB alert is still evaluated by the staleness gate after the cut-off.
- Shadow ORB and live ORB agree on the window (no `gained` ORB lines after the cut-off).

## 7. Approval
Owner decision on the cut-off minute and on replay behavior: **Approved on 2026-11-26**.
- **Cut-off:** 11:30 IST (minute 690), with earlier ORB alerts continuing to be tracked after the window.
- **Replay mode:** Bypass the cut-off when `asOfDate` is set.
