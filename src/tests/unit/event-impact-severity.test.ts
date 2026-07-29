import test from 'node:test';
import assert from 'node:assert/strict';
import { eventImpactSeverity } from '../../services/overnight/event.service';

test('eventImpactSeverity decays by calendar day', () => {
  assert.equal(eventImpactSeverity('HIGH', 0), 100);
  assert.equal(eventImpactSeverity('HIGH', 1), 90);
  assert.equal(eventImpactSeverity('HIGH', 2), 80);
  assert.equal(eventImpactSeverity('HIGH', 3), 70); // below option gate (80)
  assert.equal(eventImpactSeverity('MEDIUM', 0), 70);
  assert.equal(eventImpactSeverity('MEDIUM', 1), 60);
  assert.equal(eventImpactSeverity('LOW', 0), 30);
  assert.equal(eventImpactSeverity('HIGH', -1), 100); // clamp negative days
});
