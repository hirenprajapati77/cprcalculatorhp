import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { encrypt, decrypt } from '@/lib/crypto';
import { publicApiError } from '@/lib/api-error';
import { maskSecretTail } from '@/lib/mask-secret';

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

function maskSettingsForClient<T extends {
  telegramToken?: string | null;
  telegramChatId?: string | null;
  telegramGroupChatId?: string | null;
}>(settings: T): T {
  const out = { ...settings };
  if (out.telegramToken) {
    try {
      const plainToken = decrypt(out.telegramToken);
      out.telegramToken =
        plainToken.length > 4
          ? '*'.repeat(plainToken.length - 4) + plainToken.slice(-4)
          : '****';
    } catch {
      out.telegramToken = '****';
    }
  }
  if (out.telegramChatId) {
    out.telegramChatId = maskSecretTail(out.telegramChatId);
  }
  if (out.telegramGroupChatId) {
    out.telegramGroupChatId = maskSecretTail(out.telegramGroupChatId);
  }
  return out;
}

function isMaskedChatId(value: string | undefined): boolean {
  return Boolean(value && /^\*+\d{0,4}$/.test(value));
}

// GET — load current settings (creates defaults row if missing)
export async function GET() {
  try {
    const settings = await prisma.appSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });

    return NextResponse.json({ success: true, settings: maskSettingsForClient(settings) });
  } catch (err) {
    console.error('[Settings GET]', err);
    return NextResponse.json({ error: publicApiError(err) }, { status: 500 });
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

    // Masked values mean "leave unchanged". Empty string means "clear saved token".
    const isMaskedToken = Boolean(telegramToken && telegramToken.startsWith('***'));
    const clearTelegramToken =
      telegramToken !== undefined && telegramToken.trim() === '';
    const encryptedToken =
      telegramToken !== undefined && telegramToken.trim() !== '' && !isMaskedToken
        ? encrypt(telegramToken)
        : undefined;

    // Masked chat IDs from a prior GET must not overwrite the real values.
    const effectiveChatId =
      telegramChatId !== undefined && !isMaskedChatId(telegramChatId) ? telegramChatId : undefined;
    const effectiveGroupChatId =
      telegramGroupChatId !== undefined && !isMaskedChatId(telegramGroupChatId)
        ? telegramGroupChatId
        : undefined;

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
        telegramChatId:       effectiveChatId      ?? '',
        telegramGroupChatId:  effectiveGroupChatId ?? '',
      },
      update: {
        ...(marketMode           !== undefined && { marketMode }),
        ...(defaultUniverse      !== undefined && { defaultUniverse }),
        ...(autoRefresh          !== undefined && { autoRefresh }),
        ...(minPrice             !== undefined && { minPrice }),
        ...(minVolume            !== undefined && { minVolume }),
        ...(bypassBtst           !== undefined && { bypassBtst }),
        ...(clearTelegramToken
          ? { telegramToken: '' }
          : encryptedToken !== undefined
            ? { telegramToken: encryptedToken }
            : {}),
        ...(effectiveChatId       !== undefined && { telegramChatId: effectiveChatId }),
        ...(effectiveGroupChatId  !== undefined && { telegramGroupChatId: effectiveGroupChatId }),
      },
    });

    return NextResponse.json({ success: true, settings: maskSettingsForClient(settings) });
  } catch (err) {
    console.error('[Settings POST]', err);
    return NextResponse.json({ error: publicApiError(err) }, { status: 500 });
  }
}
