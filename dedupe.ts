import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function dedupe() {
  const tokens = await prisma.brokerToken.findMany({
    orderBy: { updatedAt: 'desc' }
  });
  
  const seen = new Set();
  for (const t of tokens) {
    if (seen.has(t.broker)) {
      console.log('Deleting duplicate for broker:', t.broker, 'id:', t.id);
      await prisma.brokerToken.delete({ where: { id: t.id } });
    } else {
      seen.add(t.broker);
      console.log('Keeping latest for broker:', t.broker, 'id:', t.id);
    }
  }
}
dedupe().catch(console.error).finally(() => prisma.$disconnect());
