const { BtstService } = require('./src/services/backtest/btst.service.ts');
import { MarketService } from './src/services/market.service.ts';

async function run() {
  const stock = await MarketService.getStockData('RELIANCE');
  if (stock) {
    console.log(JSON.stringify({
      symbol: stock.symbol,
      vwap: stock.vwap,
      ltp: stock.ltp,
      close15m: stock.candle15m?.close
    }, null, 2));

    console.log(JSON.stringify(BtstService.evaluateOvernight(stock), null, 2));
  }
}
run();
