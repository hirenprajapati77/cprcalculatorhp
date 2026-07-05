import { BtstService } from './src/services/backtest/btst.service';
const result = BtstService.evaluateOvernight({
  symbol: 'SBIN',
  ltp: 800,
  high: 810,
  low: 790,
  close: 805,
  volume: 1000000,
  avgVolume: 500000,
  history: [
    { date: '2026-07-01', open: 795, high: 805, low: 790, close: 800, volume: 800000 }
  ],
  sector: 'Bank',
  marketCap: 10000,
  market: 'NSE' as const,
  open: 800
});
console.log(`Live BTST Setup for SBIN:\nEntry: ${result.entry}\nSL: ${result.sl}\nTarget: ${result.target}\nRR: ${result.rr}`);
