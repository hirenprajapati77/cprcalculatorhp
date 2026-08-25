const { createServer } = require('http');
const next = require('next');
const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '.next');
const buildIdFile = path.join(nextDir, 'BUILD_ID');

if (!fs.existsSync(nextDir)) {
  fs.mkdirSync(nextDir, { recursive: true });
}
if (!fs.existsSync(buildIdFile)) {
  fs.writeFileSync(buildIdFile, 'cpr-platform-prod', 'utf8');
}

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';
const app = next({ dev: false, dir: __dirname, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> CPR PRO Platform ready on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error('Failed to start Next.js custom server:', err);
  process.exit(1);
});
