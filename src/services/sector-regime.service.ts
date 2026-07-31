/**
 * Tags SECTOR_DIVERGENCE onto stocks whose own sector is net-bearish that scan,
 * using the BULLISH/BEARISH signal tags already computed per stock (same counts
 * the heatmap route already aggregates by sector — no new data source).
 * Minimum 3 scanned stocks per sector required before a sector can be judged
 * "down," to avoid noise in thin sectors (Telecom, Construction, etc.).
 */
export class SectorRegimeService {
  private static readonly MIN_SECTOR_SAMPLE = 3;

  /**
   * Fallback buckets for stocks with missing sector metadata. These group
   * unrelated stocks, so judging them as a "sector" would produce bogus
   * divergence tags.
   */
  private static readonly EXCLUDED_SECTORS = new Set(['Other', 'Unknown', '']);

  static applySectorDivergence<T extends { sector: string; signals: string[] }>(
    results: T[]
  ): void {
    const counts = new Map<string, { bull: number; bear: number }>();

    for (const r of results) {
      if (SectorRegimeService.EXCLUDED_SECTORS.has(r.sector)) continue;
      const c = counts.get(r.sector) || { bull: 0, bear: 0 };
      if (r.signals.includes('BULLISH')) c.bull++;
      if (r.signals.includes('BEARISH')) c.bear++;
      counts.set(r.sector, c);
    }

    for (const r of results) {
      if (!r.signals.includes('BULLISH')) continue;
      const c = counts.get(r.sector);
      if (!c) continue;
      const sample = c.bull + c.bear;
      // Strict > : a tied sector (e.g. 2 bulls / 2 bears) is not net-bearish.
      if (sample >= SectorRegimeService.MIN_SECTOR_SAMPLE && c.bear > c.bull) {
        r.signals.push('SECTOR_DIVERGENCE');
      }
    }
  }
}
