import { OPTION_PCR } from '@/config/trading-constants';
import type { BreakoutScanResult } from '@/services/alert/breakout-watcher.service';
import type { OptionSuggestion } from '@/services/option-suggestion.service';

export type BreakoutPcrGateReason = 'PCR_CONTRADICTS';

export type BreakoutPcrGateResult = {
  actionable: BreakoutScanResult[];
  suppressed: Array<BreakoutScanResult & { gateReason: BreakoutPcrGateReason; gateDetail: string }>;
};

/**
 * True when chain PCR disagrees with the option side we would send.
 * CE + PCR < 0.8 (bearish) or PE + PCR > 1.2 (bullish). Neutral 0.8–1.2 is allowed.
 * Missing type/PCR fails open (do not suppress).
 */
export function optionPcrContradictsDirection(
  type: OptionSuggestion['type'] | undefined,
  pcr: number | undefined
): boolean {
  if (type !== 'CE' && type !== 'PE') return false;
  if (pcr == null || !Number.isFinite(pcr)) return false;
  if (type === 'CE') return pcr < OPTION_PCR.BEARISH_MAX;
  return pcr > OPTION_PCR.BULLISH_MIN;
}

/**
 * Post-enrichment gate: do not Telegram a CE on a bearish chain (or PE on a bullish chain).
 * Rows without a suggestion are kept so a chain outage still delivers the cash alert.
 */
export function filterBreakoutsForPcrAlignment(
  breakouts: BreakoutScanResult[]
): BreakoutPcrGateResult {
  const actionable: BreakoutScanResult[] = [];
  const suppressed: BreakoutPcrGateResult['suppressed'] = [];

  for (const b of breakouts) {
    const suggestion = b.optionSuggestion;
    if (!optionPcrContradictsDirection(suggestion?.type, suggestion?.pcr)) {
      actionable.push(b);
      continue;
    }
    const detail = `${suggestion?.type} vs chain PCR ${suggestion?.pcr}`;
    suppressed.push({ ...b, gateReason: 'PCR_CONTRADICTS', gateDetail: detail });
  }

  return { actionable, suppressed };
}
