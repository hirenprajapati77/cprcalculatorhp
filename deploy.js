const { execSync } = require('child_process');
const fs = require('fs');

const key = `"C:\\Users\\hiren\\Downloads\\ssh-key-2026-05-30 (1).key"`;
const server = 'ubuntu@129.159.230.41';

function uploadFile(local, remote) {
  const content = fs.readFileSync(local, 'utf8');
  const remoteCmd = `cat << 'EOF' > ${remote}\n${content}\nEOF`;
  const b64 = Buffer.from(remoteCmd).toString('base64');
  console.log(`Uploading ${local} to ${remote}`);
  execSync(`ssh -i ${key} -o StrictHostKeyChecking=no ${server} "echo ${b64} | base64 -d | bash"`);
}

uploadFile('src/app/backtest/[runId]/page.tsx', '/home/ubuntu/cpr-calculator-platform/src/app/backtest/\\[runId\\]/page.tsx');
console.log("Done");
