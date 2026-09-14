import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('server-starter.js crash handling (D4-3)', () => {
  it('defines crashExit with 500ms grace period and re-entry guard', () => {
    const fileContent = fs.readFileSync(path.join(process.cwd(), 'server-starter.js'), 'utf8');

    assert.match(
      fileContent,
      /function crashExit\(/,
      'server-starter.js must define crashExit'
    );
    assert.match(
      fileContent,
      /setTimeout\(\(\)\s*=>\s*\{\s*process\.exit\(code\);\s*\},\s*500\);/,
      'crashExit must use a 500ms timeout before process.exit(code)'
    );
    assert.match(
      fileContent,
      /isTerminating/,
      'crashExit must include re-entrancy termination guard'
    );
    assert.match(
      fileContent,
      /process\.on\('uncaughtException',\s*\(err\)\s*=>\s*\{[\s\S]*?crashExit\(1\);/,
      'uncaughtException must invoke crashExit(1)'
    );
    assert.match(
      fileContent,
      /process\.on\('unhandledRejection',\s*\(reason,\s*promise\)\s*=>\s*\{[\s\S]*?crashExit\(1\);/,
      'unhandledRejection must invoke crashExit(1)'
    );
  });
});
