import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orbBucket,
  parseOrbEventLines,
  scoreOrbEvent,
  summarizeByBucket,
  type OrbEvent,
} from '@/lib/orb-outcomes';

const ev = (over: Partial<OrbEvent> = {}): OrbEvent => ({
  symbol: 'AAA',
  date: '2026-11-26',
  minuteOfDay: 580,
  direction: 'LONG',
  ltp: 102,
  orHigh: 101.5,
  orLow: 99.5,
  orMidpoint: 100.5,
  raw: 1.6,
  volumeRatio: 1.6,
  windowOpen: true,
  ...over,
});

test('orbBucket boundaries', () => {
  assert.equal(orbBucket(599), '<10:00');
  assert.equal(orbBucket(600), '10:00-10:30');
  assert.equal(orbBucket(629), '10:00-10:30');
  assert.equal(orbBucket(630), '10:30-11:30');
  assert.equal(orbBucket(689), '10:30-11:30');
  assert.equal(orbBucket(690), '>=11:30');
});

test('parseOrbEventLines keeps the first event per symbol/date/direction and ignores junk', () => {
  const lines = [
    'noise line',
    `0|cpr | 2026-11-26 [OrbEvent] ${JSON.stringify(ev({ minuteOfDay: 700 }))}`,
    `[OrbEvent] ${JSON.stringify(ev({ minuteOfDay: 580 }))}`,
    `[OrbEvent] ${JSON.stringify(ev({ direction: 'SHORT', minuteOfDay: 640 }))}`,
    '[OrbEvent] {not json',
    `[OrbEvent] ${JSON.stringify({ symbol: 'X' })}`,
  ].join('\n');
  const out = parseOrbEventLines(lines);
  assert.equal(out.length, 2);
  const long = out.find((e) => e.direction === 'LONG');
  assert.equal(long?.minuteOfDay, 580, 'earliest wins');
});

test('scoreOrbEvent signs by direction and computes R from OR midpoint risk', () => {
  const l = scoreOrbEvent(ev({ direction: 'LONG', ltp: 102, orMidpoint: 100 }), 104)!;
  assert.ok(Math.abs(l.retPct - (2 / 102) * 100) < 1e-9);
  assert.equal(l.r, 1); // move 2 / risk 2
  const s = scoreOrbEvent(ev({ direction: 'SHORT', ltp: 98, orMidpoint: 100 }), 99)!;
  assert.ok(s.retPct < 0, 'short loses when close is above entry');
  assert.equal(s.r, -0.5);
  assert.equal(scoreOrbEvent(ev(), 0), null);
  assert.equal(scoreOrbEvent(ev({ ltp: 100, orMidpoint: 100 }), 101)!.r, null, 'zero risk -> null R');
});

test('summarizeByBucket aggregates per bucket and reports empty buckets as null', () => {
  const scored = [
    scoreOrbEvent(ev({ minuteOfDay: 580 }), 104)!, // +
    scoreOrbEvent(ev({ minuteOfDay: 585, symbol: 'B' }), 100)!, // -
    scoreOrbEvent(ev({ minuteOfDay: 720, symbol: 'C' }), 103)!, // +
  ];
  const out = summarizeByBucket(scored);
  const early = out.find((b) => b.bucket === '<10:00')!;
  assert.equal(early.n, 2);
  assert.equal(early.winRate, 0.5);
  assert.equal(out.find((b) => b.bucket === '10:00-10:30')!.n, 0);
  assert.equal(out.find((b) => b.bucket === '10:00-10:30')!.meanRetPct, null);
  assert.equal(out.find((b) => b.bucket === '>=11:30')!.n, 1);
});
