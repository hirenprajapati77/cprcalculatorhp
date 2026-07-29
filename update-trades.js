const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const nestle = await prisma.tradeJournal.findFirst({ where: { symbol: 'NESTLEIND' }, orderBy: { tradeDate: 'desc' } });
  if (nestle) {
    const pnl = 54 - nestle.entryCmp;
    await prisma.tradeJournal.update({ where: { id: nestle.id }, data: { exitCmp: 54, pnl } });
    console.log('Updated NESTLEIND', pnl);
  }
  const radico = await prisma.tradeJournal.findFirst({ where: { symbol: 'RADICO' }, orderBy: { tradeDate: 'desc' } });
  if (radico) {
    const pnl = 305 - radico.entryCmp;
    await prisma.tradeJournal.update({ where: { id: radico.id }, data: { exitCmp: 305, pnl } });
    console.log('Updated RADICO', pnl);
  }
}
main().finally(() => prisma.$disconnect());
