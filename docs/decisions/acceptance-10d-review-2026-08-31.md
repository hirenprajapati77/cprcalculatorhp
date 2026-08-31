# Acceptance Gate Report — 10-Day Deep Code Review Bug Fixes

**Date:** 2026-08-31
**PR:** #151
**Commit:** `9381c945`
**Branch:** `fix/10d-review-25-bugs-2026-08-31`
**Reviewer:** Hiren Prajapati
**Scope:** All commits in PRs #141–#149 (2026-08-22 → 2026-08-31, ~70 commits, 65 files)

---

## Summary

| Category | Count |
|---|---|
| Bugs found | 25 |
| Bugs fixed | 23 |
| False positives (verified correct, no change) | 2 |
| Tests passing | 709 / 710 |
| Tests failing | 0 |
| Tests skipped | 1 (Prisma DB-dependent, expected) |
| Files changed | 30 |

---

## Acceptance Checklist

### Critical — 5 bugs, all fixed

- [x] **B1** — `market-breadth.service.ts`: Prisma `$queryRaw` NUMERIC coercion to JS numbers. Market breadth was permanently zero-reporting because `Prisma.Decimal` objects fail all arithmetic comparisons silently.
- [x] **B2** — `breadth/route.ts`: Auth gate on `?refresh=true` DoS vector. Full DB scan was open to any unauthenticated caller.
- [x] **B3** — `breakout/route.ts`: Auth gate on `?refresh=true` DoS vector. 2,636-symbol scan was open to unauthenticated callers.
- [x] **B4** — `index-discover.service.ts`: Kill switches now push `IGNORE` signals instead of silently returning. Stale `BTST_READY`/`SHORT_READY` signals were staying active in DB when kill switches were off.
- [x] **B5** — `multi-year-breakout.service.ts` + test: Extracted `computeWindowBreakout` / `getStrongestBreakout` as exported helpers; tests now import real production code instead of locally-redefined mocks.

### High — 7 bugs, all fixed

- [x] **B6** — `market-tools-precompute.job.ts`: `anySucceeded` (OR) changed to `allSucceeded` (AND). One passing sub-job was masking the other two failing and suppressing scheduler retries.
- [x] **B7** — `env.ts`: `z.coerce.number().optional()` replaced with `z.preprocess()` for `CPR_WEIGHT`. Zod's coerce runs before optional, producing `NaN` when the env var is absent.
- [x] **B8** — `telegram.service.ts`: Chunk breakout alerts at 3,900 chars to respect Telegram's 4,096-char limit. Large batches were silently dropped. Added consistent `{ ok: boolean }` return.
- [x] **B9** — `scanner/route.ts`: Store `setTimeout` ID and clear in `.finally()` to prevent event loop leaks.
- [x] **B10** — `overnight.service.ts`: Pass `dateStr` to `evaluateExtension()` so historical backtests use the correct date rather than today's live clock.
- [x] **B11** — `server-starter.js`: Separate `next({ hostname: 'localhost' })` for canonical URL generation from `server.listen(port, '0.0.0.0')` for network binding.
- [x] **B12** — `.github/workflows/verify.yml`: Added required env dummy vars to CI unit test step. Without them, Zod's startup validation crashes before any test runs.

### Medium — 9 bugs, all fixed

- [x] **B13** — `market-hours.ts`: Comment clarity on Oct 2 Dussehra/Gandhi Jayanti coincidence per NSE 2026 holiday circular. No logic change.
- [x] **B14** — `pattern-breakout.service.ts`: Off-by-one in 20-day return — `c[c.length-20]` retrieves 19 bars back. Fixed to `c[c.length-21]` with guard `>= 21`.
- [x] **B15** — `nse-fund-exclusion.ts`: Comment clarification confirming `LIQUID` (unanchored substring) and `^GROWW.` (regex wildcard) are both intentional. No logic change.
- [x] **B16a** — `breadth/page.tsx`: `AbortController` + `isMounted` ref cleanup in `useEffect`.
- [x] **B16b** — `breakout/page.tsx`: Same AbortController cleanup pattern.
- [x] **B17** — `bhavcopy-ingest.ts`: Removed `|| series !== 'EQ'` hard filter. BE (Trade-to-Trade) and SM (SME) stocks were being dropped before reaching the dedup block that correctly prefers EQ.
- [x] **B18** — `ecosystem.config.js`: Added explicit `out_file`/`error_file`/`log_date_format` PM2 paths. Kept `fork` mode — cluster mode breaks in-process cron claim state.
- [x] **B19** — `prisma/schema.prisma`: Added `@@index([date, symbol])` to `DailyOhlcv`. Existing `@@unique([symbol, date])` is symbol-first and cannot serve cross-sectional date queries efficiently. **Deploy action required — see below.**
- [x] **B20** — `gap-failure-exit.test.ts`: Added Friday BTST gate test and stub cleanup verification.
- [x] **B21** — `globals.css`: Added `background-color: var(--background)` to `html` selector for iOS PWA landscape overscroll void.

### Low — 4 items

- [x] **B22** — `with-timeout.ts`: Verified `clearTimeout` already in `finally`. **No change needed — false positive.**
- [x] **B23** — `pattern-breakout/route.ts`: Verified custom `timingSafeEqual` from `@/lib/auth-token` is already length-safe. **No change needed — false positive.**
- [x] **B24** — `layout.tsx`: Added `themeColor: '#06070b'` to `viewport` export for Next.js 14+ iOS PWA status bar coloring.
- [x] **B25** — `multi-year-breakout.service.test.ts`: Added NaN close, null priorHigh, and zero priorHigh edge-case tests.

---

## Test Results

```
tests     710
suites    120
pass      709
fail        0
cancelled   0
skipped     1   (Prisma DB connection required — expected in unit env)
duration  23062ms
```

---

## Deploy-Time Actions Required

> **IMPORTANT:** The following must be executed on the production server after deploying this commit.

### B19 — Create `[date, symbol]` index on `DailyOhlcv`

```bash
# SSH into production (129.159.230.41), then:
npx prisma migrate dev --name add_date_symbol_idx
```

- Non-destructive: adds an index, no data changes.
- Estimated time: < 30 seconds on current 261-day dataset (~2,636 symbols).
- If skipped: Market Breadth and Multi-Year Breakout queries will continue to work but at O(all rows) instead of O(symbols on date). Not a correctness issue, a performance issue.

---

## Files Changed

| File | Bug |
|---|---|
| `src/services/market-tools/market-breadth.service.ts` | B1 |
| `src/app/api/market-tools/breadth/route.ts` | B2 |
| `src/app/api/market-tools/breakout/route.ts` | B3 |
| `src/services/overnight/index-discover.service.ts` | B4 |
| `src/services/market-tools/multi-year-breakout.service.ts` | B5 |
| `src/tests/unit/multi-year-breakout.service.test.ts` | B5, B25 |
| `src/services/market-tools/market-tools-precompute.job.ts` | B6 |
| `src/config/env.ts` | B7 |
| `src/services/alert/telegram.service.ts` | B8 |
| `src/app/api/scanner/route.ts` | B9 |
| `src/services/overnight/overnight.service.ts` | B10 |
| `server-starter.js` | B11 |
| `.github/workflows/verify.yml` | B12 |
| `src/lib/market-hours.ts` | B13 |
| `src/services/market-tools/pattern-breakout.service.ts` | B14 |
| `src/lib/nse-fund-exclusion.ts` | B15 |
| `src/app/market-tools/breadth/page.tsx` | B16a |
| `src/app/market-tools/breakout/page.tsx` | B16b |
| `scripts/market-tools/bhavcopy-ingest.ts` | B17 |
| `ecosystem.config.js` | B18 |
| `prisma/schema.prisma` | B19 |
| `src/tests/unit/gap-failure-exit.test.ts` | B20 |
| `src/app/globals.css` | B21 |
| `src/app/layout.tsx` | B24 |
| `CHANGELOG.md` | docs |
| `README.md` | docs |
| `docs/decisions/acceptance-10d-review-2026-08-31.md` | this file |

---

## Decision

- [ ] **APPROVED** — Proceed to merge `fix/10d-review-25-bugs-2026-08-31` → `main` and deploy.
- [ ] **HOLD** — Issues to resolve before merge (detail below).

**Approved by:** _________________________ **Date:** _____________

**Notes:**

