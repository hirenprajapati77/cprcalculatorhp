# Decision memo: Overnight Pick Ordering (Freshness vs Score)

**Status:** Owner sign-off pending
**Date:** 2026-08-13  
**Scope:** Investigation + documentation only (no code changes to `selectTradableOvernightPicks` in this task)  

---

## What the current logic does

Currently, the `selectTradableOvernightPicks` function (located in `src/services/overnight/overnight-ui-adapter.ts`) is responsible for selecting the final top-N tradable picks for the BTST journal and Telegram alerts.

The function sorts candidates using the `compareLatestScanRows` comparator:
```typescript
/** Sort scan rows: latest signalTime first, then highest score. */
export function compareLatestScanRows(
  a: { signalTime?: string | null; overnightScore?: number | null },
  b: { signalTime?: string | null; overnightScore?: number | null }
): number {
  const timeCmp = (b.signalTime ?? '').localeCompare(a.signalTime ?? '');
  if (timeCmp !== 0) return timeCmp;
  return (b.overnightScore ?? 0) - (a.overnightScore ?? 0);
}
```
This means that **freshness beats score**. If a stock was detected in an earlier scan with a score of 95, but the absolute latest rescan didn't detect it, it will lose its slot to a lower-scoring stock (e.g., score 75) that *was* found in the latest scan. 

There is an existing unit test in `src/tests/unit/overnight-ui-adapter.test.ts` that documents this behavior explicitly, ensuring the system prefers the latest `signalTime` over a higher score.

---

## Data Findings: Does this matter in practice?

To understand if this freshness-first ordering actually impacts production picks, we queried the `OvernightSignal` history to compare adjacent rescans on the same day. 

**Query Results:**
- **Days with multiple scans:** 5
- **Days where a rescan changed the top-N list:** 4
- **Total adjacent rescan comparisons:** 11
- **Rescans that resulted in a different top-N:** 6

**Conclusion from data:** **High impact.** Rescans result in a different top-N list more than 50% of the time (6 out of 11). This is not a theoretical edge case; the choice between freshness and score-priority frequently dictates which stocks are actually journaled and alerted.

---

## The logic argument

### The case for Freshness Priority (Current Behavior)
Market data changes rapidly near the close. If a stock had a great setup at 3:15 PM but lost it by 3:25 PM (e.g., a massive red candle ruined the closing strength or CLV), the latest scan will correctly drop it. By prioritizing `signalTime`, we ensure we never alert or journal a "stale" setup that no longer qualifies at the actual time of execution, even if its old score was phenomenally high.

### The case for Score Priority (Alternative)
If a stock flashed an Elite Institutional score of 95 early in the window, it might just be hovering near the boundary of a volume threshold in the final minutes. If it briefly drops out of the scanner during the final minute rescan due to a minor data tick, it gets completely discarded in favor of a mediocre 75-score setup that happened to trigger at the exact second of the final scan. Sorting purely by `overnightScore` across the whole session ensures we capture the objectively strongest setups of the day, as long as they triggered during the valid window.

---

## Options (owner chooses)

### (a) Keep Freshness Priority as-is
- Leave `compareLatestScanRows` prioritizing `signalTime` before `overnightScore`.
- We accept that we may occasionally drop a high-scoring setup if it doesn't survive into the absolute final rescan.

### (b) Switch to Score Priority
- Modify `compareLatestScanRows` to sort by `overnightScore` descending first, and only use `signalTime` as a tiebreaker.
- This would guarantee the absolute highest-scoring stocks of the session get the slots, regardless of which specific minute's scan caught them.

---

## Decision

**Owner sign-off recorded [DATE]**

- [ ] (a) Keep Freshness Priority as-is (latest signalTime wins)
- [ ] (b) Switch to Score Priority (highest overnightScore wins)

Owner: ___________  Date: ___________
