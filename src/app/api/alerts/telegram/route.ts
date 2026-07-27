import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/services/alert/telegram.service';
import { publicApiError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { test } = body;

    if (test) {
      // Never accept client-supplied bot token / chatId — that turns this into an open relay.
      const resolvedToken = env.TELEGRAM_BOT_TOKEN;
      const resolvedChatId = env.TELEGRAM_CHAT_ID;

      if (!resolvedToken || !resolvedChatId) {
         return NextResponse.json({ success: false, message: 'Bot Token or Chat ID not configured' }, { status: 400 });
      }

      const result = await TelegramService.sendMessage(
        '🟢 <b>CPR PRO Test Alert</b>\nYour Telegram notifications are correctly configured.',
        resolvedChatId,
        resolvedToken
      );
      if (!result.ok) {
        return NextResponse.json(
          { success: false, message: result.reason || 'Failed to send Telegram message' },
          { status: 502 }
        );
      }
      return NextResponse.json({ success: true, message: 'Test message sent' });
    }

    return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
  } catch (error: unknown) {
    console.error('[Telegram POST]', error);
    return NextResponse.json({ error: publicApiError(error) }, { status: 500 });
  }
}
