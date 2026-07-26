const { spawn } = require('child_process');

const prisma = spawn('npx', ['prisma', 'migrate', 'dev', '--name', 'add_direction_to_overnight_signal_unique_key'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true
});

prisma.stdin.write('y\n');
prisma.stdin.end();

prisma.on('close', (code) => {
  process.exit(code);
});
