# Acceptance Gate Report — 1-Month Deep Code Review Bug Fixes

**Date:** 2026-09-01  
**Commit:** e2977dfd  
**Branch:** main  
**Reviewer:** Hiren Prajapati  
**Scope:** All 303 commits across the 30-day period (2026-08-01 → 2026-09-01, ~70 files)

---

## Summary

| Category | Count |
|---|---|
| Bugs / Issues Identified | 11 |
| Bugs / Issues Fixed & Verified | 11 |
| Tests Passing | 715 / 716 (1 skipped) |
| Tests Failing | 0 |
| GitHub Actions CI Run | #24 (SUCCESS, 1m 23s) |
| Production URL | https://129-159-230-41.nip.io |

---

## Acceptance Checklist

### Critical — 3 bugs, all fixed & verified

- [x] **B34** — src/services/overnight/index-ranking.service.ts: Restored Index BTST/STBT discovery before 15:15 IST by conditionally evaluating Rule 5 liquidity points only when the candle is present, allowing full discovery of Rules 1–4 and 6 during the 15:10–15:15 window.
- [x] **B35** — src/services/scheduler/market-cron.scheduler.ts, src/lib/with-timeout.ts: Defined TimeoutError and retained claim locks on timeouts to prevent duplicate background job accumulation and OOM leaks under network latency.
- [x] **B36** — src/services/market-tools/pattern-breakout.service.ts: Added WHERE date >=  to CTE queries over DailyOhlcv to restrict window scans to the trailing ~265–300 dates across 626K+ rows.

### High — 5 bugs, all fixed & verified

- [x] **B37** — src/services/option-suggestion.service.ts: Corrected option theta risk buffer formula to (1 - thetaBuffer) so options with $\le 4$ DTE receive a 10% tighter stop loss during expiry week.
- [x] **B38** — src/services/overnight/entry-manager.service.ts: Updated esolvePreviousClose to prioritize historical series data relative to sOfDate rather than today's live close during backtests.
- [x] **B39** — src/services/market-tools/pattern-breakout.service.ts: Added inFlightCompute singleton promise wrapper to prevent concurrent refresh requests from launching duplicate heavy database scans.
- [x] **B40** — scripts/market-tools/bhavcopy-ingest.ts: Added isNaN sanitization on alue and 	rades parsing to protect batch transactions against malformed rows.
- [x] **B41** — ops/mem_watchdog.sh: Updated is_protected_redis_key to include market_tools:*|market_breadth:*, preventing off-hours watchdog cache pruning.

### Medium & Low — 3 items, all fixed & verified

- [x] **B42** — src/services/alert/telegram.service.ts: Added fallback to TELEGRAM_CHAT_ID and settings.telegramChatId when TELEGRAM_GROUP_CHAT_ID is unconfigured.
- [x] **B43** — src/services/scheduler/btst-alert.job.ts: Added pruneSendAttemptCounts() to automatically prune sendAttemptCounts map entries.
- [x] **B44** — src/services/market-tools/pattern-breakout.service.ts: Expanded detectFlatBase slice window from 30 to 45 candles per Minervini/O'Neil specifications.
- [x] **B45** — src/app/market-tools/pattern-breakout/page.tsx: Attached AbortController to manual refresh button clicks with unmount cleanup.
