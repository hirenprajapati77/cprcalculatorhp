export interface OHLC {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class HistoricalProvider {
  private static mode = process.env.HISTORICAL_MODE || 'cached'; // mock | cached | live

  static async getHistory(symbol: string, startDate: Date, endDate: Date): Promise<OHLC[]> {
    if (this.mode === 'mock') {
      return this.generateMockHistory(startDate, endDate);
    }
    
    // In 'cached' or 'live', we'd hit Yahoo Finance or our cache DB.
    // For Phase 5 implementation we provide the interface skeleton ready for the real connection.
    throw new Error('Not implemented for mode: ' + this.mode);
  }

  static async getOHLC(symbol: string, date: string): Promise<OHLC | null> {
    const history = await this.getHistory(symbol, new Date(date), new Date(date));
    return history.length > 0 ? history[0] : null;
  }

  static async getVolume(symbol: string, date: string): Promise<number> {
    const ohlc = await this.getOHLC(symbol, date);
    return ohlc ? ohlc.volume : 0;
  }

  private static generateMockHistory(start: Date, end: Date): OHLC[] {
    const data: OHLC[] = [];
    const current = new Date(start);
    let price = 1000;
    while (current <= end) {
      if (current.getDay() !== 0 && current.getDay() !== 6) { // Skip weekends
        const change = (Math.random() - 0.5) * 20;
        price = price + change;
        data.push({
          date: current.toISOString().split('T')[0],
          open: price - 5,
          high: price + 15,
          low: price - 15,
          close: price + 5,
          volume: Math.floor(Math.random() * 100000)
        });
      }
      current.setDate(current.getDate() + 1);
    }
    return data;
  }
}
