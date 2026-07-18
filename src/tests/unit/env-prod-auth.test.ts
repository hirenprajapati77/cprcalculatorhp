import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Verifies production fail-fast for APP_ACCESS_TOKEN without mutating the
 * process env of the main test runner (env.ts is cached on first import).
 */
describe('APP_ACCESS_TOKEN production guard', () => {
  it('throws when NODE_ENV=production and token is missing (runtime)', () => {
    const script = `
      process.env.NODE_ENV = 'production';
      delete process.env.APP_ACCESS_TOKEN;
      delete process.env.NEXT_PHASE;
      try {
        await import(${JSON.stringify(path.resolve('src/config/env.ts'))});
        console.log('UNEXPECTED_SUCCESS');
        process.exit(2);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('APP_ACCESS_TOKEN is required')) {
          console.log('OK_THROW');
          process.exit(0);
        }
        console.error(msg);
        process.exit(1);
      }
    `;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_ACCESS_TOKEN: '',
        NEXT_PHASE: '',
      },
    });
    assert.ok(
      (result.stdout || '').includes('OK_THROW'),
      `expected throw, got stdout=${result.stdout} stderr=${result.stderr} code=${result.status}`
    );
  });

  it('allows next production build phase without token', () => {
    const script = `
      process.env.NODE_ENV = 'production';
      process.env.NEXT_PHASE = 'phase-production-build';
      delete process.env.APP_ACCESS_TOKEN;
      await import(${JSON.stringify(path.resolve('src/config/env.ts'))});
      console.log('OK_BUILD');
    `;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_ACCESS_TOKEN: '',
        NEXT_PHASE: 'phase-production-build',
      },
    });
    assert.ok(
      (result.stdout || '').includes('OK_BUILD'),
      `expected build allow, got stdout=${result.stdout} stderr=${result.stderr} code=${result.status}`
    );
  });
});
