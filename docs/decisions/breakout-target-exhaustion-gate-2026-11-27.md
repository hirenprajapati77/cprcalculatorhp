# Decision Memo: Target-exhaustion check in the breakout pre-send gate

**Date:** 2026-11-27
**Status:** Proposed (owner approval pending; do not enforce `TARGET_NEAR` before approval)
**Scope:** `src/lib/cpr-setup-staleness.ts`, `src/services/alert/breakout-price-gate.ts`, comments in
`src/services/alert/breakout-watcher.service.ts`

## 1. Context
ADANIPORTS (SHORT, CPR BC entry 1927.37, T1 1897.63, SL 1945.30) alerted at 09:40 IST (LTP 1909.80) and again at
10:45 IST (LTP 1903.10) with identical levels. Figures below are from the production DB/logs as reported in the
review session; they were not independently re-queried when this memo was written.

## 2. Findings
- **The cooldown is not the root cause.** The per-symbol cooldown was added at 4h on 2026-08-05 (`0dd1039`) and
  deliberately reduced to 1h on 2026-09-10 (PR #201: "to allow later session setups"). The 1h expiry fired as designed.
  Comments still saying "4h" were stale (cleaned up in this change).
- **The pre-send gate cannot see the target.** `evaluateCprSetupPriceStaleness` checks gap, prior-close and a 2.5%
  entry-extension cap. T1 was only about 1.54% from entry, so price could travel all the way to (and past) T1 without
  ever tripping the cap. At 10:45 about 82% of the entry -> T1 move was done and only 5.47 points of reward remained
  against a 42.20 point stop (SL measured from LTP).
- **The 09:40 alert was already late:** about 59% of the entry -> T1 move was done when it was sent.
- **Unverified mechanism:** how `hadBreakout` became false between 09:40 and 10:45 (stale-claim release versus the
  signal dropping out of a scan and the miss counter clearing it). With price inside the 2.5% cap a stale release is
  unlikely. The `[BreakoutWatcher] Released ... stale-price delivered claim(s)` log lines would confirm.

## 3. Change in this patch
1. New pure helpers `targetProgress` / `evaluateTargetExhaustion` (fraction of entry -> target already travelled).
2. New gate reasons: `TARGET_REACHED` (price at/through T1) and `TARGET_NEAR` (progress >= `TARGET_PROGRESS_MAX` = 0.5).
3. Mode via `opts.targetGateMode` or env `BREAKOUT_TARGET_GATE_MODE` = `off` | `shadow` (default) | `enforce`:
   - `shadow`: suppress only `TARGET_REACHED`; log would-be `TARGET_NEAR` suppressions as `[TargetGateShadow]` JSON.
   - `enforce`: also suppress `TARGET_NEAR`. `off`: disable the whole check.
4. Only evaluated after the existing checks pass; invalid or wrong-side targets are ignored (no gating on bad data).
5. Comment-only cleanup of the stale "4h" wording. Cooldown value (1h) unchanged.

## 4. Decisions needed from the owner
1. **Enforce `TARGET_REACHED` always (recommended: yes).** An alert for a setup whose target is already hit has no
   reward left at the stated levels.
2. **`TARGET_PROGRESS_MAX`.** 0.5 is a proposal, not a measurement. Note the side effect: under 0.5 the original 09:40
   ADANIPORTS alert (59%) would also have been suppressed. Decide whether alerts that late in the move are wanted.
3. **When to move `TARGET_NEAR` to `enforce`.** Suggest reviewing `[TargetGateShadow]` volume and what price did next
   over about 10 sessions first.
4. **Re-entry gating** (re-alert only after price has moved away from entry and returned to the entry zone) is a
   separate, larger change. Not included.

## 5. Rollout notes
- Default `shadow` needs no env change. To enforce later, the variable must reach PM2: `ops/deploy_extract.sh`
  currently exports only `DATABASE_URL` and `FEATURE_PACE_VOLUME` from `.env`, so a mirrored export for
  `BREAKOUT_TARGET_GATE_MODE` is required in that follow-up.
- Deploy after the 15:30 IST close. Verify with `grep -c TargetGateShadow` over a session, and confirm no
  `TARGET_REACHED` suppression on setups still below T1.
