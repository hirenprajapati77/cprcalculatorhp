import { spawn, ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

export const TEST_ACCESS_TOKEN = 'test-token-123';

export async function getTestTokenHash(): Promise<string> {
  return crypto.createHash('sha256').update(TEST_ACCESS_TOKEN).digest('hex');
}

export interface E2ETestServer {
  port: number;
  baseUrl: string;
  stop: () => Promise<void>;
}

/**
 * Starts a real Next.js HTTP server instance on an OS-assigned ephemeral port (0).
 * Completely isolated in a child process, with guaranteed cleanup.
 */
export async function startE2EServer(): Promise<E2ETestServer> {
  const projectDir = path.resolve(__dirname, '../../../');

  const serverRunnerScript = `
    const next = require('next');
    const http = require('http');
    const fs = require('fs');
    const path = require('path');

    const isBuilt = fs.existsSync(path.join(process.cwd(), '.next', 'BUILD_ID'));
    const dev = process.env.NEXT_E2E_DEV !== undefined ? process.env.NEXT_E2E_DEV === 'true' : !isBuilt;

    const app = next({ dev, dir: process.cwd(), hostname: '127.0.0.1', port: 0 });
    const handle = app.getRequestHandler();

    app.prepare().then(() => {
      const server = http.createServer((req, res) => handle(req, res));
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        console.log('[E2E-SERVER-READY]:' + port);
      });

      const shutdown = () => {
        server.close(() => {
          app.close().then(() => process.exit(0)).catch(() => process.exit(0));
        });
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    }).catch(err => {
      console.error(err);
      process.exit(1);
    });
  `;

  const child: ChildProcess = spawn(
    process.execPath,
    ['--import', './scripts/set-test-env.mjs', '-e', serverRunnerScript],
    {
      cwd: projectDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        APP_ACCESS_TOKEN: TEST_ACCESS_TOKEN,
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        PORT: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  // Auto-terminate child process if test process exits unexpectedly
  const onProcessExit = () => {
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
  };
  process.on('exit', onProcessExit);

  let readyResolve: (port: number) => void;
  let readyReject: (err: Error) => void;
  const readyPromise = new Promise<number>((res, rej) => {
    readyResolve = res;
    readyReject = rej;
  });

  const readyTimeout = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
    readyReject(new Error('Timed out waiting for E2E Next.js server to become ready (30s)'));
  }, 30000);

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    const match = text.match(/\[E2E-SERVER-READY\]:(\d+)/);
    if (match) {
      clearTimeout(readyTimeout);
      readyResolve(parseInt(match[1], 10));
    }
  });

  child.stderr?.on('data', () => {
    // Drain stderr to avoid pipe backpressure
  });

  child.on('exit', (code: number | null) => {
    clearTimeout(readyTimeout);
    readyReject(new Error(`E2E server child process exited prematurely with code ${code}`));
  });

  const port = await readyPromise;
  const baseUrl = `http://127.0.0.1:${port}`;

  const stop = async (): Promise<void> => {
    process.off('exit', onProcessExit);
    if (child.killed || child.exitCode !== null) return;

    return new Promise((resolve) => {
      const killTimeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        resolve();
      }, 5000);

      child.on('exit', () => {
        clearTimeout(killTimeout);
        resolve();
      });

      try {
        child.kill('SIGTERM');
      } catch {
        clearTimeout(killTimeout);
        resolve();
      }
    });
  };

  return { port, baseUrl, stop };
}
