import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCronSecretExemptApiPath } from '../../lib/api-auth-exemptions';

describe('cron-secret API exemptions (P1-3)', () => {
  it('exempts /api/cron/* and refresh routes used by the runbook', () => {
    assert.equal(isCronSecretExemptApiPath('/api/cron/btst-journal'), true);
    assert.equal(isCronSecretExemptApiPath('/api/cron/btst-alert'), true);
    assert.equal(isCronSecretExemptApiPath('/api/btst/refresh'), true);
    assert.equal(isCronSecretExemptApiPath('/api/overnight/refresh'), true);
  });

  it('does not exempt normal BTST/overnight GETs (still need APP_ACCESS_TOKEN)', () => {
    assert.equal(isCronSecretExemptApiPath('/api/btst'), false);
    assert.equal(isCronSecretExemptApiPath('/api/overnight'), false);
    assert.equal(isCronSecretExemptApiPath('/api/journal'), false);
  });
});
