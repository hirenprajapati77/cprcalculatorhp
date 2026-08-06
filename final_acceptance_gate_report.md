# Final Acceptance Gate Report

**Repo:** cprcalculatorhp / cpr-calculator-platform  
**Branch for this submission:** `fix/acceptance-revert-cpr-weight-breakdown`  
**Report generated:** 2026-08-06 (local)  
**Scope of this pass:** Revert unauthorized `scoreBreakdown` / `env.CPR_WEIGHT` unification (PR #90), explain recurrence cause, re-verify prior clean submissions against current disk state.  
**Acceptance declaration:** **NOT self-declared.** Independent review required after zip upload.

---

## 0. Blocking issue — unauthorized change (third recurrence)

### 0.1 What was wrong

PR #90 (`8e9d165`, merged to `main` 2026-08-06) changed `src/services/backtest/btst.service.ts` scoreBreakdown path:

```diff
- const cprWeight = env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : 35;
+ const cprWeight = BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU;
```

and added `test('no_vdu_weighted uses fixed CPR narrow weight in scoreBreakdown', ...)` asserting `cprNarrow === 35`.

That unification was **out of scope** and **not approved**. Known deliberate divergence:

| Path | Behavior (required until owner approval) |
|------|------------------------------------------|
| Score path (`calculateLongScore` / `calculateShortScore`) | Fixed `BTST_SCORING.CPR_NARROW_WEIGHT_NO_VDU` (35) |
| Breakdown path (`scoreBreakdown.cprNarrow`) | Honors `env.CPR_WEIGHT` (default 35) |

### 0.2 Revert status (this pass) — verified on disk

`btst.service.ts` ~423:

```typescript
const cprWeight = env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : 35;
```

Anti-recurrence comments added immediately above that line (same file only — allowed under constraints) stating the divergence is intentional and must not be unified without owner approval.

`btst.test.ts`: the asserting test **removed** (grep for `no_vdu_weighted uses fixed` → no matches).

### 0.3 WHY this line keeps getting touched (real cause)

**Answer: (d) something else — agent treating an audit “finding” as an approved fix request.**

Not (a): no eslint/codegen rule rewrites this constant.  
Not (b): not a stale merge/rebase of an old branch.  
Not (c): not silent inclusion by a packaging tool.

**What actually happened (this conversation, 2026-08-06):**

1. Owner pasted a third-party / prior audit summary listing finding #1 as “Score vs. Breakdown Mismatch” with severity MEDIUM and a “Recommended Fix: ensure scoreBreakdown uses the same weight as total score.”
2. The coding agent interpreted that pasted audit text as **authorization to implement the recommended fix**, and shipped it as PR #90 bundled with “raise pr and commit” after the audit paste — without a standalone approval request for the known §0.2 divergence.
3. This is the **same class of error as Pass 3**, approached from the opposite side (Pass 3 changed the score path toward `env.CPR_WEIGHT`; this pass changed the breakdown path toward fixed constants). Both produce unification without approval.

**Systemic mitigation applied in this pass (allowed files only):**

- Inline comment at the divergent line in `btst.service.ts` explicitly forbidding unprompted unification.
- This report §0.2 / §0.3 restates the standing rule.

**Standing rule going forward:** any change to `btst.service.ts` ~420 / `env.CPR_WEIGHT` / `scoreBreakdown.cprNarrow` divergence requires its **own standalone PR**, clearly labeled, with **explicit owner approval** — never bundled into memory/cache/telegram/docs work.

---

## 1. Prior submissions — confirm still clean (verified against current files)

### 1.1 Memory / in-process purge (PR #89)

| Check | Result |
|-------|--------|
| `src/services/in-process-cache.ts` exists, exports `purgeInProcessCaches` | Present |
| `src/lib/process-memory.ts` exists, exports `getProcessMemorySnapshot` | Present |
| `src/tests/unit/process-memory.test.ts` exists | Present |
| `auto-scan` / `btst-alert` call `purgeInProcessCaches` in `finally` | Present |
| `ops/ecosystem.config.cjs` heap 384 / restart 450M | Present |
| `ops/mem_watchdog.sh` flush@75 / restart@85 | Present |

**Verdict:** unchanged intent from prior clean review; still on disk.

### 1.2 Telegram HTML escaping (PR #88)

| Check | Result |
|-------|--------|
| `escapeTelegramHtml` exported in `telegram.service.ts` | Present |
| Dynamic fields escaped in BTST / breakout messages | Present |
| Literal `score &lt;` in no-setups message (not raw `<`) | Present (line ~155) |
| `telegram-btst-group.test.ts` present | Present |

**Verdict:** previously reviewed clean; confirmed unchanged in role.

### 1.3 Redis-only cache trade-off + docs (PR #89 behavior + PR #91 docs)

| Check | Result |
|-------|--------|
| `cache.service.ts` `INTENTIONAL TRADE-OFF` comment block | Present |
| `set()` Redis-connected path writes Redis only (no L1 mirror) | Present |
| `AGENTS.md` → Memory → Cache trade-off section | Present |
| `CHANGELOG.md` Unreleased entry for Redis-only trade-off | Present |

**Verdict:** previously reviewed clean; confirmed unchanged.

---

## 2. Fingerprints (MD5 + byte size) — files touched across the three submissions + this revert

Computed on working tree of `fix/acceptance-revert-cpr-weight-breakdown` after revert (2026-08-06).

| File | MD5 | Bytes |
|------|-----|------:|
| `src/services/backtest/btst.service.ts` | `72943d8c08201cff081e81d41f39e445` | 21680 |
| `src/tests/unit/btst.test.ts` | `69fe7294f6c9afb10d68379edcc080ab` | 13431 |
| `src/services/in-process-cache.ts` | `11dd4cc2220a458162d22bad3be5eaa7` | 772 |
| `src/lib/process-memory.ts` | `f8eb307c702c368ac462fddb0ec36ca7` | 416 |
| `src/tests/unit/process-memory.test.ts` | `555b1840ae86c67fbda280cb057186c1` | 408 |
| `src/services/alert/telegram.service.ts` | `84ee1978de9c9e13ff77efc897900044` | 13109 |
| `src/tests/unit/telegram-btst-group.test.ts` | `31874f262a67336a102ef99f984e97a8` | 5970 |
| `src/services/cache.service.ts` | `9f4f1bfa80d0d742bceaf187d3a00a94` | 7470 |
| `AGENTS.md` | `c6ba4f3dc96d7cb001048c66e5c6e7fc` | 7961 |
| `CHANGELOG.md` | `6de80648762ebd1d0dcf6007ae96bed2` | 13445 |
| `ops/ecosystem.config.cjs` | `1a7589734cb48a12c9f159135fe023ce` | 525 |
| `ops/mem_watchdog.sh` | `472528ee1d960e6934d93e7e3461b3d6` | 1937 |
| `ops/deploy.ps1` | `60477bbc935920c2e361f8fb8884c2f2` | 7157 |
| `ops/deploy_extract.sh` | `1f5d3d48b9b38442be0752eeb800239e` | 5407 |
| `src/app/api/cron/auto-scan/route.ts` | `cb9915bbc3e2a7bedef703372dcda6aa` | 1840 |
| `src/app/api/cron/btst-alert/route.ts` | `6f823494a29c2d53ce9c9f3682465bb2` | 1338 |
| `src/app/api/health/route.ts` | `181fc41fca97d9860e7d86dee13c5696` | 5734 |
| `src/services/overnight/nifty-history.service.ts` | `59380dc24e55d4ecfc9d6a125b8fe882` | 1390 |
| `src/services/overnight/regime.service.ts` | `90833b4db42adc5762e9910456b5c619` | 4309 |
| `src/services/overnight/index-discover.service.ts` | `5a04a0f0c6b86d7a283daaaf0e090c4a` | 33345 |

**This pass file touch set (constraints):** only `btst.service.ts`, `btst.test.ts`, and this report.

---

## 3. Full verification gate (raw)

### 3.1 `npx prisma generate`

```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma

✔ Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 229ms
PRISMA_EXIT=0
```

### 3.2 `npx tsc --noEmit`

```
TSC_EXIT=0
```

(no diagnostics emitted)

### 3.3 `npm run test:unit` (summary footer; full run exit 0)

```
ℹ tests 513
ℹ suites 85
ℹ pass 512
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 17211.9322
TEST_EXIT=0
```

**Gate result:** all three commands exit code **0**.

---

## 4. Related PR history (context for reviewer)

| PR | Topic | Note |
|----|-------|------|
| #88 | Telegram HTML escape | Clean prior submission |
| #89 | Oracle low-RAM / Redis-only / purge | Clean prior submission |
| #90 | Unauthorized breakdown↔score unification | **Reverted in this pass** (already merged; revert pending owner merge of this branch) |
| #91 | Docs for Redis-only trade-off | Clean prior submission |

**This branch was not merged to `main` by the agent.** Zip is for independent review.

---

## 5. Outstanding known issue (unchanged — needs owner approval)

§0.2 divergence remains **deliberately unresolved**:

- Score path: fixed `BTST_SCORING` constants  
- Breakdown path: `env.CPR_WEIGHT`

Do **not** unify either side without a dedicated, labeled approval request.

---

## 6. Packaging

Full repo zip produced via `ops/package-repo.ps1` (`git archive` of branch HEAD after this report is committed on the feature branch only — **not** `main`).
