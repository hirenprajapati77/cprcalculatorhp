import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Require the CJS module under test
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs, rotateSecrets } = require('../../../scripts/rotate_secrets.js');

test('rotate_secrets — parseArgs argument parsing', async (t) => {
  await t.test('defaults to CRON_SECRET rotation when no flags given', () => {
    const flags = parseArgs([]);
    assert.equal(flags.rotateCron, true);
    assert.equal(flags.rotateTokenEncryptionKey, false);
    assert.equal(flags.understandDataLoss, false);
    assert.equal(flags.envPath, '.env');
  });

  await t.test('parses --token-encryption-key and --i-understand-data-loss', () => {
    const flags = parseArgs(['--token-encryption-key', '--i-understand-data-loss', '--env-file=.env.test']);
    assert.equal(flags.rotateTokenEncryptionKey, true);
    assert.equal(flags.understandDataLoss, true);
    assert.equal(flags.rotateCron, false);
    assert.equal(flags.envPath, '.env.test');
  });
});

test('rotate_secrets — safety guards & refusal behaviors', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotate-secrets-test-'));
  const testEnv = path.join(tmpDir, '.env.test');

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('throws when target env file does not exist', () => {
    assert.throws(
      () => rotateSecrets({ envPath: path.join(tmpDir, '.env.nonexistent') }),
      /Target environment file not found/
    );
  });

  await t.test('refuses to rotate TOKEN_ENCRYPTION_KEY without --i-understand-data-loss', () => {
    fs.writeFileSync(testEnv, 'TOKEN_ENCRYPTION_KEY="old_token_key"\nCRON_SECRET="old_cron"\n', 'utf8');

    assert.throws(
      () =>
        rotateSecrets({
          envPath: testEnv,
          rotateTokenEncryptionKey: true,
          understandDataLoss: false,
        }),
      /REFUSED: Rotating TOKEN_ENCRYPTION_KEY will permanently orphan all encrypted broker credentials/
    );

    // Verify file was NOT modified
    const content = fs.readFileSync(testEnv, 'utf8');
    assert.ok(content.includes('old_token_key'));
  });

  await t.test('fails with error if target key is missing in .env (no false "Rotated" report)', () => {
    fs.writeFileSync(testEnv, 'APP_ACCESS_TOKEN="operator_token"\nOTHER_VAR="123"\n', 'utf8');

    assert.throws(
      () =>
        rotateSecrets({
          envPath: testEnv,
          rotateCron: true,
        }),
      /No target keys were found or updated/
    );
  });
});

test('rotate_secrets — successful rotation and format support', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotate-secrets-success-'));
  const testEnv = path.join(tmpDir, '.env.test');

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('rotates CRON_SECRET supporting both quoted and unquoted lines, never touching APP_ACCESS_TOKEN', () => {
    const initialContent = [
      'APP_ACCESS_TOKEN="never-rotate-operator-token"',
      'CRON_SECRET=unquoted_old_secret',
      'OTHER_KEY="preserve_me"',
    ].join('\n');

    fs.writeFileSync(testEnv, initialContent, 'utf8');

    const result = rotateSecrets({
      envPath: testEnv,
      rotateCron: true,
    });

    assert.deepEqual(result.rotatedKeys, ['CRON_SECRET']);

    const updated = fs.readFileSync(testEnv, 'utf8');
    // APP_ACCESS_TOKEN is untouched
    assert.ok(updated.includes('APP_ACCESS_TOKEN="never-rotate-operator-token"'));
    assert.ok(updated.includes('OTHER_KEY="preserve_me"'));
    // CRON_SECRET was updated and is quoted
    assert.ok(!updated.includes('unquoted_old_secret'));
    const match = updated.match(/CRON_SECRET="([a-f0-9]{32})"/);
    assert.ok(match, 'CRON_SECRET must be updated to a 32-hex-character string');
  });

  await t.test('rotates TOKEN_ENCRYPTION_KEY when explicit data-loss acknowledgement is passed', () => {
    const initialContent = [
      'TOKEN_ENCRYPTION_KEY="old_64_char_key_value"',
      'CRON_SECRET="cron_value"',
    ].join('\n');

    fs.writeFileSync(testEnv, initialContent, 'utf8');

    const result = rotateSecrets({
      envPath: testEnv,
      rotateTokenEncryptionKey: true,
      understandDataLoss: true,
    });

    assert.deepEqual(result.rotatedKeys, ['TOKEN_ENCRYPTION_KEY']);

    const updated = fs.readFileSync(testEnv, 'utf8');
    assert.ok(!updated.includes('old_64_char_key_value'));
    // 32 random bytes in hex = 64 hex chars
    const match = updated.match(/TOKEN_ENCRYPTION_KEY="([a-f0-9]{64})"/);
    assert.ok(match, 'TOKEN_ENCRYPTION_KEY must be updated to a 64-hex-character string');
    // CRON_SECRET untouched because rotateCron wasn't set
    assert.ok(updated.includes('CRON_SECRET="cron_value"'));
  });
});
