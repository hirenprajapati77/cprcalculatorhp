# Friday Weekend Gate — Trading Policy

**Domain**: Overnight / Index Signals · **Effective**: 2026-09-14 (D5-2 fix)
**Owner**: CPR PRO · **Code**: [`overnight.service.ts`](../../src/services/overnight/overnight.service.ts) L607–L633

---

## Purpose

This document describes the Friday Weekend Gate — the set of rules that control whether BTST (Buy Today, Sell Tomorrow) LONG and STBT (Short Today, Buy Tomorrow) SHORT positions are permitted when the signal date falls on a Friday.

Friday overnight holds carry **60+ hours of weekend gap risk** (NSE closes Friday ~15:30 IST, reopens Monday ~09:15 IST). Gap-against events during this window have historically caused repeated option losses:

- BSE-listed index gap-down: 10 Aug 2026
- BSE-listed index gap-down: 21 Aug 2026

---

## Rules

### Rule 1 — BTST LONG: Hard Block on All Fridays

**Status**: ENFORCED (unconditional)

All BTST LONG signals are **blocked unconditionally on Fridays**, regardless of:
- Quant score (even score ≥ 95 does not override)
- Market regime (even BULL regime does not override)
- Historical performance

**Rationale**: A BTST LONG position held over a weekend has 60+ hours of gap-down exposure with no liquidity to exit. Monday open can gap significantly adverse on weekend macro news (geopolitical events, Fed/RBI action, global index crashes). The risk-reward of holding a LONG over a weekend is systematically unfavorable compared to re-entering fresh on Monday after seeing the opening.

**Code reference**: [`overnight.service.ts`](../../src/services/overnight/overnight.service.ts) — `if (finalDir === 'LONG') { continue; }`

---

### Rule 2 — STBT SHORT: Permitted Only in BEAR Regime on Fridays

**Status**: ENFORCED (regime-conditional)

STBT SHORT signals on Fridays are **blocked in CHOPPY and BULL regimes** and **permitted only in confirmed BEAR regime**.

| Friday Regime | STBT SHORT |
|---|---|
| `BEAR` | ✅ Permitted |
| `CHOPPY` | ❌ Blocked |
| `BULL` | ❌ Blocked |
| `UNRELIABLE` | ❌ Blocked (fail-closed) |

**Rationale for asymmetry**: A confirmed BEAR regime (Nifty closing price below EMA20, EMA sloping downward) provides sufficient downtrend conviction that a Friday gap-against (a Monday gap-UP on a Friday STBT) is less likely. Macro bear regimes tend to persist over weekends without sudden reversals. In contrast, CHOPPY or BULL regimes lack this directional conviction, and a weekend positive macro surprise could result in a severe gap-against for STBT positions.

**Code reference**: [`overnight.service.ts`](../../src/services/overnight/overnight.service.ts) — `if (finalDir === 'SHORT' && regime.trend !== 'BEAR') { continue; }`

---

## Deliberate Asymmetry

The policy intentionally treats LONG and SHORT positions differently on Fridays:

- **LONG (BTST)** — hard blocked. Downside on a LONG is theoretically unlimited (stock can crash 20%+ on weekend news).
- **SHORT (STBT)** — conditionally allowed in BEAR regime only. A Friday STBT PUT profits from further declines; in a confirmed BEAR regime, the weekend is statistically more likely to continue the trend.

This asymmetry is **not an error** — it reflects the different risk profiles of LONG and SHORT overnight holds in a trending bear environment.

---

## Revision History

| Date | Change | Author |
|---|---|---|
| 2026-09-14 | D5-2: Converted Friday LONG from score-threshold gate (score ≥ 85) to unconditional hard block | Deep review audit |
| 2026-09-22 | R-2: Formalized policy in this document | 15-day code review |

---

## Review Schedule

This policy should be reviewed:
- After any two consecutive false-blocked signals that would have been profitable (3+ months of data).
- After any SEBI/NSE rule change affecting overnight position margins.
- After any new weekend gap-against event affecting CPR PRO tracked signals.

**Next scheduled review**: March 2027
