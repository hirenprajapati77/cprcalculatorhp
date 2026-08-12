import { IndexDiscoverService } from '@/services/overnight/index-discover.service';
import { NiftyHistoryService } from '@/services/overnight/nifty-history.service';
import { OvernightRiskService } from '@/services/overnight/overnight-risk.service';
import { RegimeService } from '@/services/overnight/regime.service';
import { MarketService } from '@/services/market.service';

/**
 * Release in-process memo maps after heavy cron jobs on the 1 GB Oracle VM.
 * Redis remains the durable cache; these maps are request/batch-scoped only.
 */
export function purgeInProcessCaches(reason: string): void {
  OvernightRiskService.clearCache();
  NiftyHistoryService.clearCache();
  RegimeService.clearCache();
  IndexDiscoverService.clearRequestMemo();
  MarketService.clearFyersQuoteCache();
  console.log(`[Memory] Purged in-process caches (${reason})`);
}
