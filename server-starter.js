// C-04: Register crash handlers BEFORE any async work so they catch startup failures too
let isTerminating = false;

/**
 * R-4: Two-tier shutdown model
 * ─────────────────────────────────────────────────────────────────────────
 * TIER 1 — Crash path (this file, crashExit):
 *   Triggered by uncaughtException or unhandledRejection.
 *   Provides a 500ms grace period to flush console buffers and stdio.
 *   500ms is intentionally SHORT — crash handlers must not attempt DB cleanup
 *   because in-flight transactions may be corrupt by the time we reach here.
 *   Graceful DB/Redis/BullMQ teardown is NOT the crash handler's responsibility.
 *
 * TIER 2 — Graceful SIGTERM path (src/lib/shutdown-orchestrator.ts):
 *   Triggered by pm2 stop, systemd stop, or a manual `kill -SIGTERM <pid>`.
 *   Runs registered shutdown hooks in order: distributed lock release → Prisma
 *   $disconnect → BullMQ worker close. Allows in-flight requests to complete
 *   within the configured drain window before the process exits.
 *
 * If your change requires DB cleanup on crash, register a critical shutdown hook
 * in shutdown-orchestrator.ts and test it with a SIGTERM, not this crash handler.
 * ─────────────────────────────────────────────────────────────────────────
 */
function crashExit(code = 1) {
  if (isTerminating) return;
  isTerminating = true;
  // 500ms is sufficient to flush console buffers and pending stdio writes.
  // Do NOT increase this — crash handlers must exit quickly to allow pm2 watchdog
  // to detect the crash and restart the process within the configured restart window.
  setTimeout(() => {
    process.exit(code);
  }, 500);
}

process.on('uncaughtException', (err) => {
  console.error('[server-starter] Uncaught exception:', err);
  crashExit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[server-starter] Unhandled promise rejection at:', promise, 'reason:', reason);
  crashExit(1);
});


const { createServer } = require('http');
const next = require('next');
const fs = require('fs');
const path = require('path');

const buildIdPath = path.join(__dirname, '.next', 'BUILD_ID');
if (!fs.existsSync(buildIdPath)) {
  console.error('FATAL: .next/BUILD_ID missing. Run `next build` before starting the server.');
  process.exit(1);
}
const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();

const port = parseInt(process.env.PORT || '3000', 10);
// B11 fix: hostname passed to next() controls canonical URL generation (used by
// next/image, SSR redirects). Must be 'localhost', NOT '0.0.0.0' (a network
// interface bind address that would poison all absolute URL generation).
// The actual 0.0.0.0 bind happens in server.listen() below.
const app = next({ dev: false, dir: __dirname, hostname: 'localhost', port });
const handle = app.getRequestHandler();

const bindHost = '0.0.0.0';
app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`FATAL: Port ${port} is already in use. Kill the existing process and retry.`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });

  // M-02: listen() callback does not receive an error argument in Node.js 14+;
  // errors are emitted on the 'error' event above — removed dead `if (err) throw err`.
  server.listen(port, bindHost, () => {
    console.log(`> CPR PRO Platform ready on http://${bindHost}:${port} [Build: ${buildId}]`);
  });
}).catch((err) => {
  console.error('Failed to start Next.js custom server:', err);
  process.exit(1);
});

