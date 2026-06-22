import 'dotenv/config';
import crypto from 'crypto';

async function getPrisma() {
  const { prisma } = await import('@/lib/db');
  return prisma;
}

export class FyersAuthService {
  public static getCredentials() {
    const appId = process.env.FYERS_APP_ID;
    const secretId = process.env.FYERS_SECRET_ID;
    const redirectUrl = process.env.FYERS_REDIRECT_URL;
    if (!appId || !secretId || !redirectUrl) {
      throw new Error('Fyers credentials missing from environment variables');
    }
    return { appId, secretId, redirectUrl };
  }

  public static async getAccessToken(): Promise<string | null> {
    try {
      const prisma = await getPrisma();
      const tokenRecord = await prisma.brokerToken.findFirst({
        where: { broker: 'fyers' },
        orderBy: { updatedAt: 'desc' }
      });
      if (tokenRecord && tokenRecord.expiresAt > new Date()) {
        try {
          const { decrypt } = await import('@/lib/crypto');
          return decrypt(tokenRecord.accessToken);
        } catch (decryptErr) {
          console.error('[FyersAuthService] Failed to decrypt access token (possibly key rotated or missing):', decryptErr);
          return null;
        }
      }
    } catch (err) {
      console.error('[FyersAuthService] Error loading token from database:', err);
    }
    return null;
  }

  public static async getTokenDetails() {
    try {
      const prisma = await getPrisma();
      const tokenRecord = await prisma.brokerToken.findFirst({
        where: { broker: 'fyers' },
        orderBy: { updatedAt: 'desc' }
      });
      if (tokenRecord && tokenRecord.expiresAt > new Date()) {
        try {
          const { decrypt } = await import('@/lib/crypto');
          return {
            ...tokenRecord,
            accessToken: decrypt(tokenRecord.accessToken)
          };
        } catch (decryptErr) {
          console.error('[FyersAuthService] Failed to decrypt access token details (possibly key rotated or missing):', decryptErr);
          return null;
        }
      }
    } catch (err) {
      console.error('[FyersAuthService] Error loading token details from database:', err);
    }
    return null;
  }

  public static async saveToken(token: string, expiresAt: Date): Promise<void> {
    try {
      const { encrypt } = await import('@/lib/crypto');
      const encryptedToken = encrypt(token);
      const prisma = await getPrisma();
      await prisma.brokerToken.upsert({
        where: { id: 1 },
        update: {
          accessToken: encryptedToken,
          expiresAt: expiresAt,
          updatedAt: new Date()
        },
        create: {
          id: 1,
          broker: 'fyers',
          accessToken: encryptedToken,
          expiresAt: expiresAt
        }
      });
      console.log('[FyersAuthService] Token saved successfully in DB.');
    } catch (err) {
      console.error('[FyersAuthService] Error saving token to database:', err);
    }
  }

  public static async isLoggedIn(): Promise<boolean> {
    const token = await this.getAccessToken();
    return !!token;
  }

  public static getLoginUrl(customRedirectUrl?: string): string {
    const { appId, redirectUrl } = this.getCredentials();
    const finalRedirect = customRedirectUrl || redirectUrl;
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: finalRedirect,
      response_type: 'code',
      state: 'fyers_auth'
    });
    return `https://api-t1.fyers.in/api/v3/generate-authcode?${params.toString()}`;
  }

  public static async generateToken(authCode: string, customRedirectUrl?: string): Promise<{ success: boolean; message: string }> {
    if (!authCode) {
      return { success: false, message: 'Missing auth code' };
    }

    const { appId, secretId, redirectUrl } = this.getCredentials();
    const finalRedirect = customRedirectUrl || redirectUrl;

    try {
      const hashInput = `${appId}:${secretId}`;
      const appIdHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      const payload = {
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: authCode,
        redirect_uri: finalRedirect
      };

      // 1. Attempt DIRECT call first
      try {
        console.log('[FyersAuthService] Attempting token generation DIRECTLY...');
        const res = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Fyers-AppId': appId
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.s === 'ok') {
            const token = data.access_token || data.data?.access_token;
            if (token) {
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
              await this.saveToken(token, expiresAt);
              console.log('[FyersAuthService] Direct token exchange succeeded.');
              return { success: true, message: 'Login successful (Direct)' };
            }
          }
        }
      } catch (directErr) {
        console.warn('[FyersAuthService] Direct token exchange failed with error:', directErr);
      }

      // 2. Fallback to Cloudflare Worker Proxy
      const authProxyUrl = process.env.FYERS_AUTH_PROXY_URL;
      if (!authProxyUrl) {
        return { success: false, message: 'Direct Fyers token exchange failed and no trusted proxy is configured.' };
      }

      console.warn('[FyersAuthService] WARNING: Using external proxy for token exchange. Ensure this URL is a trusted, self-controlled endpoint.');
      console.log(`[FyersAuthService] Attempting token generation via PROXY (${authProxyUrl})...`);
      const res = await fetch(`${authProxyUrl.replace(/\/$/, '')}/api/v3/validate-authcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Fyers-AppId': appId
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.s === 'ok') {
          const token = data.access_token || data.data?.access_token;
          if (token) {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await this.saveToken(token, expiresAt);
            console.log('[FyersAuthService] Proxy token exchange succeeded.');
            return { success: true, message: 'Login successful (Proxy)' };
          }
        }
        return { success: false, message: data.message || 'Proxy call returned non-ok status' };
      } else {
        const text = await res.text();
        return { success: false, message: `Proxy HTTP ${res.status}: ${text.substring(0, 100)}` };
      }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Exception during token generation' };
    }
  }
}
