# Decision Memo: `FEATURE_PACE_VOLUME` held OFF; shadow logging until recalibrated

**Date:** 2026-11-24
**Status:** Approved
**Scope:** `src/lib/market-hours.ts` (`expectedVolumeFraction`), `src/services/signal.service.ts`, production `.env`

## 1. Context
PR #329/#331/#332 added pace-normalised volume (`volumeRatio = rawVolumeRatio / expectedVolumeFraction`)
behind `FEATURE_PACE_VOLUME`, and #332 documented activating it in production.
Production was later set back to `FEATURE_PACE_VOLUME="false"` via the server `.env`
(PR #339 only exports the flag to PM2 and logs it at boot; it does not change its value).
Date and operator of the flip: **2026-11-24 by repository owner (deploy `aee7df6fbd27`)**. Boot line confirming it:
`[FEATURE_PACE_VOLUME: false]`.

## 2. Why it stays off (review findings, not new measurements)
- **Thin calibration.** The 0.05 floor and 0.48 midday anchor were fitted to roughly 1–2 sessions of
  telemetry (telemetry only began 2026-11-19 and #328 fixed a BigInt crash that wrote no rows before 2026-11-20).
  The curve's own docstring asks for at least 2 trading days; this is a small sample either way.
- **Floor amplification.** At the open the 0.05 floor divides raw volume by 0.05, up to 20x.
  A stock needs only about 7.5% of its 20-day average volume to pass the 1.5 confirmation bar at ~09:30–09:35,
  which is close to a normal opening.
- **Fit target.** `VolumeTelemetry.rawRatio` is session volume / 20-day average, not the share of that day's final volume.
  Averaging it by minute only approximates a cumulative-volume curve.
- **Shape.** The curve is piecewise linear; NSE volume is typically front-loaded.
- The ORB raw-volume floor (0.08) is a partial guard, not a substitute for a validated curve.

## 3. Consequence of keeping it off
Volume ratio equals raw volume vs the 20-day average, so a breakout needs 1.5x the full-day average.
Expect few early-session (before ~noon) breakouts and almost no early ORB signals. This is the signal
scarcity #329 set out to fix. It is the conservative failure mode and is accepted until recalibration.

## 4. Shadow logging (this change)
While the flag is off, `SignalService` computes the pace ratio and logs one line per symbol per scan
only when pace would clear the bar and raw would not:
`[PaceShadow] {"symbol","date","minuteOfDay","raw","pace","expected","ltp","tc","bc","provenance"}`.
It never changes `volumeRatio` or any signal. Logic lives in `src/lib/pace-shadow.ts` (unit tested).
Review with `pm2 logs | grep PaceShadow` or the PM2 log files.

## 5. Criteria to re-enable (all required)
1. At least 10 full trading sessions of telemetry, with the day's final volume captured so the curve is fitted on
   true cumulative fractions (not currently stored; needs a follow-up schema decision).
2. A refit curve, ideally concave/front-loaded, with the opening floor justified by data.
3. Review of `[PaceShadow]` events against what price did afterwards (hit-rate / false-breakout rate versus
   events that raw volume already confirmed).
4. Owner approval recorded here, then flip `.env`, redeploy via `ops/deploy.ps1`, and confirm the boot log line.

## 6. Follow-ups
- Decide whether to add end-of-day final volume to telemetry (additive migration).
- Replace "active in production" statements in CHANGELOG and the acceptance doc (done in this change).
