import { BtstScoreResultEnriched } from '../backtest/btst.service';

export class TelegramService {
  static async sendMessage(text: string, chatId?: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const resolvedChatId = chatId || process.env.TELEGRAM_CHAT_ID;

    if (!token || !resolvedChatId) {
      console.warn('[Telegram] Bot token or chat ID not configured. Skipping alert.');
      return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: resolvedChatId,
        text,
        parse_mode: 'HTML'
      })
    });

    if (!response.ok) {
      console.error('[Telegram] Failed to send message:', await response.text());
    }
  }

  static async sendBtstAlert(results: BtstScoreResultEnriched[]): Promise<void> {
    const longs = results.filter(r => r.tag === 'LONG' && Math.max(r.longScore, r.shortScore) >= 70);
    const shorts = results.filter(r => r.tag === 'SHORT' && Math.max(r.longScore, r.shortScore) >= 70);

    const strongSignalCount = results.filter(r => r.signals && r.signals.some(s => s.includes('STRONG') || s.includes('BREAKOUT') || s.includes('HIGHER_VALUE') || s.includes('LOWER_VALUE'))).length;
    const breakoutCount = results.filter(r => r.signals && r.signals.includes('BREAKOUT')).length;

    const totalConflict = results.filter(r => r.tag === 'NEUTRAL_CONFLICT').length;
    const avoid = results.filter(r => Math.max(r.longScore, r.shortScore) < 30).length;

    // Only send if strongSignal > 0 OR breakoutReady > 2
    if (strongSignalCount === 0 && breakoutCount <= 2 && longs.length === 0 && shorts.length === 0) {
      console.log('[Telegram] No strong setups found. Skipping BTST alert.');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' });

    let text = `🚨 <b>CPR PRO — BTST/STBT ALERT</b>\n📅 ${dateStr} | ⏰ 15:20 IST\n\n`;

    text += `🟢 <b>LONG SETUPS (${longs.length})</b>\n`;
    if (longs.length === 0) text += `<i>None</i>\n`;
    longs.forEach(r => {
      const entry = r.entry.toFixed(2);
      const sl = r.sl.toFixed(2);
      const target = r.target.toFixed(2);
      const rr = r.rr;
      const score = Math.max(r.longScore, r.shortScore);
      text += `• <b>${r.symbol}</b> | Score: ${score}\n  Entry: ₹${entry} | SL: ₹${sl} | Target: ₹${target}\n  RR: ${rr} | Signals: ${(r.signals || []).join(', ')}\n\n`;
    });

    text += `🔴 <b>SHORT SETUPS (${shorts.length})</b>\n`;
    if (shorts.length === 0) text += `<i>None</i>\n`;
    shorts.forEach(r => {
      const entry = r.entry.toFixed(2);
      const sl = r.sl.toFixed(2);
      const target = r.target.toFixed(2);
      const rr = r.rr;
      const score = Math.max(r.longScore, r.shortScore);
      text += `• <b>${r.symbol}</b> | Score: ${score}\n  Entry: ₹${entry} | SL: ₹${sl} | Target: ₹${target}\n  RR: ${rr} | Signals: ${(r.signals || []).join(', ')}\n\n`;
    });

    text += `⚠️ Conflicts: ${totalConflict} | Avoid: ${avoid}\n`;
    text += `📊 Strong Signal: ${strongSignalCount} | Breakout: ${breakoutCount}\n`;

    // Uses default TELEGRAM_CHAT_ID (no chatId arg = personal BTST alert — unchanged)
    await this.sendMessage(text);
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
    }>
  ): Promise<void> {
    if (!stocks.length) return;

    const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
    if (!chatId) {
      console.warn('[Telegram] TELEGRAM_GROUP_CHAT_ID not set, skipping breakout alert');
      return;
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

    await this.sendMessage(message, chatId);
  }
}
