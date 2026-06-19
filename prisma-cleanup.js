const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.scannerResult.deleteMany({
    where: {
      symbol: {
        in: ['EMAMILTD', 'EMAMILTD:BSE']
      }
    }
  });
  console.log('Successfully deleted rows:', result.count);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
