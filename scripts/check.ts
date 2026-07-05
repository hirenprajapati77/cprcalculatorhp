import { prisma } from '../src/lib/db';
async function main() {
  process.env.DATABASE_URL = 'file:./task-q.db';
  const runs = await prisma.backtestRun.findMany();
  console.log(runs.map(r => r.name));
}
main();
