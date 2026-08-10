# Decision memo: CPR scanner entry basis (today vs tomorrow CPR)

**Status:** AWAITING OWNER SIGN-OFF  
**Date:** 2026-08-10  
**Scope:** Investigation + documentation only (no scoring / entry-logic code changes in this change set)  
**Related:** PR #98 / commit `9395ef5` (`fix/tradable-hardening-breakout-fyers15m`), merged to `main` as `4b99ec3`

---

## What changed (and why it mattered)

Until `9395ef5`, live CPR scanner trade levels were built as:

- **Bias** from LTP vs **today’s** CPR band (`ltp > cprToday.tc` / `< cprToday.bc`)
- **Entry / SL / Target / RR** from **tomorrow’s projected CPR** (`cprTomorrow.tc/bc/r1–r4/s1–s4`), i.e. CPR computed from **today’s forming OHLC**

After `9395ef5`, bias **and** entry/SL/target/RR all use **today’s CPR** (`cprToday.*`).

The change was framed as making same-session levels “actionable” (pullback-to-today-TC / bounce-to-today-BC). It shipped inside a larger hardening PR and was **not** called out for separate owner sign-off the way the intentional `CPR_WEIGHT` score-breakdown divergence was.

**Important:** production deploy HEAD at investigation time was still `b4e742a` (PR #92 era). `9395ef5` / PR #98 was **on GitHub `main` but not yet running on the Oracle box**, so live DB rows for 2026-08-10 still reflect the **pre-change (tomorrow-CPR entry)** writer.

---

## Downstream readers of `ScannerResult` / live CPR scan `entry|sl|target|rr`

Inventory below is limited to the **CPR equity scanner → persisted `ScannerResult` / live scan response** chain (not BTST overnight / index discover paths, which use different models).

### Persist / API (writes feed readers)

| File | Lines | Role |
|------|-------|------|
| `src/services/scanner-controller.ts` | 171–174, 198–201 | Upserts `ScannerResult.entry/sl/target/rr` from live scan |
| `src/app/api/scanner/route.ts` | 30, 356–359 | Passes `r.entry/sl/target` into option enrichment; returns them on live/API payloads |

### CPR journal (trigger gate — highest product sensitivity)

| File | Lines | Role |
|------|-------|------|
| `src/services/scheduler/cpr-journal.job.ts` | 74–79 | **`if (signal.ltp < signal.entry)` → skip “not triggered”** |
| `src/services/scheduler/cpr-journal.job.ts` | 96–98 | Passes `signal.entry/sl/target` into `OptionSuggestionService.suggestOptionForBtst` |
| `src/services/scheduler/cpr-journal.job.ts` | 71–73 | **Stale comment** still says entry is “tomorrow's projected TC” — no longer true after `9395ef5` once deployed |

### Telegram (user-visible “Entry”)

| File | Lines | Role |
|------|-------|------|
| `src/services/alert/breakout-alert.pipeline.ts` | 32–35 | Maps scan `entry/sl/target/rr` (fallback to tc/bc/r1) into breakout alert rows |
| `src/services/alert/telegram.service.ts` | 270–272, 287–288 | Breakout Telegram: option suggest + **displays Entry / SL / Target / RR** |

(Note: `telegram.service.ts` 168–171 / 184–187 format Entry for **BTST/STBT** alerts from overnight results — different data path, listed only to avoid confusion.)

### UI (live scan response)

| File | Lines | Role |
|------|-------|------|
| `src/components/scanner/ScannerClient.tsx` | 103–108 | LONG/SHORT bias from `entry` vs `target`/`sl` |
| `src/components/scanner/ScannerClient.tsx` | 552–577, 625 | Table cells: Entry / SL / Target / RR |
| `src/components/scanner/ScannerClient.tsx` | 3636–3640, 3820 | Drawer / compare uses `drawerStock.entry/sl/target/rr` |

### Option enrichment (uses levels as stock entry/sl/target inputs)

| File | Lines | Role |
|------|-------|------|
| `src/app/api/scanner/route.ts` | 30 | `suggestOption(..., r.entry, r.sl, r.target, ...)` |
| `src/services/option-suggestion.service.ts` | 543–554 | `suggestOption` / `buildSuggestion` consume stockEntry/stockSl/stockTarget |
| `src/services/scheduler/cpr-journal.job.ts` | 92–99 | Journal path uses `suggestOptionForBtst` with same fields |

### Analytics / historical comparison vs pre-`9395ef5` rows

| Finding | Detail |
|---------|--------|
| No dedicated analytics reader of `ScannerResult.entry` | `src/services/analytics.service.ts` has **no** `entry` / `ScannerResult` usage |
| Journal analytics | Operates on `TradeJournal` (option `entryCmp`, outcomes) — **indirect**: which CPR rows get journaled depends on the `ltp < entry` gate above |
| Historical apples-to-apples | Any future report that joins `ScannerResult.entry` across dates spanning deploy of `9395ef5` mixes **tomorrow-CPR entries** (pre) with **today-CPR entries** (post) unless explicitly versioned |

---

## CPR journal skip-rate evidence (real numbers only)

### Production logs

Raw probes (2026-08-10 ~13:35 IST):

- PM2 out log mtime ~08:06 IST; size ~267 KB  
- `grep -c CPRJournal /home/ubuntu/.pm2/logs/cpr-platform-out.log` → **0**  
- Deployed app SHA: **`b4e742a`** (not `9395ef5` / `4b99ec3`)

CPR journal cron window is **15:20–15:24 IST**. At investigation time that window had **not** run yet today, and retained logs contain **no** `[CPRJournal] … not triggered` lines.

**Conclusion from logs:** no before/after skip-rate delta is available from CPRJournal log lines.

### Production DB (`ScannerResult`) — structural gate proxy

`would_skip_ltp_lt_entry` = rows with `score >= 75` (journal threshold) or, for visibility, `score >= 60`, where `ltp < entry`.

**score ≥ 75 (actual journal qualifying threshold):**

| date | qualifying | would_skip_ltp_lt_entry |
|------|------------|-------------------------|
| 2026-08-10 | 0 | — |
| 2026-08-07 | 0 | — |
| 2026-08-06 | 0 | — |
| 2026-08-05 | 1 | 0 |
| 2026-08-04 | 1 | 0 |
| 2026-08-03 | 2 | 0 |

**score ≥ 60 (illustrative only — not the journal cut):**

| date | qualifying | would_skip_ltp_lt_entry |
|------|------------|-------------------------|
| 2026-08-10 | 6 | 1 |
| 2026-08-07 | 8 | 4 |
| 2026-08-06 | 5 | 1 |
| 2026-08-05 | 7 | 2 |
| 2026-08-04 | 10 | 4 |
| 2026-08-03 | 11 | 3 |

**Before/after delta for `9395ef5`:** **not available.**  
All rows above were written by the **pre-deploy** binary (`b4e742a`, tomorrow-CPR entry). There is no post-`9395ef5` production scan population to compare against yet.

---

## Concrete downstream effects (if today-CPR entries stay after deploy)

1. **CPR journal `ltp < entry` gate** becomes easier to pass for bullish names already trading above **today’s TC** (entry ≈ today’s TC, often near/below LTP). Under tomorrow-CPR, entry was often **today’s projected next-session TC**, which could sit **above** current LTP → more “not triggered” skips. Direction of skip-rate change is expected but **unmeasured on prod** until deploy + at least one 15:20 journal run.
2. **Telegram breakout Entry/SL/Target** and **scanner UI** will show same-session CPR levels instead of next-session projection.
3. **Option suggestion** strike/SL/target scaffolding that keys off stock entry/sl/target will shift with those levels.
4. **Historical `ScannerResult` continuity** breaks at the deploy boundary unless analytics ignore `entry` or tag writer version.
5. **Stale comment** in `cpr-journal.job.ts` (lines 71–73) will mis-document the gate until updated **after** owner decision.

---

## Options (owner chooses)

### (a) Keep today’s-CPR entries as the new standard

- Treat same-session actionable levels as intentional product semantics.
- After sign-off, add a governance comment in `scanner.service.ts` adjacent to the Trade Setup block, matching the `CPR_WEIGHT` pattern, e.g.  
  `INTENTIONAL — do not revert without owner approval, see docs/decisions/cpr-entry-basis-2026-08-10.md`
- Update the stale “tomorrow's projected TC” comment in `cpr-journal.job.ts`.
- After deploy, capture one trading day’s CPRJournal `not triggered` counts for a real post-change baseline.

### (b) Revert to tomorrow’s-CPR entries pending further review

- Restore `cprTomorrow.*` for entry/SL/target/RR while leaving bias on `cprToday` (prior behavior).
- Keep this memo as the record of why the temporary flip happened and what must be re-checked (journal skip rate, Telegram copy, option enrichment).
- Do **not** treat UI/tests updated in #98 as proof of product intent without this sign-off.

---

## Decision

**AWAITING OWNER SIGN-OFF**

- [ ] (a) Keep today’s-CPR entries + governance comment  
- [ ] (b) Revert to tomorrow’s-CPR entries pending further review  

Owner: ______________________  Date: __________
