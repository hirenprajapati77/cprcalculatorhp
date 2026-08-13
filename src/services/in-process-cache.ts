import { IndexDiscoverService } from '@/services/overnight/index-discover.service';
import { NiftyHistoryService } from '@/services/overnight/nifty-history.service';
import { OvernightRiskService } from '@/services/overnight/overnight-risk.service';
import { RegimeService } from '@/services/overnight/regime.service';
import { MarketService } from '@/services/market.service';
import { CacheService } from '@/services/cache.service';

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
  // M4b fix: also clear the L1 LRU cache in CacheService.
  // Without this the 200-entry memoryCache persists after heavy overnight crons,
  // defeating the purpose of this memory purge on the 1 GB Oracle VM.
  CacheService.clearL1();
  console.log(`[Memory] Purged in-process caches (${reason})`);
}
