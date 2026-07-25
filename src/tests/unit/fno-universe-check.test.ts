import { FnoUniverseCheckService } from '../../services/fno-universe-check.service';
import { MarketService } from '../../services/market.service';

// Mock fetch
global.fetch = jest.fn();

// Mock MarketService
jest.mock('../../services/market.service', () => ({
  MarketService: {
    getRawUniverse: jest.fn()
  }
}));

const mockRawUniverse = [
  { symbol: 'HDFCBANK    ', name: 'HDFC Bank', sector: 'Finance', marketCap: 100, isNifty50: true, isNifty200: true, isFnO: true },
  { symbol: 'RELIANCE    ', name: 'Reliance Industries', sector: 'Energy', marketCap: 200, isNifty50: true, isNifty200: true, isFnO: true },
  { symbol: 'NONFNO      ', name: 'Not FNO', sector: 'IT', marketCap: 50, isNifty50: false, isNifty200: false, isFnO: false }
];

describe('FnoUniverseCheckService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (MarketService.getRawUniverse as jest.Mock).mockReturnValue(mockRawUniverse);
  });

  it('should return no drift when NSE list perfectly matches local isFnO list', async () => {
    // Mock CSV response
    const csvContent = `UNDERLYING,SYMBOL
HDFC BANK,HDFCBANK
RELIANCE INDUSTRIES,RELIANCE`;
    
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(csvContent)
    });

    const result = await FnoUniverseCheckService.checkDrift();
    expect(result.ok).toBe(true);
    expect(result.data?.hasDrift).toBe(false);
    expect(result.data?.newlyEligible.length).toBe(0);
    expect(result.data?.newlyIneligible.length).toBe(0);
    expect(result.data?.symbolsOnlyInNse.length).toBe(0);
  });

  it('should flag newly-ineligible stock', async () => {
    // RELIANCE is missing from CSV but isFnO=true locally
    const csvContent = `UNDERLYING,SYMBOL
HDFC BANK,HDFCBANK`;
    
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(csvContent)
    });

    const result = await FnoUniverseCheckService.checkDrift();
    expect(result.ok).toBe(true);
    expect(result.data?.hasDrift).toBe(true);
    expect(result.data?.newlyIneligible).toContain('RELIANCE    ');
  });

  it('should flag brand-new NSE listing', async () => {
    // NEWCO is not in STOCK_UNIVERSE at all
    const csvContent = `UNDERLYING,SYMBOL
HDFC BANK,HDFCBANK
RELIANCE INDUSTRIES,RELIANCE
NEW COMPANY,NEWCO`;
    
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(csvContent)
    });

    const result = await FnoUniverseCheckService.checkDrift();
    expect(result.ok).toBe(true);
    expect(result.data?.hasDrift).toBe(true);
    expect(result.data?.symbolsOnlyInNse.some(s => s.trim() === 'NEWCO')).toBe(true);
  });

  it('should handle fetch failure gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503
    });

    const result = await FnoUniverseCheckService.checkDrift();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('503');
  });

  it('should handle case and padding insensitivity', async () => {
    // CSV has lowercase and spaces, local is padded uppercase
    const csvContent = `UNDERLYING,SYMBOL
HDFC BANK, hdfcbank 
RELIANCE INDUSTRIES, ReLiAnCe
NOT FNO, NONFNO`;
    
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(csvContent)
    });

    const result = await FnoUniverseCheckService.checkDrift();
    expect(result.ok).toBe(true);
    expect(result.data?.hasDrift).toBe(true);
    // NONFNO is locally isFnO=false, so it becomes newlyEligible
    expect(result.data?.newlyEligible.some(s => s.trim() === 'NONFNO')).toBe(true);
    // HDFCBANK and RELIANCE should match fine and not cause drift
    expect(result.data?.symbolsOnlyInNse.length).toBe(0);
    expect(result.data?.newlyIneligible.length).toBe(0);
  });
});
