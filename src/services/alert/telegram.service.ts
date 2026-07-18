import { env } from '@/config/env';
import { BtstScoreResultEnriched } from '../backtest/btst.service';
import { OptionSuggestion } from '../option-suggestion.service';
import { prisma } from '../../lib/db';
import { BTST_CLOCK } from '@/lib/market-hours';
import { BTST_READY_SCORE } from '@/config/trading-constants';

import { decrypt } from '../../lib/crypto';

const MIN_BTST_ALERT_SCORE = BTST_READY_SCORE;

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
                token = settings.telegramToken; // Fallback to plain text
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

  static async sendBtstAlert(results: (BtstScoreResultEnriched & { optionSuggestion?: OptionSuggestion | undefined })[]): Promise<{ sent: boolean; reason?: string }> {
    const longs = results.filter(r => r.tag === 'LONG' && Math.max(r.longScore, r.shortScore) >= MIN_BTST_ALERT_SCORE);
    const shorts = results.filter(r => r.tag === 'SHORT' && Math.max(r.longScore, r.shortScore) >= MIN_BTST_ALERT_SCORE);

    const strongSignalCount = results.filter(r => r.signals && r.signals.some(s => s.includes('STRONG') || s.includes('BREAKOUT') || s.includes('HIGHER_VALUE') || s.includes('LOWER_VALUE'))).length;
    const breakoutCount = results.filter(r => r.signals && r.signals.includes('BREAKOUT')).length;

    const totalConflict = results.filter(r => r.tag === 'NEUTRAL_CONFLICT').length;
    const avoid = results.filter(r => Math.max(r.longScore, r.shortScore) < 30).length;

    const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' });

    // Only send if strongSignal > 0 OR breakoutReady > 2
    if (strongSignalCount === 0 && breakoutCount <= 2 && longs.length === 0 && shorts.length === 0) {
      const result = await this.sendMessage(
        `📊 <b>CPR PRO — BTST/STBT SCAN</b>\n` +
        `📅 ${dateStr}\n\n` +
        `<i>No qualifying setups found today (score < ${MIN_BTST_ALERT_SCORE}).\n` +
        `Scanner ran successfully.</i>`
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
      const rr = r.rr;
      const score = Math.max(r.longScore, r.shortScore);
      const optionStr = r.optionSuggestion && r.optionSuggestion.formattedName 
        ? `\n  🎯 Option: <b>${r.optionSuggestion.formattedName}</b>` 
        : '';
      text += `• <b>${r.symbol}</b> | Score: ${score}\n  Entry: ₹${entry} | SL: ₹${sl} | Target: ₹${target}\n  RR: ${rr} | Signals: ${(r.signals || []).join(', ')}${optionStr}\n\n`;
    });

    text += `🔴 <b>SHORT SETUPS (${shorts.length})</b>\n`;
    if (shorts.length === 0) text += `<i>None</i>\n`;
    shorts.forEach(r => {
      const entry = r.entry.toFixed(2);
      const sl = r.sl.toFixed(2);
      const target = r.target.toFixed(2);
      const rr = r.rr;
      const score = Math.max(r.longScore, r.shortScore);
      const optionStr = r.optionSuggestion && r.optionSuggestion.formattedName 
        ? `\n  🎯 Option: <b>${r.optionSuggestion.formattedName}</b>` 
        : '';
      text += `• <b>${r.symbol}</b> | Score: ${score}\n  Entry: ₹${entry} | SL: ₹${sl} | Target: ₹${target}\n  RR: ${rr} | Signals: ${(r.signals || []).join(', ')}${optionStr}\n\n`;
    });

    text += `⚠️ Conflicts: ${totalConflict} | Avoid: ${avoid}\n`;
    text += `📊 Strong Signal: ${strongSignalCount} | Breakout: ${breakoutCount}\n`;

    // Uses default TELEGRAM_CHAT_ID (no chatId arg = personal BTST alert — unchanged)
    const result = await this.sendMessage(text);
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
      score: number;
      sector: string;
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
                token = settings.telegramToken; // Fallback to plain text
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

    const lines = stocks.map(s =>
      `🚀 <b>${s.symbol}</b> (${s.sector})\n` +
      `   LTP: ₹${s.ltp.toFixed(2)} | Score: ${s.score}\n` +
      `   Entry: ₹${s.entry.toFixed(2)} | SL: ₹${s.sl.toFixed(2)} | Target: ₹${s.target.toFixed(2)}\n` +
      `   RR: ${s.rr}`
    ).join('\n\n');

    const timeStr = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short'
    });

    const message =
      `⚡ <b>NEW BREAKOUT SIGNAL${stocks.length > 1 ? 'S' : ''}</b>\n` +
      `📅 ${timeStr} IST\n\n` +
      `${lines}\n\n` +
      `⚠️ NARROW CPR + Volume Spike + Price > TC. Verify before trading.`;

    return await this.sendMessage(message, chatId, overrideToken);
  }
}
