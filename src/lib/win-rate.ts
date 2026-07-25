export interface WinRateSummary {
  wins: number;
  losses: number;
  breakeven: number;
  decisive: number;
  winRate: number;
}

export function computeWinRate<T>(
  trades: T[],
  getPnl: (trade: T) => number | null | undefined
): WinRateSummary {
  let wins = 0;
  let losses = 0;
  let breakeven = 0;

  for (const trade of trades) {
    const pnl = getPnl(trade) ?? 0;
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
    else breakeven++;
  }

  const decisive = wins + losses;
  const winRate = decisive > 0 ? (wins / decisive) * 100 : 0;

  return { wins, losses, breakeven, decisive, winRate };
}
