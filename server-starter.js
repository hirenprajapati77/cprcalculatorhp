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
const hostname = '0.0.0.0';
const app = next({ dev: false, dir: __dirname, hostname, port });
const handle = app.getRequestHandler();

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
  server.listen(port, hostname, () => {
    console.log(`> CPR PRO Platform ready on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error('Failed to start Next.js custom server:', err);
  process.exit(1);
});

