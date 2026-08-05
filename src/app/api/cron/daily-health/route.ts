import { NextRequest, NextResponse } from 'next/server';
import { getISTTime } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { TelegramService } from '@/services/alert/telegram.service';
import { prisma } from '@/lib/db';
import { tryClaimCronRun, completeCronRun, releaseCronRun } from '@/services/scheduler/cron-run-claim';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { isTradingDay, dateString, weekday, isHoliday } = getISTTime();

  if (!isTradingDay) {
    const reason = isHoliday ? 'NSE Holiday' : `Weekend (${weekday})`;
    return NextResponse.json({ skipped: true, reason });
  }

  const claimKey = `daily-health:${dateString}`;
  if (!(await tryClaimCronRun(claimKey))) {
    return NextResponse.json({ skipped: true, reason: 'already run today' });
  }

  try {
    // Quick DB ping
    await prisma.$queryRaw`SELECT 1`;

    const dateStr = new Date().toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const message =
      `🌅 <b>CPR PRO — Daily Market Ready</b>\n` +
      `📅 ${dateStr}\n\n` +
      `✅ Server online\n` +
      `✅ Database connected\n` +
      `✅ Alerts active\n\n` +
      `🕘 Market opens at <b>09:15 IST</b>\n` +
      `📡 CPR breakout scanner starts at <b>09:15 IST</b>\n` +
      `🎯 BTST/STBT scan runs at <b>15:10–15:25 IST</b>\n\n` +
      `<i>Good trading day ahead! 🚀</i>`;

    // Send to group (falls back to personal chat if group not configured)
    const settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
    const groupChatId = settings?.telegramGroupChatId ?? undefined;
    const result = await TelegramService.sendMessage(message, groupChatId);

    if (result.ok) {
      await completeCronRun(claimKey, true);
    } else {
      await releaseCronRun(claimKey);
    }

    return NextResponse.json({
      sent: result.ok,
      date: dateString,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  } catch (error: unknown) {
    await releaseCronRun(claimKey);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
