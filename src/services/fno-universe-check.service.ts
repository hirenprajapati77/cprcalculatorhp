import { MarketService } from './market.service';

export interface FnoUniverseDiff {
  checkedAt: string;
  nseListCount: number;
  localListCount: number;
  newlyEligible: string[];
  newlyIneligible: string[];
  symbolsOnlyInNse: string[];
  hasDrift: boolean;
}

export class FnoUniverseCheckService {
  static async checkDrift(): Promise<{ ok: boolean; data?: FnoUniverseDiff; error?: string }> {
    try {
      const res = await fetch('https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(10_000)
      });

      if (!res.ok) {
        return { ok: false, error: `NSE fetch failed with status ${res.status}` };
      }

      const text = await res.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      let startIndex = 0;
      // Skip until "Derivatives on Individual Securities" if it exists
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Derivatives on Individual Securities')) {
          startIndex = i + 1; // Start after the sub-header
          break;
        }
      }
      
      const nseSymbols = new Set<string>();
      const indexDerivatives = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50'];

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const cols = line.split(',');
        if (cols.length > 1) {
          const symbol = cols[1].trim().toUpperCase();
          if (symbol === 'SYMBOL' || symbol === '') continue;
          if (indexDerivatives.includes(symbol)) continue; // Filter out known indices just in case
          nseSymbols.add(symbol);
        }
      }

      if (nseSymbols.size === 0) {
        return { ok: false, error: 'Parsed NSE list is empty, CSV format may have changed.' };
      }

      const rawUniverse = MarketService.getRawUniverse();
      const nseListArray = Array.from(nseSymbols);
      
      const newlyEligible: string[] = [];
      const symbolsOnlyInNse: string[] = [];
      const newlyIneligible: string[] = [];

      // Check for newly eligible or completely new symbols
      for (const nseSym of nseListArray) {
        const localStock = rawUniverse.find(s => s.symbol.trim() === nseSym);
        if (!localStock) {
          symbolsOnlyInNse.push(nseSym.padEnd(12, ' '));
        } else if (!localStock.isFnO) {
          newlyEligible.push(nseSym.padEnd(12, ' '));
        }
      }

      // Check for newly ineligible symbols
      for (const localStock of rawUniverse) {
        const cleanSym = localStock.symbol.trim();
        if (localStock.isFnO && !nseSymbols.has(cleanSym)) {
          newlyIneligible.push(localStock.symbol);
        }
      }

      const hasDrift = newlyEligible.length > 0 || newlyIneligible.length > 0 || symbolsOnlyInNse.length > 0;

      const diff: FnoUniverseDiff = {
        checkedAt: new Date().toISOString(),
        nseListCount: nseSymbols.size,
        localListCount: rawUniverse.filter(s => s.isFnO).length,
        newlyEligible,
        newlyIneligible,
        symbolsOnlyInNse,
        hasDrift,
      };

      return { ok: true, data: diff };
    } catch (error: unknown) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unknown error occurred during fetch' };
    }
  }
}
