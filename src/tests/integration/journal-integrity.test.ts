import test from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { prisma } from '../../lib/db';
import { PATCH, DELETE } from '../../app/api/journal/route';

function makeEntry(id: string) {
  return prisma.tradeJournal.create({
    data: {
      id,
      tradeDate: new Date(),
      signalType: 'BTST',
      symbol: 'RELIANCE',
      optionContract: 'RELIANCE 2500 CE',
      optionStrike: 2500,
      optionType: 'CE',
      entryCmp: 100,
      entryTime: new Date(),
      score: 90,
      confidence: 80,
      signalSummary: 'LONG',
      qualityBucketAtSignal: 'TRADEABLE',
    },
  });
}

function patchReq(body: unknown) {
  return new NextRequest('http://localhost/api/journal', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function deleteReq(id: string) {
  return new NextRequest(`http://localhost/api/journal?id=${id}`, { method: 'DELETE' });
}

test('Journal integrity (PATCH exit + DELETE)', async (t) => {
  await t.test('PATCH sets exit and computes guarded P&L', async () => {
    const id = 'itest-journal-patch-1';
    await prisma.tradeJournal.deleteMany({ where: { id } });
    await makeEntry(id);

    const res = await PATCH(patchReq({ id, exitCmp: 150 }));
    assert.strictEqual(res.status, 200);

    const row = await prisma.tradeJournal.findUnique({ where: { id } });
    assert.strictEqual(row?.exitCmp, 150);
    assert.strictEqual(row?.pnl, 50);
    assert.strictEqual(row?.pnlPct, 50);

    await prisma.tradeJournal.deleteMany({ where: { id } });
  });

  await t.test('second PATCH cannot overwrite an existing exit (409, value unchanged)', async () => {
    const id = 'itest-journal-patch-2';
    await prisma.tradeJournal.deleteMany({ where: { id } });
    await makeEntry(id);

    const first = await PATCH(patchReq({ id, exitCmp: 150 }));
    assert.strictEqual(first.status, 200);

    const second = await PATCH(patchReq({ id, exitCmp: 999 }));
    assert.strictEqual(second.status, 409);

    // The original exit must be preserved — no clobbering.
    const row = await prisma.tradeJournal.findUnique({ where: { id } });
    assert.strictEqual(row?.exitCmp, 150);

    await prisma.tradeJournal.deleteMany({ where: { id } });
  });

  await t.test('DELETE removes the entry so it can be re-entered', async () => {
    const id = 'itest-journal-delete-1';
    await prisma.tradeJournal.deleteMany({ where: { id } });
    await makeEntry(id);

    const res = await DELETE(deleteReq(id));
    assert.strictEqual(res.status, 200);

    const row = await prisma.tradeJournal.findUnique({ where: { id } });
    assert.strictEqual(row, null);
  });

  await t.test('DELETE on a missing id returns 404', async () => {
    const res = await DELETE(deleteReq('itest-journal-does-not-exist'));
    assert.strictEqual(res.status, 404);
  });
});
