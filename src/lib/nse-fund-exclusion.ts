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
 * company whose name ends in a matched suffix) are possible, and false
 * positives (a real ETF whose symbol doesn't match any pattern below) are
 * expected too -- confirmed live, 29 Aug 2026: HDFCMOMENT, MONQ50,
 * LICNMID100, MULTICAP all slipped through the original regex. Revisit with
 * a real NSE ETF/MF symbol master (similar to how fo_mktlots.csv already
 * drives F&O universe membership) if this keeps needing manual additions --
 * that's the durable fix; this file is a stopgap.
 *
 * Keep this module free of Node/Prisma/MarketService so client components
 * (e.g. the pattern-breakout page's Trade-Ready filter) can import it too.
 */
// B15 fix (corrected): only one real bug in this regex, not two:
// 1. LIQUID — intentionally UNANCHORED to catch mid-string matches like HDFCLIQUID,
//    LIQUIDCASE, GROWWLIQID, etc. Per live test coverage, this is correct behavior.
//    The risk of false-positives on hypothetical "LIQUIDITY..." stocks is accepted.
// 2. ^GROWW. — the dot IS intentional as a regex wildcard (matches any character),
//    NOT a literal dot. This correctly matches GROWWLIQID, GROWWMOM50 (any Groww
//    ETF/fund with at least one char after "GROWW"), while excluding the bare
//    "GROWW" ticker (no char after the W). NOT a bug — do not escape this dot.
const ETF_FUND_SYMBOL_PATTERN =
  /ETF$|BEES$|LIQUID|^GSEC|^MOM(100|30IETF|ENTUM)$|^EQUAL|^NEXT50$|^MID(CAP|SMALL|SEL|150|100)|^AONETOTAL$|^GROWW./i;

/**
 * Individually confirmed gaps in the regex above -- real ETF/index-fund
 * symbols that don't match any generalizable pattern without risking a
 * false positive on a real stock ticker. Add here as spotted; each entry
 * should have a comment noting where/when it was confirmed.
 */
const KNOWN_GAP_SYMBOLS = new Set([
  'HDFCMOMENT',  // HDFC NIFTY200 Momentum 30 ETF -- confirmed live 29 Aug 2026
  'MONQ50',      // Motilal Oswal NASDAQ Q50 ETF -- confirmed live 29 Aug 2026
  'LICNMID100',  // LIC MF Nifty Midcap 100 Index Fund -- confirmed live 29 Aug 2026
  'MULTICAP',    // Multi-cap index fund/ETF -- confirmed live 29 Aug 2026
]);

export function isLikelyEtfOrFund(symbol: string): boolean {
  return ETF_FUND_SYMBOL_PATTERN.test(symbol) || KNOWN_GAP_SYMBOLS.has(symbol.toUpperCase());
}
