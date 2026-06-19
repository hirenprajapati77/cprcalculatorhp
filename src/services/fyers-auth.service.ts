import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class FyersAuthService {
  private static tokenFilePath = path.join(process.cwd(), 'fyers_token.txt');
  private static accessToken: string | null = null;

  public static getCredentials() {
    return {
      appId: process.env.FYERS_APP_ID || 'XAST342P8T-100',
      secretId: process.env.FYERS_SECRET_ID || 'Q5G3DG890Y',
      redirectUrl: process.env.FYERS_REDIRECT_URL || 'https://stock-dashboard-9nvy.onrender.com/api/v1/fyers/callback',
      authProxyUrl: (process.env.FYERS_AUTH_PROXY_URL || 'https://cold-dew-46bf.prahiren.workers.dev').replace(/\/$/, '')
    };
  }

  public static loadToken(): boolean {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const token = fs.readFileSync(this.tokenFilePath, 'utf8').trim();
        if (token && token.length > 20) {
          this.accessToken = token;
          return true;
        }
      }
    } catch (err) {
      console.error('[FyersAuthService] Error loading token:', err);
    }
    return false;
  }

  public static saveToken(token: string): void {
    try {
      this.accessToken = token;
      fs.writeFileSync(this.tokenFilePath, token, 'utf8');
      console.log('[FyersAuthService] Token saved successfully.');
    } catch (err) {
      console.error('[FyersAuthService] Error saving token:', err);
    }
  }

  public static getAccessToken(): string | null {
    if (!this.accessToken) {
      this.loadToken();
    }
    return this.accessToken;
  }

  public static isLoggedIn(): boolean {
    return !!this.getAccessToken();
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

    const { appId, secretId, redirectUrl, authProxyUrl } = this.getCredentials();
    const finalRedirect = customRedirectUrl || redirectUrl;

    try {
      const hashInput = `${appId}:${secretId}`;
      const appIdHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      // V3 payload matches the proxy expectation
      const payload = {
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: authCode,
        redirect_uri: finalRedirect
      };

      const attempts = [
        {
          url: `${authProxyUrl}/api/v3/validate-authcode`,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Fyers-AppId': appId
          },
          body: JSON.stringify(payload)
        },
        {
          url: `https://api-t1.fyers.in/api/v3/validate-authcode`,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Fyers-AppId': appId
          },
          body: JSON.stringify(payload)
        }
      ];

      let lastError = 'Exchange failed';
      for (const attempt of attempts) {
        try {
          const res = await fetch(attempt.url, {
            method: 'POST',
            headers: attempt.headers,
            body: attempt.body
          });

          if (res.ok) {
            const data = await res.json();
            if (data.s === 'ok') {
              const token = data.access_token || data.data?.access_token;
              if (token) {
                this.saveToken(token);
                return { success: true, message: 'Login successful' };
              }
            }
            lastError = data.message || lastError;
          } else {
            const text = await res.text();
            lastError = `HTTP ${res.status}: ${text.substring(0, 100)}`;
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }

      return { success: false, message: lastError };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Exception during token generation' };
    }
  }
}
