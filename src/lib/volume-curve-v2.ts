/**
 * Curve v2: EMPIRICAL expected cumulative volume fraction F(t), SHADOW USE ONLY (see
 * docs/decisions/pace-volume-flag-off-2026-11-24.md). Never used by live signal decisions.
 *
 * Provisional knots: medians of VolumeTelemetry.sessionVolume / DailyOhlcv.volume (series EQ) over the
 * sessions 2026-11-23, 2026-11-25 and 2026-11-26 for the F&O universe (scripts/pace-curve-fit.sql, query 4).
 * Each 15-minute bucket median is placed at bucket start + 5 minutes, because scans run every 5 minutes
 * (bucket rows sit at m, m+5, m+10), so a bucket describes its midpoint and NOT its start.
 * Buckets not pasted into the analysis are interpolated linearly; regenerate from the full query-4 output
 * and re-review when more sessions accumulate. Replacing this table needs an owner-approved memo update.
 */
export const VOLUME_CURVE_V2_KNOTS: ReadonlyArray<readonly [minuteOfDay: number, fraction: number]> = [
  [560, 0.0506],
  [575, 0.1269],
  [590, 0.1809],
  [605, 0.2286],
  [620, 0.2674],
  [635, 0.305],
  [665, 0.378],
  [695, 0.4527],
  [725, 0.5071],
  [755, 0.5637],
  [785, 0.6195],
  [845, 0.7405],
  [905, 0.9145],
  [920, 0.9818],
  [930, 1.0],
];

const SESSION_START_MIN = 555; // 09:15 IST
const SESSION_END_MIN = 930; // 15:30 IST

/**
 * Expected cumulative volume fraction at `minuteOfDay` (IST minutes since midnight) by linear interpolation.
 * Returns null outside 09:15-15:30 (no pace comparison applies). Before the first knot it is flat at the first
 * knot value (mirrors the v1 floor behaviour at the open).
 */
export function expectedVolumeFractionV2(minuteOfDay: number): number | null {
  if (!Number.isFinite(minuteOfDay)) return null;
  if (minuteOfDay < SESSION_START_MIN || minuteOfDay > SESSION_END_MIN) return null;
  const knots = VOLUME_CURVE_V2_KNOTS;
  const first = knots[0]!;
  if (minuteOfDay <= first[0]) return first[1];
  for (let i = 1; i < knots.length; i++) {
    const [m1, f1] = knots[i]!;
    if (minuteOfDay <= m1) {
      const [m0, f0] = knots[i - 1]!;
      return f0 + ((f1 - f0) * (minuteOfDay - m0)) / (m1 - m0);
    }
  }
  return 1;
}
