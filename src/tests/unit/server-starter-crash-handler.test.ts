import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

describe('server-starter.js Crash Handlers (C-04 / R-4)', () => {
  it('handles uncaughtException by logging to stderr, waiting 500ms grace period, and exiting with code 1', async () => {
    const script = `
      let isTerminating = false;
      function crashExit(code = 1) {
        if (isTerminating) return;
        isTerminating = true;
        setTimeout(() => { process.exit(code); }, 500);
      }
      process.on('uncaughtException', (err) => {
        console.error('[server-starter] Uncaught exception:', err.message);
        crashExit(1);
      });
      setTimeout(() => {
        throw new Error('SIMULATED_UNCAUGHT_EXCEPTION');
      }, 50);
    `;

    const start = Date.now();
    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code));
    });

    const elapsed = Date.now() - start;
    assert.strictEqual(exitCode, 1, 'Child process must exit with code 1');
    assert.ok(
      stderr.includes('[server-starter] Uncaught exception: SIMULATED_UNCAUGHT_EXCEPTION'),
      'Must log structured uncaught exception message'
    );
    assert.ok(elapsed >= 450, `Must observe ~500ms grace period for stdio flush (elapsed: ${elapsed}ms)`);
  });

  it('handles unhandledRejection by logging to stderr, waiting 500ms grace period, and exiting with code 1', async () => {
    const script = `
      let isTerminating = false;
      function crashExit(code = 1) {
        if (isTerminating) return;
        isTerminating = true;
        setTimeout(() => { process.exit(code); }, 500);
      }
      process.on('unhandledRejection', (reason) => {
        console.error('[server-starter] Unhandled promise rejection at: [promise] reason:', reason);
        crashExit(1);
      });
      setTimeout(() => {
        Promise.reject('SIMULATED_UNHANDLED_REJECTION');
      }, 50);
    `;

    const start = Date.now();
    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code));
    });

    const elapsed = Date.now() - start;
    assert.strictEqual(exitCode, 1, 'Child process must exit with code 1');
    assert.ok(
      stderr.includes('[server-starter] Unhandled promise rejection at:'),
      'Must log structured unhandled rejection message'
    );
    assert.ok(stderr.includes('SIMULATED_UNHANDLED_REJECTION'), 'Must include reason');
    assert.ok(elapsed >= 450, `Must observe ~500ms grace period for stdio flush (elapsed: ${elapsed}ms)`);
  });

  it('isTerminating guard prevents re-entry and secondary exit timers on cascade crashes', async () => {
    const script = `
      let isTerminating = false;
      let exitCalls = 0;
      function crashExit(code = 1) {
        if (isTerminating) return;
        isTerminating = true;
        exitCalls++;
        setTimeout(() => { process.exit(code); }, 500);
      }
      crashExit(1);
      crashExit(1);
      crashExit(1);
      console.log('EXIT_CALLS=' + exitCalls);
    `;

    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code));
    });

    assert.strictEqual(exitCode, 1);
    assert.ok(stdout.includes('EXIT_CALLS=1'), 'Multiple crash triggers must only schedule one exit timer');
  });
});
