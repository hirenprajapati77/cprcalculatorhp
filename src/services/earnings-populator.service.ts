import { prisma } from '@/lib/db';
import { MarketService } from '@/services/market.service';
import { TelegramService } from '@/services/alert/telegram.service';
import YahooFinance from 'yahoo-finance2';

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

function parseNseDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  const day = parts[0].padStart(2, '0');
  const monthStr = parts[1];
  const year = parts[2];
  const month = MONTH_MAP[monthStr];
  if (!month) return '';
  return `${year}-${month}-${day}`;
}

export class EarningsPopulatorService {
  static async populate(dryRun = false): Promise<{ success: boolean; nseCount: number; yahooCount: number; errors: string[] }> {
    const errors: string[] = [];
    let nseCount = 0;
    let yahooCount = 0;

    const fnoStocks = MarketService.getUniverse('NSE_FNO');
    const fnoSymbols = new Set(fnoStocks.map(s => s.symbol.trim()));
    const populatedSymbols = new Set<string>();

    const yahoo = new YahooFinance();

    // 1. Fetch from NSE Corporate Announcements/Event Calendar with Cookie Bootstrap
    try {
      console.log('[EarningsPopulator] Fetching NSE homepage to bootstrap session cookies...');
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/'
      };

      const homeRes = await fetch('https://www.nseindia.com/', { headers });
      const headersAny = homeRes.headers as Headers & { getSetCookie?: () => string[] };
      const rawCookies = typeof headersAny.getSetCookie === 'function'
        ? headersAny.getSetCookie()
        : [];
      const fallbackSetCookie = homeRes.headers.get('set-cookie');
      const cookieStr = rawCookies.length > 0
        ? rawCookies.map(c => c.split(';')[0]).join('; ')
        : (fallbackSetCookie ?? '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
            .map(c => c.split(';')[0])
            .join('; ');

      const apiHeaders = {
        ...headers,
        'Accept': '*/*',
        'Cookie': cookieStr
      };

      console.log('[EarningsPopulator] Fetching NSE Event Calendar API...');
      const res = await fetch('https://www.nseindia.com/api/event-calendar', { headers: apiHeaders });
      if (!res.ok) {
        throw new Error(`NSE API returned status ${res.status}`);
      }

      const events = await res.json();
      if (Array.isArray(events)) {
        const totalNseEvents = events.length;
        console.log(`[EarningsPopulator] NSE Event Calendar API returned ${totalNseEvents} total events.`);
        
        // Threshold check to detect blocks or empty responses
        if (totalNseEvents < 20) {
          throw new Error(`NSE returned suspiciously few events (${totalNseEvents}) — likely blocked or empty.`);
        }

        for (const event of events) {
          const symbol = (event.symbol || '').trim();
          const purpose = (event.purpose || '').toLowerCase();
          
          // We look for Financial Results board meetings
          if (fnoSymbols.has(symbol) && purpose.includes('results')) {
            const dbDate = parseNseDate(event.date);
            if (!dbDate) continue;

            if (!dryRun) {
              await prisma.marketEvent.upsert({
                where: {
                  symbol_date_eventType: {
                    symbol,
                    date: dbDate,
                    eventType: 'EARNINGS'
                  }
                },
                update: {
                  impact: 'HIGH',
                  source: 'NSE',
                  eventStatus: 'CONFIRMED'
                },
                create: {
                  symbol,
                  date: dbDate,
                  eventType: 'EARNINGS',
                  impact: 'HIGH',
                  source: 'NSE',
                  eventStatus: 'CONFIRMED'
                }
              });
            }

            populatedSymbols.add(symbol);
            nseCount++;
          }
        }
        console.log(`[EarningsPopulator] NSE: Matched ${nseCount} F&O results events out of ${totalNseEvents} total.`);
      } else {
        throw new Error('NSE Event Calendar response is not an array');
      }
    } catch (err) {
      console.error('[EarningsPopulator] NSE Populate failed:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`NSE Error: ${errMsg}`);
    }

    // 2. Fallback to Yahoo Finance for symbols not found in NSE
    const missingSymbols = Array.from(fnoSymbols).filter(s => !populatedSymbols.has(s));
    console.log(`[EarningsPopulator] ${missingSymbols.length} symbols missing from NSE. Fetching fallback via Yahoo Finance...`);

    const chunkSize = 10;
    for (let i = 0; i < missingSymbols.length; i += chunkSize) {
      const chunk = missingSymbols.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (symbol) => {
        try {
          const yfSymbol = `${symbol}.NS`;
          const quote = await yahoo.quoteSummary(yfSymbol, { modules: ['calendarEvents'] });
          
          const earnings = quote.calendarEvents?.earnings;
          const earningsDates = earnings?.earningsDate;
          
          if (Array.isArray(earningsDates) && earningsDates.length > 0) {
            const rawDate = earningsDates[0];
            if (rawDate) {
              const dateObj = new Date(rawDate);
              if (!isNaN(dateObj.getTime())) {
                const dbDate = dateObj.toISOString().split('T')[0];
                const isEstimate = earnings?.isEarningsDateEstimate ?? false;
                const eventStatus = isEstimate ? 'ESTIMATED' : 'CONFIRMED';

                if (!dryRun) {
                  await prisma.marketEvent.upsert({
                    where: {
                      symbol_date_eventType: {
                        symbol,
                        date: dbDate,
                        eventType: 'EARNINGS'
                      }
                    },
                    update: {
                      impact: 'HIGH',
                      source: 'YAHOO',
                      eventStatus
                    },
                    create: {
                      symbol,
                      date: dbDate,
                      eventType: 'EARNINGS',
                      impact: 'HIGH',
                      source: 'YAHOO',
                      eventStatus
                    }
                  });
                }

                yahooCount++;
              }
            }
          }
        } catch (err) {
          // Log individual symbols but don't fail the populator
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[EarningsPopulator] Yahoo fallback failed for ${symbol}:`, errMsg);
        }
      }));
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const success = errors.length === 0;

    if (!success && !dryRun) {
      // Use <b> for HTML formatting in Telegram messages
      const alertMsg = `🚨 <b>Earnings Populator Failure Alert</b> 🚨\nNSE Count: ${nseCount}\nErrors:\n${errors.join('\n')}`;
      try {
        await TelegramService.sendMessage(alertMsg);
      } catch (tgErr) {
        console.error('[EarningsPopulator] Failed to send Telegram alert:', tgErr);
      }
    }

    console.log(`[EarningsPopulator] Completed populating. NSE: ${nseCount}, Yahoo: ${yahooCount}`);
    return {
      success,
      nseCount,
      yahooCount,
      errors
    };
  }
}
