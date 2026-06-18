import { BtstScoreResultEnriched } from '../backtest/btst.service';

export class TelegramService {
  static async sendMessage(text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.warn('Telegram credentials not configured. Skipping alert.');
      return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML'
      })
    });

    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text());
    }
  }

  static async sendBtstAlert(results: BtstScoreResultEnriched[]): Promise<void> {
    const longs = results.filter(r => r.tag === 'LONG' && Math.max(r.longScore, r.shortScore) >= 70);
    const shorts = results.filter(r => r.tag === 'SHORT' && Math.max(r.longScore, r.shortScore) >= 70);

    const strongSignalCount = results.filter(r => r.signals && r.signals.some(s => s.includes('STRONG') || s.includes('BREAKOUT') || s.includes('HIGHER_VALUE') || s.includes('LOWER_VALUE'))).length;
    const breakoutCount = results.filter(r => r.signals && r.signals.includes('BREAKOUT')).length;
    
    // Total conflicts and avoids can be approximated or passed in
    const totalConflict = results.filter(r => r.tag === 'NEUTRAL_CONFLICT').length;
    const avoid = results.filter(r => Math.max(r.longScore, r.shortScore) < 30).length;

    // Only send if strongSignal > 0 OR breakoutReady > 2
    if (strongSignalCount === 0 && breakoutCount <= 2 && longs.length === 0 && shorts.length === 0) {
      console.log('No strong setups found. Skipping Telegram alert.');
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

    await this.sendMessage(text);
  }
}
