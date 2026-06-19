import { NextResponse } from 'next/server';
import { FyersAuthService } from '@/services/fyers-auth.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tokenDetails = await FyersAuthService.getTokenDetails();
    if (tokenDetails) {
      return NextResponse.json({
        connected: true,
        expiresAt: tokenDetails.expiresAt,
        updatedAt: tokenDetails.updatedAt
      });
    }
    return NextResponse.json({ connected: false });
  } catch (err) {
    return NextResponse.json({ connected: false, error: String(err) }, { status: 500 });
  }
}
