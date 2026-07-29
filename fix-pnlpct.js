const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const nestle = await prisma.tradeJournal.findFirst({ where: { symbol: 'NESTLEIND' }, orderBy: { tradeDate: 'desc' } });
  if (nestle) {
    const pnlPct = (nestle.exitCmp - nestle.entryCmp) / nestle.entryCmp * 100;
    await prisma.tradeJournal.update({ where: { id: nestle.id }, data: { pnlPct } });
    console.log('Updated NESTLEIND pnlPct:', pnlPct);
  }
  const radico = await prisma.tradeJournal.findFirst({ where: { symbol: 'RADICO' }, orderBy: { tradeDate: 'desc' } });
  if (radico) {
    const pnlPct = (radico.exitCmp - radico.entryCmp) / radico.entryCmp * 100;
    await prisma.tradeJournal.update({ where: { id: radico.id }, data: { pnlPct } });
    console.log('Updated RADICO pnlPct:', pnlPct);
  }
}
main().finally(() => prisma.$disconnect());
