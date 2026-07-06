import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET — load current settings (creates defaults row if missing)
export async function GET() {
  try {
    const settings = await prisma.appSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — save settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      marketMode,
      defaultUniverse,
      autoRefresh,
      minPrice,
      minVolume,
      bypassBtst,
      telegramToken,
      telegramChatId,
      telegramGroupChatId,
    } = body;

    const settings = await prisma.appSettings.upsert({
      where: { id: 'global' },
      create: {
        id: 'global',
        marketMode:           marketMode           ?? 'live',
        defaultUniverse:      defaultUniverse      ?? 'NSE_FNO',
        autoRefresh:          autoRefresh          ?? '15m',
        minPrice:             minPrice             ?? 20,
        minVolume:            minVolume            ?? 50000,
        bypassBtst:           bypassBtst           ?? false,
        telegramToken:        telegramToken        ?? '',
        telegramChatId:       telegramChatId       ?? '',
        telegramGroupChatId:  telegramGroupChatId  ?? '',
      },
      update: {
        ...(marketMode           !== undefined && { marketMode }),
        ...(defaultUniverse      !== undefined && { defaultUniverse }),
        ...(autoRefresh          !== undefined && { autoRefresh }),
        ...(minPrice             !== undefined && { minPrice }),
        ...(minVolume            !== undefined && { minVolume }),
        ...(bypassBtst           !== undefined && { bypassBtst }),
        ...(telegramToken        !== undefined && { telegramToken }),
        ...(telegramChatId       !== undefined && { telegramChatId }),
        ...(telegramGroupChatId  !== undefined && { telegramGroupChatId }),
      },
    });
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
