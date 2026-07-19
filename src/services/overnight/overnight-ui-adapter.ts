/**
 * Phase H adapter: map Advanced Engine (OvernightSignal) into the BTST UI / Telegram DTO
 * so ScannerClient and alerts share the same source of truth as the Trade Journal.
 */
import type { OvernightSignal } from '@prisma/client';
import type { BtstScoreResultEnriched } from '@/services/backtest/btst.service';
import { MarketService } from '@/services/market.service';

const LONG_READY = ['STRONG_BTST', 'BTST_READY'];
const SHORT_READY = ['STRONG_STBT', 'STBT_READY'];

export type OvernightUiResult = BtstScoreResultEnriched & {
  classification: string;
  qualityBucket: string | null;
  overnightScore: number;
  engine: 'advanced';
};

function mapDirectionToTag(
  direction: string,
  classification: string
): OvernightUiResult['tag'] {
  if (classification === 'NEUTRAL_CONFLICT' || direction === 'NEUTRAL_CONFLICT') {
    return 'NEUTRAL_CONFLICT';
  }
  if (direction === 'LONG') return 'LONG';
  if (direction === 'SHORT') return 'SHORT';
  return 'WEAK';
}

function computeRr(entry: number, sl: number, target: number): string {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(target - entry);
  if (risk <= 0) return '0.00';
  return (reward / risk).toFixed(2);
}

/** Map a persisted OvernightSignal into the legacy BTST UI shape. */
export function overnightSignalToBtstUi(
  signal: OvernightSignal & {
    scoreBreakdown?: BtstScoreResultEnriched['scoreBreakdown'];
  }
): OvernightUiResult {
  const score = signal.overnightScore ?? 0;
  const entry = signal.entry ?? 0;
  const sl = signal.stopLoss ?? 0;
  const target = signal.target ?? 0;
  const tag = mapDirectionToTag(signal.direction, signal.classification);
  const signals = [signal.classification, signal.qualityBucket].filter(
    (v): v is string => !!v
  );

  return {
    symbol: signal.symbol,
    ltp: entry,
    longScore: tag === 'LONG' ? score : 0,
    shortScore: tag === 'SHORT' ? score : 0,
    tag,
    signals,
    entry,
    sl,
    target,
    rr: computeRr(entry, sl, target),
    sector: '',
    marketCap: 0,
    expectedGap: signal.expectedGap ?? 0,
    expectedMove: signal.expectedMove ?? 0,
    gapConfidence: signal.confidence ?? 0,
    exitStrategy: signal.exitStrategy || 'EOD',
    classification: signal.classification,
    qualityBucket: signal.qualityBucket ?? null,
    overnightScore: score,
    engine: 'advanced',
    ...(signal.scoreBreakdown ? { scoreBreakdown: signal.scoreBreakdown } : {}),
  };
}

export function buildInsightsFromOvernight(signals: OvernightSignal[]) {
  let strongSignal = 0;
  let breakoutReady = 0;
  let avoid = 0;
  let totalLong = 0;
  let totalShort = 0;
  let totalConflict = 0;

  for (const sig of signals) {
    const maxScore = sig.overnightScore || 0;
    if (sig.classification === 'NEUTRAL_CONFLICT') {
      totalConflict++;
      avoid++;
      continue;
    }
    if (sig.classification === 'IGNORE') {
      avoid++;
      continue;
    }
    if (LONG_READY.includes(sig.classification) || SHORT_READY.includes(sig.classification)) {
      if (maxScore >= 100 || sig.classification.startsWith('STRONG_')) {
        strongSignal++;
      } else {
        breakoutReady++;
      }
    } else if (maxScore < 40) {
      avoid++;
    }
    if (sig.direction === 'LONG') totalLong++;
    if (sig.direction === 'SHORT') totalShort++;
  }

  return { strongSignal, breakoutReady, avoid, totalLong, totalShort, totalConflict };
}

/** Filter Advanced NSE_FNO signals down to a requested UI universe. */
export function filterOvernightByUniverse(
  signals: OvernightSignal[],
  universe: string
): OvernightSignal[] {
  if (!universe || universe === 'NSE_FNO' || universe === 'NIFTY_FNO' || universe === 'ALL') {
    return signals;
  }
  const allowed = new Set(
    MarketService.getUniverse(universe as Parameters<typeof MarketService.getUniverse>[0]).map(
      (s) => s.symbol.trim()
    )
  );
  return signals.filter((s) => allowed.has(s.symbol.trim()));
}

/**
 * Keep the highest-scoring row per symbol (input must already be score-desc).
 * OvernightSignal is unique on [symbol, signalDate, signalTime], so rescans can
 * return the same name twice and steal both top-N journal/alert slots.
 */
export function distinctHighestScoreBySymbol<T extends { symbol: string }>(
  signals: T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of signals) {
    const key = s.symbol.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Journal-aligned alert picks: TRADEABLE + READY+ + score floor. */
export function selectTradableOvernightPicks(
  signals: OvernightSignal[],
  opts: { minScore?: number; take?: number; suppressShort?: boolean } = {}
) {
  const minScore = opts.minScore ?? 85;
  const take = opts.take ?? 5;
  const longs = distinctHighestScoreBySymbol(
    signals
      .filter(
        (s) =>
          s.direction === 'LONG' &&
          s.qualityBucket === 'TRADEABLE' &&
          LONG_READY.includes(s.classification) &&
          (s.overnightScore ?? 0) >= minScore
      )
      .sort((a, b) => (b.overnightScore ?? 0) - (a.overnightScore ?? 0))
  ).slice(0, take);

  const shorts = opts.suppressShort
    ? []
    : distinctHighestScoreBySymbol(
        signals
          .filter(
            (s) =>
              s.direction === 'SHORT' &&
              s.qualityBucket === 'TRADEABLE' &&
              SHORT_READY.includes(s.classification) &&
              (s.overnightScore ?? 0) >= minScore
          )
          .sort((a, b) => (b.overnightScore ?? 0) - (a.overnightScore ?? 0))
      ).slice(0, take);

  return { longs, shorts };
}
