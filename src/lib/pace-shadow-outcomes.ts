/**
 * Pure helpers for comparing pace curve v1 (current) vs v2 (empirical) from "[PaceShadow] {json}" log lines.
 * See scripts/analysis/pace-shadow-outcomes.ts and docs/decisions/pace-volume-flag-off-2026-11-24.md.
 *
 * A "[PaceShadow]" line is only written when a version would ADD a signal that raw volume did not
 * (BREAKOUT, BREAKDOWN, ORB_LONG, ORB_SHORT). So every event here is a signal the live system did not take.
 */
export type ShadowDirection = 'LONG' | 'SHORT';
export type CurveVersion = 'v1' | 'v2';
export type Cohort = 'both' | 'v1_only' | 'v2_only';

export interface ShadowVersionEvent {
  symbol: string;
  date: string;
  direction: ShadowDirection;
  version: CurveVersion;
  minuteOfDay: number;
  ltp: number;
  tc: number;
  bc: number;
  raw: number;
  pace: number;
}

const LONG_SIGNALS = new Set(['BREAKOUT', 'ORB_LONG']);
const SHORT_SIGNALS = new Set(['BREAKDOWN', 'ORB_SHORT']);

export function directionOf(signal: string): ShadowDirection | null {
  if (LONG_SIGNALS.has(signal)) return 'LONG';
  if (SHORT_SIGNALS.has(signal)) return 'SHORT';
  return null;
}

type Rec = Record<string, unknown>;
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const strArr = (x: unknown): string[] | null =>
  Array.isArray(x) && x.every((v) => typeof v === 'string') ? (x as string[]) : null;

export interface ParseResult {
  events: ShadowVersionEvent[];
  /** Lines written before curve v2 existed (no gainedV2 key): cannot be assigned to a cohort. */
  legacyLines: number;
  badLines: number;
}

/** Keeps the EARLIEST event per symbol + date + direction + version. */
export function parsePaceShadowLines(text: string): ParseResult {
  const best = new Map<string, ShadowVersionEvent>();
  let legacyLines = 0;
  let badLines = 0;
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf('[PaceShadow] ');
    if (idx < 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line.slice(idx + '[PaceShadow] '.length));
    } catch {
      badLines++;
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      badLines++;
      continue;
    }
    const o = parsed as Rec;
    const gained = strArr(o.gained);
    const gainedV2 = strArr(o.gainedV2);
    const symbol = typeof o.symbol === 'string' ? o.symbol : null;
    const date = typeof o.date === 'string' ? o.date : null;
    const minuteOfDay = num(o.minuteOfDay);
    const ltp = num(o.ltp);
    const tc = num(o.tc);
    const bc = num(o.bc);
    const raw = num(o.raw);
    const pace = num(o.pace);
    const paceV2 = num(o.paceV2);
    if (!gained || !symbol || !date || minuteOfDay === null || ltp === null || ltp <= 0 || tc === null || bc === null) {
      badLines++;
      continue;
    }
    if (!gainedV2) {
      legacyLines++;
      continue;
    }
    const push = (signals: string[], version: CurveVersion, paceValue: number | null) => {
      for (const sig of signals) {
        const direction = directionOf(sig);
        if (!direction) continue;
        const key = `${symbol}|${date}|${direction}|${version}`;
        const prev = best.get(key);
        if (!prev || minuteOfDay < prev.minuteOfDay) {
          best.set(key, {
            symbol, date, direction, version, minuteOfDay, ltp, tc, bc,
            raw: raw ?? NaN,
            pace: paceValue ?? NaN,
          });
        }
      }
    };
    push(gained, 'v1', pace);
    push(gainedV2, 'v2', paceV2);
  }
  return { events: [...best.values()], legacyLines, badLines };
}

export interface ScoredShadowEvent extends ShadowVersionEvent {
  cohort: Cohort;
  /** Signed return from the event's ltp to the day's close, percent (positive = in the signal's favour). */
  retPct: number;
  /** True when the close finished back inside/against the breakout level (LONG: close <= tc; SHORT: close >= bc). */
  falseBreak: boolean;
}

/** Scores events against the day's official close and assigns each symbol-day-direction to a cohort. */
export function scoreShadowEvents(
  events: ShadowVersionEvent[],
  closeFor: (symbol: string, date: string) => number | undefined
): ScoredShadowEvent[] {
  const groups = new Map<string, { v1?: ShadowVersionEvent; v2?: ShadowVersionEvent }>();
  for (const e of events) {
    const k = `${e.symbol}|${e.date}|${e.direction}`;
    const g = groups.get(k) ?? {};
    g[e.version] = e;
    groups.set(k, g);
  }
  const out: ScoredShadowEvent[] = [];
  for (const g of groups.values()) {
    const cohort: Cohort = g.v1 && g.v2 ? 'both' : g.v1 ? 'v1_only' : 'v2_only';
    for (const e of [g.v1, g.v2]) {
      if (!e) continue;
      const close = closeFor(e.symbol, e.date);
      if (!(close !== undefined && close > 0)) continue;
      const sign = e.direction === 'LONG' ? 1 : -1;
      out.push({
        ...e,
        cohort,
        retPct: ((sign * (close - e.ltp)) / e.ltp) * 100,
        falseBreak: e.direction === 'LONG' ? close <= e.tc : close >= e.bc,
      });
    }
  }
  return out;
}

export interface CohortRow {
  cohort: Cohort;
  version: CurveVersion;
  n: number;
  meanRetPct: number | null;
  medianRetPct: number | null;
  winRate: number | null;
  falseBreakRate: number | null;
  meanMinute: number | null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Rows: both/v1, both/v2, v1_only/v1, v2_only/v2. */
export function summarizeCohorts(scored: ScoredShadowEvent[]): CohortRow[] {
  const spec: Array<[Cohort, CurveVersion]> = [
    ['both', 'v1'],
    ['both', 'v2'],
    ['v1_only', 'v1'],
    ['v2_only', 'v2'],
  ];
  return spec.map(([cohort, version]) => {
    const xs = scored.filter((e) => e.cohort === cohort && e.version === version);
    if (xs.length === 0) {
      return { cohort, version, n: 0, meanRetPct: null, medianRetPct: null, winRate: null, falseBreakRate: null, meanMinute: null };
    }
    const rets = xs.map((e) => e.retPct);
    return {
      cohort,
      version,
      n: xs.length,
      meanRetPct: rets.reduce((a, b) => a + b, 0) / rets.length,
      medianRetPct: median(rets),
      winRate: rets.filter((r) => r > 0).length / rets.length,
      falseBreakRate: xs.filter((e) => e.falseBreak).length / xs.length,
      meanMinute: xs.reduce((a, e) => a + e.minuteOfDay, 0) / xs.length,
    };
  });
}
