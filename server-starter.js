// C-04: Register crash handlers BEFORE any async work so they catch startup failures too
process.on('uncaughtException', (err) => {
  console.error('[server-starter] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server-starter] Unhandled promise rejection:', reason);
  process.exit(1);
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
    console.log(`> CPR PRO Platform ready on http://${bindHost}:${port}`);
  });
}).catch((err) => {
  console.error('Failed to start Next.js custom server:', err);
  process.exit(1);
});

