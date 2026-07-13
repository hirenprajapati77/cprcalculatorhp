const { PrismaClient } = require('./cpr-calculator-platform/node_modules/@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const midnightUTC = new Date('2026-07-09T18:30:00.000Z');
  const res = await prisma.tradeJournal.updateMany({
    where: { tradeDate: midnightUTC },
    data: {
      executionOutcome: null,
      executionVariancePct: null
    }
  });
  console.log('RESET ROWS (Execution Outcome):', res.count);
}
run().catch(console.error).finally(() => prisma.$disconnect());
