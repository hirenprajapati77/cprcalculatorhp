import test from 'node:test';
import assert from 'node:assert/strict';
import {
  directionOf,
  parsePaceShadowLines,
  scoreShadowEvents,
  summarizeCohorts,
} from '@/lib/pace-shadow-outcomes';

const line = (o: Record<string, unknown>) =>
  `0|cpr | 2026-11-27 [PaceShadow] ${JSON.stringify({
    symbol: 'AAA',
    date: '2026-11-27',
    minuteOfDay: 575,
    gained: [],
    gainedV2: [],
    raw: 0.2,
    pace: 3,
    paceV2: 1.6,
    ltp: 102,
    tc: 101,
    bc: 100,
    ...o,
  })}`;

test('directionOf maps signals to direction', () => {
  assert.equal(directionOf('BREAKOUT'), 'LONG');
  assert.equal(directionOf('ORB_LONG'), 'LONG');
  assert.equal(directionOf('BREAKDOWN'), 'SHORT');
  assert.equal(directionOf('ORB_SHORT'), 'SHORT');
  assert.equal(directionOf('MOMENTUM'), null);
});

test('parsePaceShadowLines: earliest event per version, legacy and malformed lines counted, not scored', () => {
  const text = [
    'noise',
    line({ gained: ['BREAKOUT'], gainedV2: [], minuteOfDay: 590 }),
    line({ gained: ['BREAKOUT'], gainedV2: ['BREAKOUT'], minuteOfDay: 580 }),
    line({ gained: ['BREAKOUT'], gainedV2: ['BREAKOUT'], minuteOfDay: 700 }),
    `[PaceShadow] ${JSON.stringify({ symbol: 'OLD', date: '2026-11-26', minuteOfDay: 760, gained: ['BREAKOUT'], ltp: 10, tc: 9, bc: 8 })}`,
    '[PaceShadow] {broken',
  ].join('\n');
  const r = parsePaceShadowLines(text);
  assert.equal(r.legacyLines, 1);
  assert.equal(r.badLines, 1);
  const v1 = r.events.find((e) => e.version === 'v1');
  const v2 = r.events.find((e) => e.version === 'v2');
  assert.equal(v1?.minuteOfDay, 580, 'earliest v1 wins');
  assert.equal(v2?.minuteOfDay, 580);
  assert.equal(r.events.length, 2);
});

test('cohorts: both / v1_only / v2_only, scored against the close with sign and false-break rule', () => {
  const text = [
    line({ symbol: 'BOTH', gained: ['BREAKOUT'], gainedV2: ['BREAKOUT'], ltp: 102, tc: 101, bc: 100 }),
    line({ symbol: 'V1ONLY', gained: ['BREAKOUT'], gainedV2: [], ltp: 102, tc: 101, bc: 100 }),
    line({ symbol: 'V2ONLY', gained: [], gainedV2: ['BREAKDOWN'], ltp: 99, tc: 101, bc: 100, minuteOfDay: 800 }),
  ].join('\n');
  const { events } = parsePaceShadowLines(text);
  const closes: Record<string, number> = { BOTH: 104, V1ONLY: 100.5, V2ONLY: 98 };
  const scored = scoreShadowEvents(events, (s) => closes[s]);

  const byKey = (s: string, v: string) => scored.find((e) => e.symbol === s && e.version === v)!;
  assert.equal(byKey('BOTH', 'v1').cohort, 'both');
  assert.equal(byKey('BOTH', 'v2').cohort, 'both');
  assert.equal(byKey('V1ONLY', 'v1').cohort, 'v1_only');
  assert.equal(byKey('V2ONLY', 'v2').cohort, 'v2_only');

  assert.ok(byKey('BOTH', 'v1').retPct > 0);
  assert.equal(byKey('BOTH', 'v1').falseBreak, false); // close 104 > tc 101
  assert.ok(byKey('V1ONLY', 'v1').retPct < 0);
  assert.equal(byKey('V1ONLY', 'v1').falseBreak, true); // close 100.5 <= tc 101
  assert.ok(byKey('V2ONLY', 'v2').retPct > 0, 'short gains when close falls');
  assert.equal(byKey('V2ONLY', 'v2').falseBreak, false); // close 98 < bc 100

  const rows = summarizeCohorts(scored);
  const v1only = rows.find((r) => r.cohort === 'v1_only')!;
  assert.equal(v1only.n, 1);
  assert.equal(v1only.winRate, 0);
  assert.equal(v1only.falseBreakRate, 1);
  assert.equal(rows.find((r) => r.cohort === 'both' && r.version === 'v1')!.n, 1);
});

test('scoreShadowEvents skips events with no close yet; empty cohorts summarize to nulls', () => {
  const { events } = parsePaceShadowLines(line({ symbol: 'NOCLOSE', gained: ['BREAKOUT'], gainedV2: [] }));
  const scored = scoreShadowEvents(events, () => undefined);
  assert.equal(scored.length, 0);
  const rows = summarizeCohorts(scored);
  assert.ok(rows.every((r) => r.n === 0 && r.meanRetPct === null && r.winRate === null));
});
