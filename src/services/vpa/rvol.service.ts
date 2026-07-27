import { VPA_RVOL, VPA_COMPONENT_FLAGS } from '@/config/vpa.config';
import { computeRvol } from './vpa.math';

export function scoreVpaRvol(volume: number, avgVolume: number): { points: number; rvol: number | null; flag: string | null } {
  if (!VPA_COMPONENT_FLAGS.rvol) return { points: 0, rvol: null, flag: null };
  const rvol = computeRvol(volume, avgVolume);
  if (rvol === null) return { points: 0, rvol: null, flag: null };

  if (rvol >= VPA_RVOL.STRONG) {
    return { points: VPA_RVOL.STRONG_ADJ, rvol, flag: 'VPA_RVOL_STRONG' };
  }
  if (rvol >= VPA_RVOL.GOOD) {
    return { points: VPA_RVOL.GOOD_ADJ, rvol, flag: 'VPA_RVOL_GOOD' };
  }
  if (rvol < VPA_RVOL.WEAK) {
    return { points: VPA_RVOL.WEAK_PENALTY, rvol, flag: 'VPA_RVOL_WEAK' };
  }
  return { points: 0, rvol, flag: null };
}
