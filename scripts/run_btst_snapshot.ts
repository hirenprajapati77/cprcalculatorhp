import { BtstService } from '../src/services/backtest/btst.service';
import { MarketService } from '../src/services/market.service';

async function main() {
  try {
    const symbols = ['RELIANCE', 'HDFCBANK', 'INFY'];
    const results = [];
    for (const symbol of symbols) {
      const stock = await MarketService.getStockData(symbol);
      const res = await BtstService.evaluateOvernight(stock);
      results.push(res);
    }
    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    console.error(e);
  }
}

main();
