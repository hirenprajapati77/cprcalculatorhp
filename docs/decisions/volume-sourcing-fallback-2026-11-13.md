# Decision Memo (Retroactive): Session-Volume Sourcing and Yahoo-Fallback Hardening

**Date:** 2026-11-13  
**Covers:** PRs #301–#306  
**Status:** Merged / In Review; written after the fact, gates deployment  

---

## 1. Why This Exists

| Question | Finding | Evidence |
|---|---|---|
| No 13 Nov breakout alert | Score 45–55 vs `MIN_BREAKOUT_ALERT_SCORE = 75`; price gate never the blocker | Verified |
| No 12 Nov BTST | Logged `volume 28644 < 100000` (frozen snapshot); true ratio 706,846 / 882,211 = 0.80 < 1.5, so rejected anyway | Log verified; 20D vs 50D window unreconciled |
| Universe-wide freeze | 13 Nov median stored volume 0.0114× prior day across 210 symbols | Verified for 13 Nov only; 30-day history not yet run |
| Mechanism | Yahoo fallback read `bundle.lastCandle.volume` from an 8h cache written ~09:16 IST; 15m fetch updated LTP only | Verified (code + Redis key) |
| Why Yahoo fallback | Fyers 429 cooldown and/or token expiry | **Unverified** |

The freeze did not cause the GVT&D misses. It is a real universe-wide defect, fixed on its own merits.

---

## 2. What Was Merged

| PR | Change | Class |
|---|---|---|
| #301 | Yahoo fallback builds session O/H/L/V from 15m bars + `regularMarketVolume`; gate prefers intraday volume; Fyers quote batch delay | Behaviour-affecting |
| #302 | Yahoo-fallback pacing (batch 2, 120 ms); `NIFTY_FNO` default | Behaviour-affecting |
| #303 | Fyers history + overnight prefetch pacing (250 ms) | Operational |
| #304 | `resolveSessionVolume` shared by gate, BTST/STBT VDU rule (25 pts), VPA RVOL | Behaviour-affecting |
| #305 | `sessionAggregated` flag/warning; 200-SMA chunking; empty-history `avgVolume` → 0 | Telemetry + minor |
| #306 | Test fix (market-hours-dependent test) | Test only |

### Expected Effects
1. **Fallback days**: Category B points (up to 25) and `VOLUME_SPIKE` become reachable. The morning effect is small (GVT&D ratio 0.35 at 10:00) and grows later in the day.
2. **BTST/STBT**: The VDU rule uses `max(stock volume, intraday volume)`. The larger of two feeds biases scores upward, and the alert line is 85 (75 in a bear regime), so pick lists can change.
3. **Backtests**: Historical scores can shift where the intraday sum exceeds daily volume.
4. **Gap and range signals**: Use today's session open/high/low on the fallback path.

---

## 3. Not Changed

- The 8h daily-bundle cache still holds the in-progress bar; the override is downstream in `getStockData`.
- If 15m aggregation fails, the snapshot fallback applies with a throttled log only, so volume can be live while open/high/low stay frozen.
- The `score >= 10` persistence filter, so `ScannerResult` is not an audit trail.
- All thresholds (75, 85, 1.2, 1.5, 100k) and any time-of-day normalisation.

---

## 4. Item B (Held): Time-of-Day RVOL

`RVOL(t) = V(t) / (ADV × f(t))`, where `f(t)` is the historical fraction of daily volume by time `t`. It needs stored intraday history and a backtest-lab walk-forward test. No work until the monitor has run 10+ sessions.

---

## 5. Open Risks

1. Pacing may exceed 5 req/s (5 symbols per batch in parallel, cooldown decided once per scan). Measure 429s before and after.
2. Root cause of the Yahoo fallback is unconfirmed. Run the `[LiveFeed]` greps and check Fyers token state.
3. Larger-of-two-feeds bias in #304. Log both values in shadow for 5 sessions.
4. Test and tsc results are reported but not independently confirmed.
5. #306: confirm the test's intent was preserved.
6. Yahoo `range=1d` before the open or on holidays could label prior-session bars as aggregated. Add a bar-date guard.

---

## 6. Deployment and Verification

- Deploy via `ops/deploy.ps1` after the close. Confirm the running build with `pm2 describe cpr-platform` and `.next/standalone/.next/BUILD_ID`. Never diagnose from the server's stale root `src/`.
- **Acceptance, first 5 sessions:**
  - Median stored/true volume (rows still updating near the close) ≥ 0.7.
  - "aggregation skipped" warnings < 2% of symbols per scan.
  - Fyers 429 cooldowns ≤ 3 per session and below baseline.
  - Breakout alert count and BTST/STBT pick count and score distribution within an agreed band of the prior 20 sessions, with extras explainable by volume points.
- **Rollback:** Revert #304 first (it builds on #301), then #301. #302 and #303 are independent.

---

## 7. Monitor Spec (Not Yet Implemented)

Use the existing ops Telegram channel, with per-session state in an in-process Map:
1. **Provider mix per scan:** Counts of Fyers, Yahoo with `sessionAggregated=true`, and Yahoo with `sessionAggregated=false`, stored in `ScanHistory` metadata.
2. **Aggregation-failure alert:** More than 20% of the universe has `sessionAggregated=false` for 2 consecutive market-hours scans; once per session.
3. **Volume-sanity alert** at 11:30, 14:00 and 15:15 IST: Median `volume / avgVolume` from in-memory scan results below a floor. The frozen day read about 0.01–0.04 (one reading). The healthy mid-day value isn't measured yet, so start at 0.10 and calibrate after 5 sessions.
4. **Fyers cooldown alert:** More than 3 activations per session; once, with counts.
5. **Hygiene:** One message per type per session, including metric, threshold and time; no credentials.
6. **Tests:** Fixtures for healthy, frozen, mixed and empty.

---

## 8. Governance

- **Branch and PR only; no direct pushes to `main`.**
- Item B and any threshold change need a separate memo and backtest.
- Behaviour-affecting PRs reference a memo in `docs/decisions/` before merge.
