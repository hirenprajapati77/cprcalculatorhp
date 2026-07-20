import { CPRResult } from '@/types/cpr.types';

export interface CprRelationship {
  /** Exact match to legacy logic for BTST compatibility */
  isInsideValue: boolean;
  /** Exact match to legacy logic for BTST compatibility */
  isHigherValue: boolean;
  /** Exact match to legacy logic for BTST compatibility */
  isLowerValue: boolean;
  /** Exact match to legacy logic for BTST compatibility */
  isOverlappingValue: boolean;
  
  /** Fine-grained classification for UI and analytics */
  displayValue: 'HIGHER_VALUE' | 'LOWER_VALUE' | 'INSIDE_VALUE' | 'OVERLAPPING_VALUE' | 'UNKNOWN';
}

export function compareCpr(todayCpr: Pick<CPRResult, 'tc' | 'bc'>, tomorrowCpr: Pick<CPRResult, 'tc' | 'bc'>): CprRelationship {
  // Legacy exact match definitions (do not modify!)
  const isInsideValue = tomorrowCpr.bc >= todayCpr.bc && tomorrowCpr.tc <= todayCpr.tc;
  const isHigherValue = tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc;
  const isLowerValue = tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc;
  const isOverlappingValue = !isInsideValue && !isHigherValue && !isLowerValue &&
                             tomorrowCpr.bc <= todayCpr.tc && tomorrowCpr.tc >= todayCpr.bc;

  // New fine-grained display definitions
  let displayValue: CprRelationship['displayValue'] = 'UNKNOWN';

  // 1:1 Mapping to Legacy Logic
  if (isHigherValue) {
    displayValue = 'HIGHER_VALUE';
  } else if (isLowerValue) {
    displayValue = 'LOWER_VALUE';
  } else if (isInsideValue) {
    displayValue = 'INSIDE_VALUE';
  } else if (isOverlappingValue) {
    displayValue = 'OVERLAPPING_VALUE';
  }

  return {
    isInsideValue,
    isHigherValue,
    isLowerValue,
    isOverlappingValue,
    displayValue
  };
}
