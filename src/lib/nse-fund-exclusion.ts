/**
 * Heuristic exclusion of ETFs / liquid / debt / index funds from pattern-based
 * stock scanners (Pattern Breakout, Multi-Year Breakout). These trade under
 * series='EQ' on NSE like ordinary stocks, so they pass the ingest filter,
 * but their NAV is structurally near-flat (liquid/debt funds) or mechanically
 * tracks an index (passive ETFs) -- they will satisfy "flat base" consolidation
 * criteria or ride index-level breakouts regardless of any genuine
 * institutional accumulation pattern, which is noise for a scanner built on
 * O'Neil/Minervini methodology (designed for operating-company stocks).
 *
 * This is a heuristic, not an authoritative NSE instrument-type lookup --
 * false negatives (an actual stock symbol that happens to match, e.g. a
 * company whose name ends in a matched suffix) are possible. Revisit with a
 * real NSE ETF/MF symbol master (similar to how fo_mktlots.csv already
 * drives F&O universe membership) if this heuristic proves too noisy either
 * direction.
 *
 * Keep this module free of Node/Prisma/MarketService so client components
 * (e.g. the pattern-breakout page's Trade-Ready filter) can import it too.
 */
const ETF_FUND_SYMBOL_PATTERN =
  /ETF$|BEES$|LIQUID|^GSEC|^MOM(100|30IETF|ENTUM)$|^EQUAL|^NEXT50$|^MID(CAP|SMALL|SEL|150)|^AONETOTAL$|^GROWW./i;

export function isLikelyEtfOrFund(symbol: string): boolean {
  return ETF_FUND_SYMBOL_PATTERN.test(symbol);
}
