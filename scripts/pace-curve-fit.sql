-- NOTE: 2026-11-24 was an NSE holiday (Guru Nanak Jayanti); it is not a trading session. Telemetry only exists from ~2026-11-20.
-- READ-ONLY. Fit the empirical cumulative volume fraction F(t) = sessionVolume / final day volume.
-- Run only after the day's bhavcopy has ingested (after 18:30 IST). Final volume comes from DailyOhlcv (series 'EQ').
-- Compare the result with expectedVolumeFraction() in src/lib/market-hours.ts.
-- Caveat: telemetry comes from auto-scan on the F&O universe, so this describes liquid F&O names only.

-- 1) Quality: how complete is the join per date?
SELECT t.date,
       COUNT(DISTINCT t.symbol)                                   AS telemetry_symbols,
       COUNT(DISTINCT d.symbol)                                   AS matched_in_bhavcopy
FROM "VolumeTelemetry" t
LEFT JOIN "DailyOhlcv" d
  ON d.symbol = t.symbol AND d.date = t.date AND d.series = 'EQ'
WHERE t.date >= '2026-11-20'
  AND t."rangeProvenance" <> 'STALE_PREV_DAY'
GROUP BY t.date
ORDER BY t.date;

-- 2) Empirical F(t) by 15-minute bucket (median is more robust than mean).
SELECT (t."minuteOfDay" / 15) * 15                                              AS bucket_start_minute,
       to_char(make_interval(mins => (t."minuteOfDay" / 15) * 15), 'HH24:MI')   AS bucket_clock_ist,
       COUNT(*)                                                                 AS n,
       COUNT(DISTINCT t.date)                                                   AS sessions,
       ROUND(AVG(t."sessionVolume"::numeric / NULLIF(d.volume, 0)), 4)          AS mean_f,
       ROUND((percentile_cont(0.5) WITHIN GROUP (
              ORDER BY t."sessionVolume"::numeric / NULLIF(d.volume, 0)))::numeric, 4) AS median_f,
       ROUND((percentile_cont(0.25) WITHIN GROUP (
              ORDER BY t."sessionVolume"::numeric / NULLIF(d.volume, 0)))::numeric, 4) AS p25_f,
       ROUND((percentile_cont(0.75) WITHIN GROUP (
              ORDER BY t."sessionVolume"::numeric / NULLIF(d.volume, 0)))::numeric, 4) AS p75_f
FROM "VolumeTelemetry" t
JOIN "DailyOhlcv" d
  ON d.symbol = t.symbol AND d.date = t.date AND d.series = 'EQ'
WHERE t.date >= '2026-11-20'
  AND t."rangeProvenance" <> 'STALE_PREV_DAY'
  AND d.volume > 0
GROUP BY 1, 2
ORDER BY 1;
-- Note: the 12:xx clock label assumes minuteOfDay is minutes since midnight IST (555 = 09:15).
-- Fewer than 10 sessions: treat as a preview only (see pace-volume-flag-off memo).
