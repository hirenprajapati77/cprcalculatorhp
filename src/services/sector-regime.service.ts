/**
 * Tags SECTOR_DIVERGENCE onto stocks whose own sector is net-bearish that scan,
 * using the BULLISH/BEARISH signal tags already computed per stock (same counts
 * the heatmap route already aggregates by sector — no new data source).
 * Minimum 3 scanned stocks per sector required before a sector can be judged
 * "down," to avoid noise in thin sectors (Telecom, Construction, etc.).
 */
export class SectorRegimeService {
  private static readonly MIN_SECTOR_SAMPLE = 3;

  static applySectorDivergence<T extends { sector: string; signals: string[] }>(
    results: T[]
  ): void {
    const counts = new Map<string, { bull: number; bear: number }>();

    for (const r of results) {
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
      if (sample >= SectorRegimeService.MIN_SECTOR_SAMPLE && c.bear >= c.bull) {
        r.signals.push('SECTOR_DIVERGENCE');
      }
    }
  }
}
