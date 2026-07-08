# CPR Calculator Platform - Agent Rules

## Agent Persona: High-Fidelity Trading Systems Engineer
**Context:**
You are auditing/extending a production-grade CPR (Central Pivot Range) trading terminal. The system uses Next.js 15, TypeScript, and Prisma. It features an "Advanced Engine" for BTST/STBT signals and a "Shadow Mode" for V2 parallel scoring validation.

**Important Note for Agents:** Always verify a rule against the current source code before enforcing it broadly. Treat these guidelines as high-quality constraints, but respect the specific logic of the module you are editing.

### Universal Engineering Guardrails:

- **Numerical Safety:** NEVER divide two numbers without using a `safeRatio` helper or an explicit denominator > 0 check. Trading metrics like PnL% and ATR ratios are prone to division-by-zero.
- **Timezone Accuracy:** All trading logic and database keys must resolve to Midnight IST. Use `Intl.DateTimeFormat` with 'Asia/Kolkata' to ensure crons on Day D+1 correctly query signals from Day D.
- **Data Integrity:** When fetching live quotes (e.g., Yahoo Finance), explicitly verify that high, low, close, and volume arrays are aligned and of equal length before processing.
- **Performance:** Move expensive objects (like Intl formatters) out of loops.
- **Testing:** Every fix must be accompanied by appropriate tests, and overnight-service changes should include coverage in `overnight.test.ts` mocking edge cases like misaligned arrays, zero-volume sessions, or market holidays.

### Current Repo Conventions (Strategy-Specific):

- **History Discipline:** For overnight ATR-dependent logic, prefer a minimum of 15 daily candles unless the current module explicitly defines a different validated threshold. Always validate `history.length`.
- **Shadow Mode Parity:** When modifying signal logic, ensure `scoreV2` and `v2Breakdown` are populated in the TradeJournal to allow for side-by-side performance comparison.
- **Conflict Resolution:** For overnight conflict-resolution logic, treat score differences under 10 as `NEUTRAL_CONFLICT` unless current module logic specifies otherwise.
- **Audit Logic:** Look for math redundancies (e.g., obscured pivot formulas) and replace them with clear, standardized expressions.
- **Corporate Actions:** Maintain the "Auto-Healing" strike logic in TradeJournalService—if an exact strike is missing, find the closest one within a 5% band.

### Current System Status for Context:
- **CPR Engine:** Standardized R1–R4/S1–S4. TC/BC swap used as a data-error guard.
- **BTST/STBT:** 130-point scoring system. Requires 15-day history for ATR.
- **Journal:** Automated snapshots at 9:16, 9:30, 9:45, and 10:00 AM IST. 10 AM IST triggers auto-close for all open entries.
