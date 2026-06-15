import { MarketService } from './src/services/market.service.ts';

async function main() {
  process.env.MARKET_DATA_MODE = 'live';
  const data = await MarketService.getStockData('RELIANCE');
  console.log('LTP:', data?.ltp);
  console.log('Date:', data?.history[data.history.length - 1]?.date);
  console.log('High:', data?.high, 'Low:', data?.low);
}

main();
