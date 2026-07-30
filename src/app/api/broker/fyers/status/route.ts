import { NextResponse } from 'next/server';
import { FyersAuthService } from '@/services/fyers-auth.service';
import { MarketService } from '@/services/market.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tokenDetails = await FyersAuthService.getTokenDetails();
    if (!tokenDetails) {
      return NextResponse.json({ connected: false, dataApiOk: false });
    }

    const probe = await MarketService.probeFyersDataApi();
    return NextResponse.json({
      connected: true,
      expiresAt: tokenDetails.expiresAt,
      updatedAt: tokenDetails.updatedAt,
      dataApiOk: probe.ok,
      dataApiMessage: probe.message,
    });
  } catch (err) {
    return NextResponse.json({ connected: false, dataApiOk: false, error: String(err) }, { status: 500 });
  }
}
