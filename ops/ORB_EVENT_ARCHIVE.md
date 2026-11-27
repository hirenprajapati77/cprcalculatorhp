# ORB event archive and outcome analysis

**Purpose:** keep `[OrbEvent]` log lines (emitted by `SignalService`, see
`docs/decisions/orb-time-cutoff-2026-11-26.md`) beyond `pm2-logrotate` retention, so late-ORB follow-through
can be measured over 10+ sessions before the 11:30 IST cut-off is revisited.

## What is archived
- First ORB hit per symbol + direction + day, logged whether or not the cut-off window is open
  (`windowOpen: true|false`), live trading days, 09:15–15:30 IST only. At most about 424 lines/day.
- Source: PM2 stdout, `/home/ubuntu/.pm2/logs/cpr-platform-out*.log*` (plain and `.gz` rotated files).
- Destination: `/home/ubuntu/orb-events.log` (de-duplicated, grows ~100–150 KB/day at most).

## Schedule
`ops/crontab.example.txt` entry, Mon–Fri 16:00 IST (10:30 UTC). It is idempotent: it merges the existing archive
with whatever is still in PM2 logs and rewrites the file via a temp file, so running it twice changes nothing.
Failures go to `/var/log/cpr-cron/orb-archive.log` (that file should be empty on a healthy day).

Installing it: `CRON_SECRET=... ./ops/install_crontab.sh --dry-run`, read the diff, then apply.
The installer REPLACES the whole crontab from the template, so the template must match the server first.

## Running the analysis (read-only)
Needs DB access and `DailyOhlcv` populated for the days involved (bhavcopy lands after ~18:30 IST):

    npx tsx scripts/analysis/orb-outcomes.ts /home/ubuntu/orb-events.log

It prints n, mean/median return, win rate and mean R per time bucket
(`<10:00`, `10:00-10:30`, `10:30-11:30`, `>=11:30`).

## Limits
- Close-to-trigger follow-through only; not a stop/target simulation (no intraday path in daily bars).
- Buckets with n < 30 are anecdotal; do not change the cut-off on fewer than 10 sessions.
- If PM2 log timestamps are enabled, identical events can appear on two text lines; the analysis de-duplicates
  by symbol + date + direction, so that is harmless.
- The archive is not backed up and is not pruned. Delete it deliberately when the evaluation is done.

## PaceShadow archive (curve v1 vs v2)
A second cron entry (16:05 IST, Mon–Fri) archives `[PaceShadow]` lines the same way into `/home/ubuntu/pace-shadow.log`
(errors in `/var/log/cpr-cron/pace-shadow-archive.log`). Analysis (read-only, after bhavcopy for the days involved):

    npx tsx scripts/analysis/pace-shadow-outcomes.ts /home/ubuntu/pace-shadow.log

Cohorts per symbol + date + direction: `both`, `v1_only`, `v2_only`; outcomes are close-to-trigger and a false break is a
close back inside the breakout level (LONG: close <= TC, SHORT: close >= BC). Every logged event is a signal the live
system did not take. `v1_only` (current curve confirms, empirical curve does not) is the key row. Lines written before
curve v2 shipped lack `gainedV2` and are ignored. Treat n < 30 as anecdotal and do not change the flag on < 10 sessions.
