# Deferred Feature Implementation Notes

This document provides the exact formulas, boundary conditions, and worked examples for the five features deferred from the CPR Enhancement phase. **No code has been written against these definitions in the active repository.** They remain deferred pending explicit approval.

---

## 1. Outside Value CPR
**Definition:** Tomorrow's Central Pivot Range completely engulfs Today's Central Pivot Range.
- **Formula:** `(Tomorrow BC < Today BC) AND (Tomorrow TC > Today TC)`
- **Boundary Condition:** Must be strictly greater/lesser on both sides. If `Tomorrow BC == Today BC`, it is NOT an Outside Value.
- **Worked Example:**
  - **Today:** BC = 100, TC = 105
  - **Tomorrow:** BC = 95, TC = 110
  - *Result:* `95 < 100 AND 110 > 105` → **TRUE** (Outside Value)

---

## 2. Overlapping Higher
**Definition:** Tomorrow's CPR is shifted upward relative to Today's CPR but still maintains some overlap (Tomorrow's BC is not strictly above Today's TC).
- **Formula:** `(Tomorrow TC > Today TC) AND (Tomorrow BC > Today BC) AND (Tomorrow BC <= Today TC)`
- **Boundary Condition:** If `Tomorrow BC > Today TC`, it becomes strictly "Higher Value". If `Tomorrow BC <= Today BC`, it fails the upward shift requirement.
- **Worked Example:**
  - **Today:** BC = 100, TC = 105
  - **Tomorrow:** BC = 102, TC = 108
  - *Result:* `108 > 105 AND 102 > 100 AND 102 <= 105` → **TRUE** (Overlapping Higher)

---

## 3. Overlapping Lower
**Definition:** Tomorrow's CPR is shifted downward relative to Today's CPR but still maintains some overlap (Tomorrow's TC is not strictly below Today's BC).
- **Formula:** `(Tomorrow TC < Today TC) AND (Tomorrow BC < Today BC) AND (Tomorrow TC >= Today BC)`
- **Boundary Condition:** If `Tomorrow TC < Today BC`, it becomes strictly "Lower Value".
- **Worked Example:**
  - **Today:** BC = 100, TC = 105
  - **Tomorrow:** BC = 95, TC = 102
  - *Result:* `102 < 105 AND 95 < 100 AND 102 >= 100` → **TRUE** (Overlapping Lower)

---

## 4. CPR Alignment
**Definition:** Compares Today's immediate CPR trend (Bullish, Bearish, Balanced) against the Weekly CPR trend to determine alignment.
- **Formula:** 
  1. Retrieve the true calendar-aligned Weekly CPR from the existing `mtf-cpr.service.ts` (resolving the initial rolling 5-day window duplication).
  2. Compare `Today's Trend` to `Weekly Trend`.
- **Boundary Condition:** 
  - If `Today's Trend == Weekly Trend`, it is `Fully Aligned`.
  - If one is `Balanced`, it is `Neutral/Partial Alignment`.
  - If they are opposite (`Bullish` vs `Bearish`), it is `Divergent`.
- **Worked Example:**
  - **Weekly CPR Result (from mtf-cpr.service.ts):** Trend = Bullish.
  - **Today CPR Result:** Trend = Bullish.
  - *Result:* `Bullish == Bullish` → **Aligned**

---

## 5. CPR Quality Grading (A+, A, B, C)
**Definition:** A heuristic grading system that assigns an A-C letter grade to the setup quality based on weighted criteria (Width, Relationship, Virginity, Alignment).
- **Formula:** 
  - **Base Score = 0**
  - **Width (35 pts max):** Narrow = +35, Normal = +17.5, Wide = +0
  - **Relationship (30 pts max):** Higher/Lower = +30, Inside/Outside = +24, Overlapping = +15, Unknown = +0
  - **Virginity (15 pts max):** Is Virgin = +15, Non-Virgin = +0
  - **Alignment (20 pts max):** Aligned = +20, Neutral = +10, Divergent = +0
  - **Thresholds:** A+ (≥90), A (≥75), B (≥60), C (<60).
- **Boundary Condition:** Max score is 100.
- **Worked Example:**
  - Setup is NARROW (+35), HIGHER_VALUE (+30), NON-VIRGIN (+0), ALIGNED (+20).
  - *Total Score:* 35 + 30 + 0 + 20 = 85.
  - *Result:* 85 falls in the `≥75` bracket → **Grade: A**.
