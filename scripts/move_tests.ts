import fs from 'fs';
import path from 'path';

const testsDir = path.resolve(__dirname, '../src/tests');
const unitDir = path.join(testsDir, 'unit');
const intDir = path.join(testsDir, 'integration');

if (!fs.existsSync(unitDir)) fs.mkdirSync(unitDir);
if (!fs.existsSync(intDir)) fs.mkdirSync(intDir);

const prismaTests = [
  'analytics.test.ts',
  'breakout-watcher.test.ts',
  'history.test.ts',
  'journal.test.ts',
  'overnight.test.ts',
  'telegram.service.test.ts'
];

const allFiles = fs.readdirSync(testsDir);
for (const file of allFiles) {
  if (file.endsWith('.test.ts')) {
    const isPrisma = prismaTests.includes(file);
    const targetDir = isPrisma ? intDir : unitDir;
    fs.renameSync(path.join(testsDir, file), path.join(targetDir, file));
    console.log(`Moved ${file} to ${isPrisma ? 'integration' : 'unit'}`);
  }
}
