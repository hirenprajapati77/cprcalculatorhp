# Agent Prompt: CPR PRO Scanner UI Improvements

**Repository:** https://github.com/hirenprajapati77/cprcalculatorhp  
**Branch:** `main` (commit `5a4a5a3c`)  
**Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, lucide-react  
**Target:** Scanner dashboard UI (`/scanner`) + navigation shell

---

## 1. ROLE

You are a senior frontend engineer implementing UI/UX improvements to the CPR PRO trading platform scanner. Work strictly within the existing codebase patterns (React server/client components, Tailwind, lucide-react icons, Zod validation where applicable). Do not change backend API contracts.

---

## 2. FILES TO MODIFY / CREATE

| File | Role |
|------|------|
| `src/components/scanner/ScannerClient.tsx` | Main scanner UI — filter row, results table, empty state |
| `src/components/layout/Navbar.tsx` | Market status chip, autoscroll, top nav |
| `src/components/enterprise/EnterpriseShell.tsx` | Workstation shell, keyboard shortcuts |
| `src/components/enterprise/Sidebar.tsx` | Sidebar navigation |
| `src/components/enterprise/TopBar.tsx` | TopBar market ticker |
| `src/components/ui/Toast.tsx` | Existing toast — use for error surfacing |
| `src/lib/export-utils.ts` | Existing export utilities — reference for scanner export |
| `src/app/api/scanner/route.ts` | Read-only reference for API response shape |
| `src/app/settings/page.tsx` | Reference for localStorage persistence pattern |

---

## 3. IMPROVEMENTS (in priority order)

### P1-1 — Collapsible Advanced Filters + Filter Presets

**Location:** `src/components/scanner/ScannerClient.tsx`

**Current behavior (from source):** All filter dropdowns render expanded at once: Universe, Exchange, Sector, Market Cap, Price Min/Max, Score Min/Max, Width Min/Max, Active Signal.

**Required change:**
1. Wrap non-essential filters (Price Min/Max, Score Min/Max, Width Min/Max, Active Signal) inside a collapsible `<details>` or toggleable section labeled "Advanced Filters" (default closed).
2. Keep only Universe, Exchange, Sector, Market Cap visible by default.
3. Add a "Filter presets" dropdown above the filter row with options: `Default`, `High Conviction (Score ≥ 75)`, `Narrow CPR Only`, `Watchlist Symbols`. Selecting a preset pre-fills the relevant filter inputs and shows an "Active filters: X" pill.
4. When any filter or preset is active, show a removable pill/chip per active filter plus a "Clear all" link.

**Acceptance criteria:**
- Default view shows ≤ 4 filter dropdowns.
- Clicking "Advanced Filters" expands the hidden filters.
- Selecting a preset updates URL query params (optional but preferred) and shows active filter pills.
- "Clear all" resets to default state.

---

### P1-2 — Zero-Signal / Empty State for Scanner Table

**Location:** `src/components/scanner/ScannerClient.tsx`

**Current behavior (from source):** `src/app/api/scanner/route.ts` returns `results: []` when no data. The table renders an empty `<tbody>` with no messaging.

**Required change:**
1. When `results.length === 0` and `success === true`, render a dedicated empty-state card instead of the table.
2. Empty state must include:
   - Icon (use `lucide-react` `SearchX` or `BarChart3`)
   - Headline: "No qualifying setups today"
   - Subtext explaining possible causes (market closed, filters too tight, scan window not active — BTST window is 15:10–15:25 IST)
   - Two buttons: "Reset filters" and "View scan log"
3. When `results.length === 0` and API returned an error, show an error toast (see P1-4) instead of empty state.

**Acceptance criteria:**
- Empty table replaced by centered empty-state card.
- Buttons are functional (reset clears filters; view log navigates to `/scanner/history` or shows scan log modal).

---

### P1-3 — Auto-Refresh Status Badge

**Location:** `src/components/scanner/ScannerClient.tsx`

**Current behavior (from source):** `Navbar.tsx` runs `setInterval(fetchStatus, 30000)` for market status, but the scanner page has no visual indicator of when data was last refreshed or if auto-refresh is on.

**Required change:**
1. Read `autoRefresh` from `localStorage` key `cpr_settings_auto_refresh` (pattern already used in `src/app/settings/page.tsx`).
2. Add a small badge near the "Scan Market" button showing: `Last scanned: HH:MM IST · Auto-refresh: 15m` (or "Off").
3. When auto-refresh is active, show a subtle spinner or pulse dot next to the badge during an active fetch.

**Acceptance criteria:**
- Badge reflects stored auto-refresh interval.
- Timestamp updates after each successful scanner fetch.
- Badge hides when auto-refresh is "Off".

---

### P1-4 — Surface Silent API Failures as Toasts

**Location:** `src/components/layout/Navbar.tsx`, `src/components/enterprise/TopBar.tsx`

**Current behavior (from source):** Both components fetch `/api/market-status` and `/api/broker/fyers/status` with `catch {}` blocks that silently swallow errors.

**Required change:**
1. Import `useToast` from `@/components/ui/Toast`.
2. On fetch failure for market status, show a non-blocking toast: `"Market data feed temporarily unavailable"` (variant: `destructive` or `warning`).
3. On fetch failure for Fyers status, show: `"Broker feed offline — Yahoo fallback active"`.
4. Do not block the UI; toasts should auto-dismiss after 5–8 seconds.

**Acceptance criteria:**
- API failures produce visible toasts.
- UI remains functional during failures (cached/stale data shown).

---

### P1-5 — Keyboard Navigation on Custom Dropdowns

**Location:** `src/components/scanner/ScannerClient.tsx` (filter dropdowns: Exchange, Sector, Market Cap, etc.)

**Current behavior (from source):** Custom dropdowns are built from standard HTML `<select>` or custom divs. `EnterpriseShell.tsx` has Ctrl+K and Ctrl+[ shortcuts, but scanner dropdowns lack ARIA roles.

**Required change:**
1. Ensure every custom dropdown has `role="listbox"`, `role="option"` on items, and `aria-expanded` on the trigger.
2. Support keyboard traversal: ArrowUp/ArrowDown to move focus, Enter/Space to select, Esc to close.
3. Maintain visible focus ring (Tailwind `focus-visible:ring-2 focus-visible:ring-accent-blue`).

**Acceptance criteria:**
- Tabbing reaches each dropdown.
- Arrow keys move between options within an open dropdown.
- Screen readers announce expanded/collapsed state.

---

### P1-6 — Mobile-Responsive Scanner Table

**Location:** `src/components/scanner/ScannerClient.tsx`

**Current behavior (from source):** Scanner table renders 10+ columns: Symbol, LTP, Bias, CPR Width, Score, Model R:R, Inspect, Watch, Analyze, Compare, Chart.

**Required change:**
1. On screens `< 768px`, render scanner rows as cards instead of table rows.
2. Each card shows: Symbol (badge with sector), LTP, Score (color-coded), Entry/SL/Target compact row, and a primary "Inspect" action.
3. Hide secondary columns (Model R:R, Watch, Analyze, Compare) on mobile behind an overflow menu or details expansion.

**Acceptance criteria:**
- Mobile view does not require horizontal scrolling.
- All critical trade data (symbol, price, score, entry, SL, target) visible on card.

---

### P1-7 — Scanner Print / PDF Export

**Location:** `src/components/scanner/ScannerClient.tsx`, reference `src/lib/export-utils.ts`

**Current behavior (from source):** Export utilities exist for market tools but no scanner-specific print view.

**Required change:**
1. Add a "Print" button to the scanner toolbar.
2. Clicking opens a print-friendly view (or `window.print()`) showing only the scanner table with current filters applied, styled via `@media print`.
3. Include filter summary at top of print output (e.g., "Universe: NSE FNO | Filters: Score ≥ 60").

**Acceptance criteria:**
- Print button visible in desktop toolbar.
- Print output excludes nav, sidebar, and ads; shows table only.

---

## 4. CODE PATTERNS TO FOLLOW

- **Components:** Use existing shadcn/ui components (`Button`, `Card`, `Badge`, `Toast`, `Select`) from `src/components/ui/`.
- **Icons:** Import from `lucide-react` (already a dependency).
- **LocalStorage:** Follow the pattern in `src/app/settings/page.tsx` (`cpr_settings_*` keys).
- **API calls:** Use `fetch` with `NextResponse.json` patterns already established; wrap in try/catch with toast fallback.
- **Styling:** Tailwind classes matching the existing dark theme (`bg-bg-secondary`, `border-border-primary`, `text-text-primary`, etc.).
- **Types:** Define TypeScript interfaces for filter state and preset config; avoid `any`.

---

## 5. DEFINITION OF DONE

For each improvement:
- [ ] Code compiles (`tsc --noEmit` passes)
- [ ] ESLint clean (`npm run lint`)
- [ ] No existing tests broken (`npm test`)
- [ ] Manual verification: open `/scanner` on local dev server, interact with the feature
- [ ] Mobile responsive (test via browser dev tools)
- [ ] Keyboard accessible (Tab/Arrow/Enter/Esc)

---

## 6. OUTPUT

Produce the modified files in the workspace. For each change, include a short comment block at the top of the modified component summarizing what was implemented (e.g., `// P1-1: Collapsible advanced filters + filter presets`).

Do not modify `prisma/schema.prisma`, API route contracts, or backend business logic. Frontend-only changes only.

---

## 7. EXAMPLE: P1-1 CODE SKELETON (for reference)

```tsx
// Inside ScannerClient.tsx filter row
<div className="flex flex-wrap gap-3 items-end mb-4">
  {/* Always visible */}
  <FilterDropdown label="Universe" options={universeOptions} value={universe} onChange={setUniverse} />
  <FilterDropdown label="Exchange" ... />
  <FilterDropdown label="Sector" ... />
  <FilterDropdown label="Market Cap" ... />

  {/* Collapsible advanced */}
  <details className="group">
    <summary className="cursor-pointer text-xs font-medium text-text-secondary hover:text-text-primary">
      Advanced Filters
    </summary>
    <div className="mt-2 flex flex-wrap gap-3">
      <FilterInput label="Price Min/Max" ... />
      <FilterInput label="Score Min/Max" ... />
      <FilterInput label="Width Min/Max" ... />
      <FilterDropdown label="Active Signal" ... />
    </div>
  </details>

  {/* Presets */}
  <Select value={preset} onValueChange={applyPreset}>
    <SelectTrigger>Filter presets</SelectTrigger>
    <SelectContent>
      <SelectItem value="default">Default</SelectItem>
      <SelectItem value="high-conviction">High Conviction (Score ≥ 75)</SelectItem>
      <SelectItem value="narrow-cpr">Narrow CPR Only</SelectItem>
    </SelectContent>
  </Select>

  {/* Active pills */}
  {activeFilters.length > 0 && (
    <div className="flex flex-wrap gap-1">
      {activeFilters.map(f => (
        <Badge key={f.id} variant="destructive" className="flex items-center gap-1">
          {f.label} {f.value}
          <X onClick={() => removeFilter(f.id)} size={10} className="ml-1 cursor-pointer hover:text-white" />
        </Badge>
      ))}
      <Button variant="outline" size="sm" onClick={clearAllFilters}>Clear all</Button>
    </div>
  )}
</details>
```

---

Save this prompt as `AGENTS_UI_IMPROVEMENT_PROMPT.md` in your workspace and hand it to your coding agent.
