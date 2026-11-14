export interface ProviderMixMetrics {
  fyers: number;
  yahooAggregated: number;
  yahooSnapshot: number;
  total: number;
}

export interface VolumeShadowEntry {
  direction?: 'BTST' | 'STBT';
  symbol: string;
  rawVolume: number;
  intradayVolume: number;
  resolvedVolume: number;
  avgVolume: number;
}

export interface SessionMonitorState {
  dateKey: string;
  fyersCooldowns: number;
  aggregationFailures: number;
  providerMixes: ProviderMixMetrics[];
  btstVolumeLogs: VolumeShadowEntry[];
}

export class VolumeShadowMonitorService {
  private static sessionMap = new Map<string, SessionMonitorState>();
  private static warnedKeys = new Set<string>();

  public static readonly MAX_ENTRIES_PER_RING = 5000;
  public static readonly MAX_RETAINED_DAYS = 3;

  public static isFlagEnabled(): boolean {
    return process.env.ENABLE_VOLUME_SHADOW_LOGGING === 'true';
  }

  public static pruneOldSessions(): void {
    if (this.sessionMap.size <= this.MAX_RETAINED_DAYS) return;
    const sortedKeys = Array.from(this.sessionMap.keys()).sort();
    while (sortedKeys.length > this.MAX_RETAINED_DAYS) {
      const oldest = sortedKeys.shift();
      if (oldest) this.sessionMap.delete(oldest);
    }
  }

  private static getOrCreateState(dateKey: string): SessionMonitorState {
    let state = this.sessionMap.get(dateKey);
    if (!state) {
      state = {
        dateKey,
        fyersCooldowns: 0,
        aggregationFailures: 0,
        providerMixes: [],
        btstVolumeLogs: [],
      };
      this.sessionMap.set(dateKey, state);
      this.pruneOldSessions();
    }
    return state;
  }

  public static recordFyersCooldown(dateKey?: string): number {
    if (!this.isFlagEnabled()) return 0;
    const key = dateKey || new Date().toISOString().slice(0, 10);
    const state = this.getOrCreateState(key);
    state.fyersCooldowns++;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[ShadowMonitor] Fyers cooldown activation #${state.fyersCooldowns} on ${key}`);
    }
    return state.fyersCooldowns;
  }

  public static recordAggregationFailure(symbol: string, dateKey?: string): number {
    if (!this.isFlagEnabled()) return 0;
    const key = dateKey || new Date().toISOString().slice(0, 10);
    const state = this.getOrCreateState(key);
    state.aggregationFailures++;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[ShadowMonitor] 15m aggregation skipped/failed for ${symbol} (total failures on ${key}: ${state.aggregationFailures})`);
    }
    return state.aggregationFailures;
  }

  public static recordProviderMix(dateKey: string, mix: ProviderMixMetrics): void {
    if (!this.isFlagEnabled()) return;
    const state = this.getOrCreateState(dateKey);
    if (state.providerMixes.length >= 100) {
      state.providerMixes.shift();
    }
    state.providerMixes.push(mix);
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[ShadowMonitor:ProviderMix] ${dateKey}: Fyers=${mix.fyers}, YahooAggregated=${mix.yahooAggregated}, YahooSnapshot=${mix.yahooSnapshot}, Total=${mix.total}`
      );
    }
  }

  public static recordBtstVolumeShadow(
    symbol: string,
    rawVolume: number,
    intradayVolume: number,
    resolvedVolume: number,
    avgVolume: number,
    dateKey?: string,
    direction: 'BTST' | 'STBT' = 'BTST'
  ): void {
    if (!this.isFlagEnabled()) return;
    const key = dateKey || new Date().toISOString().slice(0, 10);
    const state = this.getOrCreateState(key);
    if (state.btstVolumeLogs.length >= this.MAX_ENTRIES_PER_RING) {
      state.btstVolumeLogs.shift();
    }
    state.btstVolumeLogs.push({
      direction,
      symbol,
      rawVolume,
      intradayVolume,
      resolvedVolume,
      avgVolume,
    });
    if (this.isFlagEnabled() && process.env.NODE_ENV !== 'test') {
      console.log(
        `[ShadowMonitor:${direction}Volume] ${symbol} rawVolume=${rawVolume} intradayVolume=${intradayVolume} resolvedVolume=${resolvedVolume} avgVolume=${avgVolume}`
      );
    }
  }

  public static warnOnce(warningKey: string, message: string): void {
    if (this.warnedKeys.has(warningKey)) return;
    this.warnedKeys.add(warningKey);
    console.warn(`[ShadowMonitor] ${message}`);
  }

  public static getSessionMetrics(dateKey: string): SessionMonitorState | null {
    return this.sessionMap.get(dateKey) || null;
  }

  public static resetStateForTesting(): void {
    this.sessionMap.clear();
    this.warnedKeys.clear();
  }
}
