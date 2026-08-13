import { BREAKOUT_VIX } from '@/config/trading-constants';
import type { IndiaVixState } from '@/services/overnight/index-discover.service';
import type { BreakoutScanResult } from '@/services/alert/breakout-watcher.service';

export type BreakoutVixGateReason = 'VIX_ELEVATED' | 'VIX_TIGHTEN_SCORE';

export type BreakoutVixPolicy = {
  pauseAll: boolean;
  /** Tighter entry-chase cap (%) for price gate; null = default 3.5%. */
  entryExtensionPct: number | null;
  /** Minimum scanner score in tighten band; null = no score floor. */
  minScore: number | null;
  vixClose: number | null;
  regimeLabel: 'pause' | 'tighten' | 'calm' | 'unknown';
};

export function resolveBreakoutVixPolicy(vixState: IndiaVixState): BreakoutVixPolicy {
  const vixClose = vixState.latestClose;

  if (
    vixState.elevated ||
    (vixClose != null && vixClose >= BREAKOUT_VIX.PAUSE_ALERTS_MIN)
  ) {
    return {
      pauseAll: true,
      entryExtensionPct: null,
      minScore: null,
      vixClose,
      regimeLabel: 'pause',
    };
  }

  if (vixClose != null && vixClose >= BREAKOUT_VIX.TIGHTEN_MIN) {
    return {
      pauseAll: false,
      entryExtensionPct: BREAKOUT_VIX.TIGHTENED_ENTRY_EXTENSION_PCT,
      minScore: BREAKOUT_VIX.TIGHTEN_MIN_SCORE,
      vixClose,
      regimeLabel: 'tighten',
    };
  }

  if (vixClose != null) {
    return {
      pauseAll: false,
      entryExtensionPct: null,
      minScore: null,
      vixClose,
      regimeLabel: 'calm',
    };
  }

  return {
    pauseAll: false,
    entryExtensionPct: null,
    minScore: null,
    vixClose: null,
    regimeLabel: 'unknown',
  };
}

export type BreakoutVixGateResult = {
  actionable: BreakoutScanResult[];
  suppressed: Array<
    BreakoutScanResult & { gateReason: BreakoutVixGateReason; gateDetail: string }
  >;
  policy: BreakoutVixPolicy;
};

/**
 * Session-wide India VIX gate for automated breakout Telegram alerts.
 * - VIX >= PAUSE_ALERTS_MIN (25): suppress all alerts
 * - VIX >= TIGHTEN_MIN (18): require higher score; price gate uses tighter chase cap
 * 
 * INTENTIONAL — symmetric pause/tighten across LONG and SHORT is reviewed.
 * Do NOT make asymmetric without explicit owner approval.
 * See docs/decisions/vix-gate-direction-2026-08-13.md.
 * Note: Revisit once real elevated-VIX trade data exists in the journal.
 */
export function filterBreakoutsForVixRegime(
  breakouts: BreakoutScanResult[],
  vixState: IndiaVixState
): BreakoutVixGateResult {
  const policy = resolveBreakoutVixPolicy(vixState);
  const actionable: BreakoutScanResult[] = [];
  const suppressed: BreakoutVixGateResult['suppressed'] = [];

  if (policy.pauseAll) {
    const detail =
      `India VIX ${policy.vixClose?.toFixed(2) ?? 'elevated'} — ` +
      `automated breakout alerts paused (>= ${BREAKOUT_VIX.PAUSE_ALERTS_MIN})`;
    for (const b of breakouts) {
      suppressed.push({ ...b, gateReason: 'VIX_ELEVATED', gateDetail: detail });
    }
    return { actionable, suppressed, policy };
  }

  for (const b of breakouts) {
    if (policy.minScore != null && (b.score ?? 0) < policy.minScore) {
      suppressed.push({
        ...b,
        gateReason: 'VIX_TIGHTEN_SCORE',
        gateDetail:
          `India VIX ${policy.vixClose?.toFixed(2)} — score ${b.score ?? 0} < ` +
          `min ${policy.minScore} (tighten band >= ${BREAKOUT_VIX.TIGHTEN_MIN})`,
      });
      continue;
    }
    actionable.push(b);
  }

  return { actionable, suppressed, policy };
}
