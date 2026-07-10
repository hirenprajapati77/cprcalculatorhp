import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { encrypt, decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

const SettingsSchema = z.object({
  marketMode: z.string().optional(),
  defaultUniverse: z.string().optional(),
  autoRefresh: z.string().optional(),
  minPrice: z.number().nonnegative().optional(),
  minVolume: z.number().nonnegative().optional(),
  bypassBtst: z.boolean().optional(),
  telegramToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  telegramGroupChatId: z.string().optional(),
});

// GET — load current settings (creates defaults row if missing)
export async function GET() {
  try {
    const settings = await prisma.appSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });

    // Mask the telegram token if present
    if (settings.telegramToken) {
      try {
        const plainToken = decrypt(settings.telegramToken);
        if (plainToken.length > 4) {
          settings.telegramToken = '*'.repeat(plainToken.length - 4) + plainToken.slice(-4);
        } else {
          settings.telegramToken = '****';
        }
      } catch (_e) {
        settings.telegramToken = '****'; // Fallback if decryption fails
      }
    }

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
    const parsed = SettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
    }

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
    } = parsed.data;

    const isMaskedToken = telegramToken && telegramToken.startsWith('***');
    const encryptedToken = telegramToken && telegramToken.trim() !== '' && !isMaskedToken ? encrypt(telegramToken) : undefined;

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
        telegramToken:        encryptedToken       ?? '',
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
        ...(encryptedToken       !== undefined && { telegramToken: encryptedToken }),
        ...(telegramChatId       !== undefined && { telegramChatId }),
        ...(telegramGroupChatId  !== undefined && { telegramGroupChatId }),
      },
    });

    // Mask for response
    if (settings.telegramToken) {
      try {
        const plainToken = decrypt(settings.telegramToken);
        if (plainToken.length > 4) {
          settings.telegramToken = '*'.repeat(plainToken.length - 4) + plainToken.slice(-4);
        } else {
          settings.telegramToken = '****';
        }
      } catch (_e) {
        settings.telegramToken = '****';
      }
    }

    return NextResponse.json({ success: true, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
