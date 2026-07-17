import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/services/alert/telegram.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { test, chatId, token } = body;

    if (test) {
      const resolvedToken = token || env.TELEGRAM_BOT_TOKEN;
      const resolvedChatId = chatId || env.TELEGRAM_CHAT_ID;
      
      if (!resolvedToken || !resolvedChatId) {
         return NextResponse.json({ success: false, message: 'Bot Token or Chat ID not configured' }, { status: 400 });
      }

      const result = await TelegramService.sendMessage(
        '🟢 <b>CPR PRO Test Alert</b>\nYour Telegram notifications are correctly configured.',
        chatId,
        token
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
