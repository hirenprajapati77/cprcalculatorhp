import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/services/alert/telegram.service';
import { filterBreakoutsForPriceActionability } from '@/services/alert/breakout-price-gate';
import type { BreakoutScanResult } from '@/services/alert/breakout-watcher.service';

/** Near-entry fixtures so a healthy deploy still delivers a test ping. */
const TEST_BREAKOUT_FIXTURES: BreakoutScanResult[] = [
  {
    symbol: 'BHEL',
    signals: ['BREAKOUT'],
    alertKind: 'BREAKOUT',
    ltp: 414.35,
    entry: 415.0,
    sl: 403.85,
    target: 433.82,
    rr: '1:1.9',
    score: 100,
    sector: 'Capital Goods',
    high: 416,
    low: 410,
    open: 412,
    previousClose: 411,
  },
  {
    symbol: 'SBIN',
    signals: ['BREAKOUT'],
    alertKind: 'BREAKOUT',
    ltp: 802.5,
    entry: 803.0,
    sl: 792.1,
    target: 825.6,
    rr: '1:2.1',
    score: 95,
    sector: 'Banking',
    high: 805,
    low: 798,
    open: 800,
    previousClose: 799,
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { test } = body;

    if (!test) {
      return NextResponse.json({ success: false, message: 'Invalid payload' }, { status: 400 });
    }

    // Server env only — do not accept client-supplied token/chat overrides.
    const chatId = env.TELEGRAM_GROUP_CHAT_ID;
    const resolvedToken = env.TELEGRAM_BOT_TOKEN;

    if (!chatId || !resolvedToken) {
      return NextResponse.json({ success: false, message: 'Bot Token or Chat ID not configured' }, { status: 400 });
    }

    // Same pre-send gate as live breakout Telegram — test path must not teach bypasses.
    const { actionable, suppressed } = filterBreakoutsForPriceActionability(TEST_BREAKOUT_FIXTURES);
    if (actionable.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Test fixtures failed the price-actionability gate (gap/extension). ' +
            suppressed.map((s) => `${s.symbol}:${s.gateReason}`).join(', '),
        },
        { status: 422 }
      );
    }

    const result = await TelegramService.sendBreakoutAlert(actionable, chatId, resolvedToken);

    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: result.reason || 'Failed to send breakout alert' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Test breakout alert sent to group',
      chatId,
      sent: actionable.map((b) => b.symbol),
      ...(suppressed.length > 0
        ? { suppressed: suppressed.map((s) => `${s.symbol}:${s.gateReason}`) }
        : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
