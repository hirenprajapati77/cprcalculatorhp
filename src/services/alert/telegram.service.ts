export interface BtstResult {
  symbol: string;
  score: number;
  direction: 'LONG' | 'SHORT';
  tc: number;
  bc: number;
  r1?: number;
  s1?: number;
  r2?: number;
  s2?: number;
  signals?: string[];
  breakoutReady?: boolean;
}

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

  static async sendBtstAlert(results: BtstResult[]): Promise<void> {
    const longs = results.filter(r => r.direction === 'LONG' && r.score >= 70);
    const shorts = results.filter(r => r.direction === 'SHORT' && r.score >= 70);

    const strongSignalCount = results.filter(r => r.signals && r.signals.some(s => s.includes('STRONG'))).length;
    const breakoutCount = results.filter(r => r.breakoutReady).length;
    
    // Total conflicts and avoids can be approximated or passed in
    const totalConflict = results.filter(r => r.signals && r.signals.includes('CONFLICT')).length;
    const avoid = results.filter(r => r.score < 30).length;

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
      const entry = r.tc.toFixed(2);
      const sl = r.bc.toFixed(2);
      const risk = Math.abs(r.tc - r.bc);
      const target = (r.r1 && risk > 0 && Math.abs(r.r1 - r.tc) / risk >= 1.5) ? r.r1.toFixed(2) : (r.r2 ? r.r2.toFixed(2) : 'N/A');
      const rr = risk > 0 && target !== 'N/A' ? (Math.abs(parseFloat(target) - parseFloat(entry)) / risk).toFixed(2) : 'N/A';
      
      text += `• <b>${r.symbol}</b> | Score: ${r.score}\n  Entry: ₹${entry} | SL: ₹${sl} | Target: ₹${target}\n  RR: ${rr} | Signals: ${(r.signals || []).join(', ')}\n\n`;
    });

    text += `🔴 <b>SHORT SETUPS (${shorts.length})</b>\n`;
    if (shorts.length === 0) text += `<i>None</i>\n`;
    shorts.forEach(r => {
      const entry = r.bc.toFixed(2);
      const sl = r.tc.toFixed(2);
      const risk = Math.abs(r.tc - r.bc);
      const target = (r.s1 && risk > 0 && Math.abs(parseFloat(entry) - r.s1) / risk >= 1.5) ? r.s1.toFixed(2) : (r.s2 ? r.s2.toFixed(2) : 'N/A');
      const rr = risk > 0 && target !== 'N/A' ? (Math.abs(parseFloat(entry) - parseFloat(target)) / risk).toFixed(2) : 'N/A';
      
      text += `• <b>${r.symbol}</b> | Score: ${r.score}\n  Entry: ₹${entry} | SL: ₹${sl} | Target: ₹${target}\n  RR: ${rr}\n\n`;
    });

    text += `⚠️ Conflicts: ${totalConflict} | Avoid: ${avoid}\n`;
    text += `📊 Strong Signal: ${strongSignalCount} | Breakout: ${breakoutCount}\n`;

    await this.sendMessage(text);
  }
}
