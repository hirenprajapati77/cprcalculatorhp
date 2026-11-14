export interface ProviderMixMetrics {
  fyers: number;
  yahooAggregated: number;
  yahooSnapshot: number;
  total: number;
}

export interface SessionMonitorState {
  dateKey: string;
  fyersCooldowns: number;
  aggregationFailures: number;
  providerMixes: ProviderMixMetrics[];
  btstVolumeLogs: Array<{
    symbol: string;
    rawVolume: number;
    intradayVolume: number;
    resolvedVolume: number;
    avgVolume: number;
  }>;
}

export class VolumeShadowMonitorService {
  private static sessionMap = new Map<string, SessionMonitorState>();

  public static isFlagEnabled(): boolean {
    return process.env.ENABLE_VOLUME_SHADOW_LOGGING === 'true';
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
    }
    return state;
  }

  public static recordFyersCooldown(dateKey?: string): number {
    const key = dateKey || new Date().toISOString().slice(0, 10);
    const state = this.getOrCreateState(key);
    state.fyersCooldowns++;
    if (this.isFlagEnabled()) {
      console.log(`[ShadowMonitor] Fyers cooldown activation #${state.fyersCooldowns} on ${key}`);
    }
    return state.fyersCooldowns;
  }

  public static recordAggregationFailure(symbol: string, dateKey?: string): number {
    const key = dateKey || new Date().toISOString().slice(0, 10);
    const state = this.getOrCreateState(key);
    state.aggregationFailures++;
    if (this.isFlagEnabled()) {
      console.log(`[ShadowMonitor] 15m aggregation skipped/failed for ${symbol} (total failures on ${key}: ${state.aggregationFailures})`);
    }
    return state.aggregationFailures;
  }

  public static recordProviderMix(dateKey: string, mix: ProviderMixMetrics): void {
    const state = this.getOrCreateState(dateKey);
    state.providerMixes.push(mix);
    if (this.isFlagEnabled()) {
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
    dateKey?: string
  ): void {
    const key = dateKey || new Date().toISOString().slice(0, 10);
    const state = this.getOrCreateState(key);
    state.btstVolumeLogs.push({
      symbol,
      rawVolume,
      intradayVolume,
      resolvedVolume,
      avgVolume,
    });
    if (this.isFlagEnabled()) {
      console.log(
        `[ShadowMonitor:BtstVolume] ${symbol} rawVolume=${rawVolume} intradayVolume=${intradayVolume} resolvedVolume=${resolvedVolume} avgVolume=${avgVolume}`
      );
    }
  }

  public static getSessionMetrics(dateKey: string): SessionMonitorState | null {
    return this.sessionMap.get(dateKey) || null;
  }

  public static resetStateForTesting(): void {
    this.sessionMap.clear();
  }
}
