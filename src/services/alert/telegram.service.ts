import { env } from '@/config/env';
import { BtstScoreResultEnriched } from '../backtest/btst.service';
import { OptionSuggestion } from '../option-suggestion.service';
import { prisma } from '../../lib/db';
import { BTST_CLOCK } from '@/lib/market-hours';
import { ADVANCED_SCORE } from '@/config/trading-constants';

import { decrypt } from '../../lib/crypto';

const MIN_BTST_ALERT_SCORE = ADVANCED_SCORE.READY;

/** Escape dynamic text for Telegram parse_mode=HTML (<, >, & must be entity-encoded). */
export function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class TelegramService {
  static async sendMessage(text: string, chatId?: string, overrideToken?: string): Promise<{ ok: boolean; reason?: string }> {
    let token = overrideToken || env.TELEGRAM_BOT_TOKEN;
    let resolvedChatId = chatId || env.TELEGRAM_CHAT_ID;

    if (!token || !resolvedChatId) {
      try {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
        if (settings) {
          if (!token && settings.telegramToken) {
            try {
              token = decrypt(settings.telegramToken);
            } catch (err: unknown) {
              if (err instanceof Error && err.message === 'Invalid ciphertext format.') {
                if (env.NODE_ENV !== 'production') {
                  // Dev/staging only: allow plain-text token stored before encryption was enabled.
                  token = settings.telegramToken;
                } else {
                  // Production: never log or use a token that failed decryption — it may be corrupt.
                  console.error('[Telegram] Token decryption failed in production; skipping alert. Re-save token via /settings to re-encrypt.');
                }
              } else {
                throw err;
              }
            }
          }
          if (!resolvedChatId && settings.telegramChatId) {
            resolvedChatId = settings.telegramChatId;
          }
        }
      } catch (dbErr) {
        console.error('[Telegram] Failed to load credentials from AppSettings:', dbErr);
      }
    }

    if (!token || !resolvedChatId) {
      console.warn('[Telegram] Bot token or chat ID not configured. Skipping alert.');
      return { ok: false, reason: 'missing_config' };
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: resolvedChatId,
          text,
          parse_mode: 'HTML'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = await response.text();
        console.error('[Telegram] Failed to send message:', errBody);
        return { ok: false, reason: `telegram_api_error: ${errBody}` };
      }
      return { ok: true };
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('[Telegram] Network/fetch error sending message:', err);
      return { ok: false, reason: `fetch_error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /**
   * Sends a pre-formatted HTML message to the configured Telegram chat.
   * Alias for sendMessage — use this when the caller has already built the
   * full message string (e.g., gap-failure exit alerts, system notifications).
   */
  static async sendRawMessage(text: string): Promise<{ ok: boolean; reason?: string }> {
    return TelegramService.sendMessage(text);
  }

  /**
   * Chat targets for BTST alerts. Alerts are delivered to the group chat only
   * (TELEGRAM_GROUP_CHAT_ID — same destination breakout alerts use); the
   * personal chat is kept solely as a fallback when no group is configured.
   * Env wins; AppSettings is the fallback, mirroring sendMessage /
   * sendBreakoutAlert resolution.
   */
  private static async resolveBtstChatTargets(): Promise<{
    personal: string | undefined;
    group: string | undefined;
  }> {
    let personal = env.TELEGRAM_CHAT_ID;
    let group = env.TELEGRAM_GROUP_CHAT_ID;

    if (!personal || !group) {
      try {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
        personal = personal || settings?.telegramChatId || undefined;
        group = group || settings?.telegramGroupChatId || undefined;
      } catch (dbErr) {
        console.error('[Telegram] Failed to load BTST chat targets from AppSettings:', dbErr);
      }
    }

    return { personal, group };
  }

  static async sendBtstAlert(results: (BtstScoreResultEnriched & { optionSuggestion?: OptionSuggestion | undefined })[]): Promise<{ sent: boolean; reason?: string }> {
    const longs = results.filter(r => r.tag === 'LONG' && r.longScore >= MIN_BTST_ALERT_SCORE);
    const shorts = results.filter(r => r.tag === 'SHORT' && r.shortScore >= MIN_BTST_ALERT_SCORE);

    const strongSignalCount = results.filter((r) => {
      const cls = (r as { classification?: string }).classification ?? '';
      const score = r.tag === 'LONG' ? r.longScore : r.tag === 'SHORT' ? r.shortScore : 0;
      return cls.startsWith('STRONG_') || cls === 'INDEX_STRONG' || score >= ADVANCED_SCORE.STRONG;
    }).length;
    const breakoutCount = results.filter((r) => {
      const score = r.tag === 'LONG' ? r.longScore : r.tag === 'SHORT' ? r.shortScore : 0;
      const cls = (r as { classification?: string }).classification ?? '';
      return (
        score >= ADVANCED_SCORE.READY &&
        score < ADVANCED_SCORE.STRONG &&
        (cls === 'BTST_READY' || cls === 'STBT_READY' || cls === 'INDEX_READY')
      );
    }).length;

    const totalConflict = results.filter(r => r.tag === 'NEUTRAL_CONFLICT').length;
    const avoid = results.filter(r => Math.max(r.longScore, r.shortScore) < 30).length;

    const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' });

    // Group chat only (stock + index BTST/STBT). Personal DM is used solely as
    // a fallback when no group chat is configured, so alerts are never dropped.
    const { personal, group } = await this.resolveBtstChatTargets();
    if (!group) {
      console.warn('[Telegram] TELEGRAM_GROUP_CHAT_ID not set; falling back to personal chat for BTST alert');
    }
    const targetChatId = group ?? personal;

    // Only send if strongSignal > 0 OR breakoutReady > 2
    if (strongSignalCount === 0 && breakoutCount <= 2 && longs.length === 0 && shorts.length === 0) {
      const result = await this.sendMessage(
        `📊 <b>CPR PRO — BTST/STBT SCAN</b>\n` +
        `📅 ${dateStr}\n\n` +
        `<i>No qualifying setups found today (score &lt; ${MIN_BTST_ALERT_SCORE}).\n` +
        `Scanner ran successfully.</i>`,
        targetChatId
      );
      return { sent: result.ok, ...(result.ok ? { reason: 'no setups' } : (result.reason ? { reason: result.reason } : {})) };
    }


    let text = `🚨 <b>CPR PRO — BTST/STBT ALERT</b>\n📅 ${dateStr} | ⏰ ${BTST_CLOCK.discoveryStart}–${BTST_CLOCK.discoveryEnd} IST | Engine: Advanced\n\n`;

    text += `🟢 <b>LONG SETUPS (${longs.length})</b>\n`;
    if (longs.length === 0) text += `<i>None</i>\n`;
    longs.forEach(r => {
      const entry = r.entry.toFixed(2);
      const sl = r.sl.toFixed(2);
      const target = r.target.toFixed(2);
      const rr = escapeTelegramHtml(String(r.rr));
      const score = Math.max(r.longScore, r.shortScore);
      const symbol = escapeTelegramHtml(r.symbol);
      const signals = escapeTelegramHtml((r.signals || []).join(', '));
      const optionStr = r.optionSuggestion?.formattedName
        ? `\n  🎯 Option: <b>${escapeTelegramHtml(r.optionSuggestion.formattedName)}</b>`
        : '';
      text += `• <b>${symbol}</b> | Score: ${score}\n  Entry: ₹${entry} | SL: ₹${sl} | Target: ₹${target}\n  RR: ${rr} | Signals: ${signals}${optionStr}\n\n`;
    });

    text += `🔴 <b>SHORT SETUPS (${shorts.length})</b>\n`;
    if (shorts.length === 0) text += `<i>None</i>\n`;
    shorts.forEach(r => {
      const entry = r.entry.toFixed(2);
      const sl = r.sl.toFixed(2);
      const target = r.target.toFixed(2);
      const rr = escapeTelegramHtml(String(r.rr));
      const score = Math.max(r.longScore, r.shortScore);
      const symbol = escapeTelegramHtml(r.symbol);
      const signals = escapeTelegramHtml((r.signals || []).join(', '));
      const optionStr = r.optionSuggestion?.formattedName
        ? `\n  🎯 Option: <b>${escapeTelegramHtml(r.optionSuggestion.formattedName)}</b>`
        : '';
      text += `• <b>${symbol}</b> | Score: ${score}\n  Entry: ₹${entry} | SL: ₹${sl} | Target: ₹${target}\n  RR: ${rr} | Signals: ${signals}${optionStr}\n\n`;
    });

    text += `⚠️ Conflicts: ${totalConflict} | Avoid: ${avoid}\n`;
    text += `📊 Strong Signal: ${strongSignalCount} | Breakout: ${breakoutCount}\n`;

    // Single delivery to the group chat. On failure sent=false, so the claim
    // rollback in runBtstAlertJob retries on the next 5-min bucket.
    const result = await this.sendMessage(text, targetChatId);
    return { sent: result.ok, ...(result.ok ? {} : (result.reason ? { reason: result.reason } : {})) };
  }

  static async sendBreakoutAlert(
    stocks: Array<{
      symbol: string;
      ltp: number;
      entry: number;
      sl: number;
      target: number;
      rr: string;
      target2?: number | null;
      rr2?: string | null;
      score: number;
      sector: string;
      classification?: string;
      alertKind?: 'BREAKOUT' | 'BREAKDOWN';
      signals?: string[];
      /** Pre-attached by breakout-alert.pipeline — never fetched inside this method. */
      optionSuggestion?: OptionSuggestion;
    }>,
    overrideChatId?: string,
    overrideToken?: string
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!stocks.length) return { ok: false, reason: 'no_breakouts' };

    let chatId = overrideChatId || env.TELEGRAM_GROUP_CHAT_ID;
    let token = overrideToken || env.TELEGRAM_BOT_TOKEN;

    if (!chatId || !token) {
      try {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
        if (settings) {
          if (!chatId && settings.telegramGroupChatId) {
            chatId = settings.telegramGroupChatId;
          }
          if (!token && settings.telegramToken) {
            try {
              token = decrypt(settings.telegramToken);
            } catch (err: unknown) {
              if (err instanceof Error && err.message === 'Invalid ciphertext format.') {
                if (env.NODE_ENV !== 'production') {
                  token = settings.telegramToken;
                } else {
                  console.error('[Telegram] Breakout token decryption failed in production; skipping. Re-save token via /settings.');
                }
              } else {
                throw err;
              }
            }
          }
        }
      } catch (dbErr) {
        console.error('[Telegram] Failed to load breakout credentials from AppSettings:', dbErr);
      }
    }

    if (!chatId) {
      console.warn('[Telegram] TELEGRAM_GROUP_CHAT_ID not set, skipping breakout alert');
      return { ok: false, reason: 'missing_config' };
    }

    const lines = stocks.map((s) => {
      const isBreakdown =
        s.alertKind === 'BREAKDOWN' || s.signals?.includes('BREAKDOWN');
      const icon = isBreakdown ? '📉' : '🚀';

      const target2Line =
        s.target2 !== undefined && s.target2 !== null
          ? `\n   Target 2: ₹${s.target2.toFixed(2)} (RR: ${escapeTelegramHtml(s.rr2 ?? '')})`
          : '';

      let optionText = '';
      const suggestion = s.optionSuggestion;
      if (suggestion && !suggestion.error && suggestion.formattedName) {
        const priceText = suggestion.ltp ? ` @ ₹${suggestion.ltp.toFixed(2)}` : '';
        const optionLabel = escapeTelegramHtml(suggestion.formattedName);
        optionText = `\n   🎯 Option: <b>${optionLabel}${priceText}</b>`;
      }

      let slFooter = 'Stop loss closes on 15m candle';
      if (s.signals?.includes('RANGE')) {
        slFooter = 'Stop loss closes on 15m candle (RANGE breakout)';
      } else if (s.signals?.includes('TREND')) {
        slFooter = 'Stop loss closes on 15m candle (TREND continuation)';
      }

      return (
        `${icon} <b>${escapeTelegramHtml(s.symbol)}</b> (${escapeTelegramHtml(s.sector)})\n` +
        `   LTP: ₹${s.ltp.toFixed(2)} | Score: ${s.score}\n` +
        `   Entry: ₹${s.entry.toFixed(2)} | SL: ₹${s.sl.toFixed(2)} | Target 1: ₹${s.target.toFixed(2)}${target2Line}\n` +
        `   RR: ${escapeTelegramHtml(s.rr)}${optionText}\n` +
        `   <i>${escapeTelegramHtml(slFooter)}</i>`
      );
    }).join('\n\n');

    const timeStr = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short'
    });

    const hasBreakdown = stocks.some(
      (s) => s.alertKind === 'BREAKDOWN' || s.signals?.includes('BREAKDOWN')
    );
    const hasBreakout = stocks.some(
      (s) => s.alertKind === 'BREAKOUT' || s.signals?.includes('BREAKOUT') || !s.alertKind
    );
    const headline =
      hasBreakout && hasBreakdown
        ? 'NEW BREAKOUT / BREAKDOWN SIGNALS'
        : hasBreakdown
          ? `NEW BREAKDOWN SIGNAL${stocks.length > 1 ? 'S' : ''}`
          : `NEW BREAKOUT SIGNAL${stocks.length > 1 ? 'S' : ''}`;

    // Get unique classifications and check for volume spike across the batch
    const classifications = Array.from(new Set(stocks.map(s => s.classification || 'NORMAL'))).join(' / ');
    const hasVolumeSpike = stocks.some(s => s.signals?.includes('VOLUME_SPIKE'));
    const volText = hasVolumeSpike ? ' + Volume Spike' : '';

    const footnote = hasBreakdown && !hasBreakout
      ? escapeTelegramHtml(`⚠️ ${classifications} CPR${volText} + Price < BC. Verify before trading.`)
      : hasBreakout && hasBreakdown
        ? escapeTelegramHtml(`⚠️ ${classifications} CPR${volText} at CPR band edge. Verify before trading.`)
        : escapeTelegramHtml(`⚠️ ${classifications} CPR${volText} + Price > TC. Verify before trading.`);

    const message =
      `⚡ <b>${headline}</b>\n` +
      `📅 ${timeStr} IST\n\n` +
      `${lines}\n\n` +
      footnote;

    return await this.sendMessage(message, chatId, overrideToken);
  }
}
