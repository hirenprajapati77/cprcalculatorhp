/**
 * Pure helpers for the ORB time-of-day outcome analysis (see scripts/analysis/orb-outcomes.ts).
 * Events come from "[OrbEvent] {json}" log lines emitted by SignalService.
 */
export type OrbDirection = 'LONG' | 'SHORT';

export interface OrbEvent {
  symbol: string;
  date: string; // YYYY-MM-DD (IST)
  minuteOfDay: number;
  direction: OrbDirection;
  ltp: number;
  orHigh: number;
  orLow: number;
  orMidpoint: number;
  raw: number;
  volumeRatio: number;
  windowOpen: boolean;
}

export const ORB_BUCKETS = ['<10:00', '10:00-10:30', '10:30-11:30', '>=11:30'] as const;
export type OrbBucket = (typeof ORB_BUCKETS)[number];

export function orbBucket(minuteOfDay: number): OrbBucket {
  if (minuteOfDay < 600) return '<10:00';
  if (minuteOfDay < 630) return '10:00-10:30';
  if (minuteOfDay < 690) return '10:30-11:30';
  return '>=11:30';
}

function isOrbEvent(x: unknown): x is OrbEvent {
  const r = x as Record<string, unknown> | null | undefined;
  return Boolean(
    r &&
    typeof r.symbol === 'string' &&
    typeof r.date === 'string' &&
    typeof r.minuteOfDay === 'number' &&
    Number.isFinite(r.minuteOfDay) &&
    (r.direction === 'LONG' || r.direction === 'SHORT') &&
    typeof r.ltp === 'number' &&
    Number.isFinite(r.ltp) &&
    r.ltp > 0 &&
    typeof r.orHigh === 'number' &&
    Number.isFinite(r.orHigh) &&
    typeof r.orLow === 'number' &&
    Number.isFinite(r.orLow) &&
    typeof r.orMidpoint === 'number' &&
    Number.isFinite(r.orMidpoint)
  );
}

/** Parses log text; keeps the FIRST event per symbol+date+direction (earliest minute wins). */
export function parseOrbEventLines(text: string): OrbEvent[] {
  const best = new Map<string, OrbEvent>();
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf('[OrbEvent] ');
    if (idx < 0) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line.slice(idx + '[OrbEvent] '.length));
    } catch {
      continue;
    }
    if (!isOrbEvent(obj)) continue;
    const key = `${obj.symbol}|${obj.date}|${obj.direction}`;
    const prev = best.get(key);
    if (!prev || obj.minuteOfDay < prev.minuteOfDay) best.set(key, { ...obj, windowOpen: Boolean(obj.windowOpen) });
  }
  return [...best.values()];
}

export interface ScoredOrbEvent extends OrbEvent {
  bucket: OrbBucket;
  /** Signed return from ltp to the day's close, in percent (positive = in the signal's favour). */
  retPct: number;
  /** Signed move in units of risk (|ltp - OR midpoint|); null when risk is zero. */
  r: number | null;
}

/**
 * Scores an event against the day's official close. NOTE: this is close-to-trigger follow-through,
 * not a stop/target simulation (intraday path is not available from daily bars).
 */
export function scoreOrbEvent(e: OrbEvent, close: number): ScoredOrbEvent | null {
  if (!(close > 0)) return null;
  const sign = e.direction === 'LONG' ? 1 : -1;
  const move = sign * (close - e.ltp);
  const risk = Math.abs(e.ltp - e.orMidpoint);
  return {
    ...e,
    bucket: orbBucket(e.minuteOfDay),
    retPct: (move / e.ltp) * 100,
    r: risk > 0 ? move / risk : null,
  };
}

export interface BucketSummary {
  bucket: OrbBucket;
  n: number;
  meanRetPct: number | null;
  medianRetPct: number | null;
  winRate: number | null;
  meanR: number | null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function summarizeByBucket(events: ScoredOrbEvent[]): BucketSummary[] {
  return ORB_BUCKETS.map((bucket) => {
    const xs = events.filter((e) => e.bucket === bucket);
    if (xs.length === 0) {
      return { bucket, n: 0, meanRetPct: null, medianRetPct: null, winRate: null, meanR: null };
    }
    const rets = xs.map((e) => e.retPct);
    const rs = xs.map((e) => e.r).filter((r): r is number => r !== null);
    return {
      bucket,
      n: xs.length,
      meanRetPct: rets.reduce((a, b) => a + b, 0) / rets.length,
      medianRetPct: median(rets),
      winRate: rets.filter((r) => r > 0).length / rets.length,
      meanR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    };
  });
}
