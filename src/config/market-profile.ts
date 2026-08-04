/**
 * Market Session Profile — CAS future-proofing (zero CONTINUOUS drift).
 *
 * SEBI circular HO/47/11/11(3)2025-MRD-POD2/I/2765/2026 (16 Jan 2026).
 * CAS effective 2026-08-03 for cash stocks with derivative contracts.
 *
 * Default profile CONTINUOUS = exact production clocks today.
 * CLOSING_AUCTION is dormant until MARKET_PROFILE=CLOSING_AUCTION.
 *
 * Eligibility uses MarketSessionResolver.supportsClosingAuction(symbol) —
 * not a hardcoded casAppliesToFnOOnly flag — so SEBI can expand CAS
 * (ETFs / large-caps / entire cash) by changing one function body.
 */

export type MarketProfileId = 'CONTINUOUS' | 'CLOSING_AUCTION';

export type IstClock = { hour: number; minute: number };

export interface MarketProfile {
  id: MarketProfileId;
  preOpen: IstClock;
  cashOpen: IstClock;
  /** Exclusive end of continuous cash trading / isMarketOpen under this profile. */
  cashContinuousEnd: IstClock;
  /** CAS matching complete / official close knowable (CLOSING_AUCTION only). */
  casEnd: IstClock;
  officialClose: IstClock;
  discoveryStart: IstClock;
  discoveryEndExclusive: IstClock;
  /** BTST confirm/ACTIVE slice start (CONTINUOUS=15:15; CAS=15:10 = discovery start). */
  confirmStart: IstClock;
  rule5Start: IstClock;
  rule5EndExclusive: IstClock;
  btstJournalStart: IstClock;
  btstJournalEndInclusive: IstClock;
  cprJournalStartHhmm: number;
  cprJournalEndHhmm: number;
  fnoSessionEnd: IstClock;
  /** Documented SEBI post-close; unused in v1 helpers. */
  postCloseStart: IstClock;
  postCloseEnd: IstClock;
  freezeBreakoutsAfterContinuousEnd: boolean;
}

/**
 * Per-symbol session context. Prefer passing this into helpers over
 * checking multiple booleans at each call site.
 */
export interface MarketSessionContext {
  symbol: string;
  isFnO: boolean;
  /** True when this symbol should follow CAS clocks under the active profile. */
  supportsClosingAuction: boolean;
  profile: MarketProfileId;
}

const CONTINUOUS_PROFILE: MarketProfile = {
  id: 'CONTINUOUS',
  preOpen: { hour: 9, minute: 0 },
  cashOpen: { hour: 9, minute: 15 },
  cashContinuousEnd: { hour: 15, minute: 30 },
  casEnd: { hour: 15, minute: 30 },
  officialClose: { hour: 15, minute: 30 },
  discoveryStart: { hour: 15, minute: 10 },
  discoveryEndExclusive: { hour: 15, minute: 25 },
  confirmStart: { hour: 15, minute: 15 },
  rule5Start: { hour: 15, minute: 15 },
  rule5EndExclusive: { hour: 15, minute: 30 },
  btstJournalStart: { hour: 15, minute: 25 },
  btstJournalEndInclusive: { hour: 15, minute: 30 },
  cprJournalStartHhmm: 1520,
  cprJournalEndHhmm: 1524,
  fnoSessionEnd: { hour: 15, minute: 30 },
  postCloseStart: { hour: 15, minute: 50 },
  postCloseEnd: { hour: 16, minute: 0 },
  freezeBreakoutsAfterContinuousEnd: false,
};

/** SEBI-locked CAS clocks — only active when MARKET_PROFILE=CLOSING_AUCTION. */
const CLOSING_AUCTION_PROFILE: MarketProfile = {
  id: 'CLOSING_AUCTION',
  preOpen: { hour: 9, minute: 0 },
  cashOpen: { hour: 9, minute: 15 },
  cashContinuousEnd: { hour: 15, minute: 15 },
  casEnd: { hour: 15, minute: 35 },
  officialClose: { hour: 15, minute: 35 },
  discoveryStart: { hour: 15, minute: 10 },
  discoveryEndExclusive: { hour: 15, minute: 15 },
  confirmStart: { hour: 15, minute: 10 },
  rule5Start: { hour: 15, minute: 0 },
  rule5EndExclusive: { hour: 15, minute: 15 },
  btstJournalStart: { hour: 15, minute: 38 },
  btstJournalEndInclusive: { hour: 15, minute: 40 },
  /** After CAS uncross; ends before BTST journal to avoid option-chain stampede. */
  cprJournalStartHhmm: 1535,
  cprJournalEndHhmm: 1537,
  fnoSessionEnd: { hour: 15, minute: 40 },
  postCloseStart: { hour: 15, minute: 50 },
  postCloseEnd: { hour: 16, minute: 0 },
  freezeBreakoutsAfterContinuousEnd: true,
};

export const MARKET_PROFILES: Record<MarketProfileId, MarketProfile> = {
  CONTINUOUS: CONTINUOUS_PROFILE,
  CLOSING_AUCTION: CLOSING_AUCTION_PROFILE,
};

export function resolveMarketProfile(id?: string | null): MarketProfile {
  const key = (id ?? 'CONTINUOUS').trim().toUpperCase();
  if (key === 'CLOSING_AUCTION') return MARKET_PROFILES.CLOSING_AUCTION;
  return MARKET_PROFILES.CONTINUOUS;
}

let cachedActiveProfile: MarketProfile | null = null;

/**
 * Active profile from env (resolved once per process).
 * Unknown / missing → CONTINUOUS (backward compatible).
 */
export function getActiveMarketProfile(): MarketProfile {
  if (cachedActiveProfile) return cachedActiveProfile;
  cachedActiveProfile = resolveMarketProfile(process.env.MARKET_PROFILE);
  return cachedActiveProfile;
}

/** Test-only: reset cache or force a profile id before importing dependent modules. */
export function __resetActiveMarketProfileForTests(id?: MarketProfileId | null): void {
  cachedActiveProfile = id == null ? null : resolveMarketProfile(id);
}

/**
 * Phase-1 CAS eligibility: F&O cash names only (SEBI 4.1).
 * Replace this body when SEBI expands to ETFs / large-caps / entire cash —
 * no other architecture change required.
 */
export function supportsClosingAuction(
  _symbol: string,
  opts?: { isFnO?: boolean; profileId?: MarketProfileId }
): boolean {
  const profileId = opts?.profileId ?? getActiveMarketProfile().id;
  if (profileId !== 'CLOSING_AUCTION') return false;
  return opts?.isFnO === true;
}

export class MarketSessionResolver {
  static supportsClosingAuction(
    symbol: string,
    opts?: { isFnO?: boolean; profileId?: MarketProfileId }
  ): boolean {
    return supportsClosingAuction(symbol, opts);
  }

  static resolve(
    symbol: string,
    opts?: { isFnO?: boolean; profileId?: MarketProfileId }
  ): MarketSessionContext {
    const profileId = opts?.profileId ?? getActiveMarketProfile().id;
    const isFnO = opts?.isFnO === true;
    return {
      symbol: symbol.trim(),
      isFnO,
      supportsClosingAuction: supportsClosingAuction(symbol, { isFnO, profileId }),
      profile: profileId,
    };
  }
}

/** Clocks to use for a given context (ineligible symbols keep CONTINUOUS cash day). */
export function clocksForContext(ctx?: MarketSessionContext | null): MarketProfile {
  const active = getActiveMarketProfile();
  const profileId = ctx?.profile ?? active.id;
  if (profileId !== 'CLOSING_AUCTION') return MARKET_PROFILES.CONTINUOUS;
  if (ctx && !ctx.supportsClosingAuction) return MARKET_PROFILES.CONTINUOUS;
  return MARKET_PROFILES.CLOSING_AUCTION;
}

export function toProfileTotalMinutes(clock: IstClock): number {
  return clock.hour * 60 + clock.minute;
}
