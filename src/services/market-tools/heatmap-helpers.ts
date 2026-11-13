import { canonicalizeSector } from './nse-sector-map';
import { getSymbolSector } from './market-breadth.service';

/**
 * Resolves a symbol's sector preferring the authoritative getSymbolSector (nse-sector-map),
 * falling back to MarketSnapshot.sector only when unmapped or 'Other'/'OTHERS'.
 */
export function resolveHeatmapSector(symbol: string, snapshotSector?: string | null): string {
  const mapped = getSymbolSector(symbol);
  const isUnmapped = !mapped || mapped.toUpperCase() === 'OTHER' || mapped.toUpperCase() === 'OTHERS';
  const rawSector = !isUnmapped ? mapped : (snapshotSector || 'Other');
  if (!rawSector || rawSector.toUpperCase() === 'OTHERS' || rawSector.toUpperCase() === 'OTHER') {
    return 'Other';
  }
  return canonicalizeSector(rawSector);
}
