import { CPRResult } from './cpr-engine';

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
  displayValue: 'HIGHER_VALUE' | 'LOWER_VALUE' | 'INSIDE_VALUE' | 'OUTSIDE_VALUE' | 'OVERLAPPING_HIGHER' | 'OVERLAPPING_LOWER' | 'OVERLAPPING_VALUE' | 'UNKNOWN';
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

  // 1. Outside Value: Tomorrow completely engulfs today
  if (tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc > todayCpr.tc) {
    displayValue = 'OUTSIDE_VALUE';
  } 
  // 2. Inside Value: Tomorrow is completely within today
  else if (isInsideValue) {
    displayValue = 'INSIDE_VALUE';
  }
  // 3. Higher Value: Strictly above (traditionally, entirely above today's CPR? Or just both higher? The prompt asks for Overlapping Higher if both are higher but not Higher Value. I'll make Higher Value = strictly above, and Overlapping Higher = both higher but overlapping).
  // Wait, if display is decoupled from legacy boolean, I can define displayValue Higher Value as tomorrow.bc > today.tc (strictly above).
  // Let's define Higher Value display as strictly above.
  else if (tomorrowCpr.bc > todayCpr.tc) {
    displayValue = 'HIGHER_VALUE';
  }
  // 4. Lower Value: Strictly below
  else if (tomorrowCpr.tc < todayCpr.bc) {
    displayValue = 'LOWER_VALUE';
  }
  // 5. Overlapping Higher: Partial overlap shifted upward
  // User definition: Tomorrow TC > Today TC, Tomorrow BC > Today BC, Not strictly Higher Value
  else if (tomorrowCpr.tc > todayCpr.tc && tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.bc <= todayCpr.tc) {
    displayValue = 'OVERLAPPING_HIGHER';
  }
  // 6. Overlapping Lower: Mirror image
  else if (tomorrowCpr.tc < todayCpr.tc && tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc >= todayCpr.bc) {
    displayValue = 'OVERLAPPING_LOWER';
  }
  else if (isOverlappingValue) {
    displayValue = 'OVERLAPPING_VALUE';
  }

  // Fallback if none match (should be impossible in theory)
  if (displayValue === 'UNKNOWN') {
    if (isHigherValue) displayValue = 'HIGHER_VALUE';
    else if (isLowerValue) displayValue = 'LOWER_VALUE';
    else if (isInsideValue) displayValue = 'INSIDE_VALUE';
    else if (isOverlappingValue) displayValue = 'OVERLAPPING_VALUE';
  }

  return {
    isInsideValue,
    isHigherValue,
    isLowerValue,
    isOverlappingValue,
    displayValue
  };
}
