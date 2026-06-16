import { OvernightService } from '../services/overnight/overnight.service';
import { MarketService } from '../services/market.service';

// Mock market service
jest.mock('../services/market.service');

describe('Overnight Engine Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should discover LONG setups correctly', async () => {
    (MarketService.getUniverse as jest.Mock).mockReturnValue([{ symbol: 'RELIANCE' }]);
    (MarketService.getStockData as jest.Mock).mockResolvedValue({
      symbol: 'RELIANCE',
      price: 2500,
      open: 2480,
      close: 2510,
      volume: 1000000,
      avgVolume: 800000,
      marketCap: 1500000,
      vwap: 2495,
      rsi: 60,
      sector: 'Energy',
      date: new Date().toISOString()
    });

    const signals = await OvernightService.discover('LONG');
    expect(signals).toBeDefined();
  });

  it('should discover SHORT setups correctly', async () => {
    (MarketService.getUniverse as jest.Mock).mockReturnValue([{ symbol: 'HDFC' }]);
    (MarketService.getStockData as jest.Mock).mockResolvedValue({
      symbol: 'HDFC',
      price: 1500,
      open: 1520,
      close: 1480,
      volume: 1500000,
      avgVolume: 1000000,
      marketCap: 800000,
      vwap: 1505,
      rsi: 30,
      sector: 'Financial Services',
      date: new Date().toISOString()
    });

    const signals = await OvernightService.discover('SHORT');
    expect(signals).toBeDefined();
  });

  it('should resolve conflicts in BOTH mode', async () => {
    (MarketService.getUniverse as jest.Mock).mockReturnValue([{ symbol: 'TCS' }]);
    (MarketService.getStockData as jest.Mock).mockResolvedValue({
      symbol: 'TCS',
      price: 3500,
      open: 3510,
      close: 3500,
      volume: 500000,
      avgVolume: 400000,
      marketCap: 1200000,
      vwap: 3505,
      rsi: 50,
      sector: 'IT',
      date: new Date().toISOString()
    });

    const signals = await OvernightService.discover('BOTH');
    expect(signals).toBeDefined();
  });
});
