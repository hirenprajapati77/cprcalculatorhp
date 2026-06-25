import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/services/alert/telegram.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { test, groupChatId } = body;

    if (!test) {
      return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
    }

    const chatId = groupChatId || process.env.TELEGRAM_GROUP_CHAT_ID;
    if (!chatId) {
      return NextResponse.json({ success: false, message: 'TELEGRAM_GROUP_CHAT_ID not configured on server' }, { status: 400 });
    }

    // Send a sample breakout alert with dummy data
    await TelegramService.sendBreakoutAlert([
      {
        symbol: 'BHEL',
        ltp: 414.35,
        entry: 415.00,
        sl: 403.85,
        target: 433.82,
        rr: '1:1.9',
        score: 100,
        sector: 'Capital Goods'
      },
      {
        symbol: 'SBIN',
        ltp: 802.50,
        entry: 803.00,
        sl: 792.10,
        target: 825.60,
        rr: '1:2.1',
        score: 95,
        sector: 'Banking'
      }
    ], groupChatId);

    return NextResponse.json({ success: true, message: 'Test breakout alert sent to group', chatId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
