const { RegimeService } = require('./.next/standalone/src/services/overnight/regime.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const r = await RegimeService.getMarketRegime();
  console.log('REGIME:', JSON.stringify(r, null, 2));
  await prisma['']();
}
run();
