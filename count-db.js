const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.marketEvent.count();
  console.log('Total MarketEvent count:', count);
  
  const bySource = await prisma.marketEvent.groupBy({
    by: ['source'],
    _count: {
      _all: true
    }
  });
  console.log('By source:', bySource);
  
  const sample = await prisma.marketEvent.findMany({ take: 5 });
  console.log('Sample records:', sample);
}

main().finally(() => prisma.$disconnect());
