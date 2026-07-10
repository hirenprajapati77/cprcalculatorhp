import { MarketService } from '../src/services/market.service';
import { BtstService } from '../src/services/backtest/btst.service';

async function main() {
  const symbols = ['PREMIERENE', 'INOXWIND', 'HAVELLS', 'DIXON'];
  for (const sym of symbols) {
    const stock = await MarketService.getStockData(sym);
    if (stock) {
      const v2 = BtstService.evaluateOvernightV2(stock);
      console.log(sym, v2.finalScore, JSON.stringify(v2.scoreBreakdown), JSON.stringify(v2.hardGates));
    } else {
      console.log(sym, 'Failed to fetch data');
    }
  }
}
main();
