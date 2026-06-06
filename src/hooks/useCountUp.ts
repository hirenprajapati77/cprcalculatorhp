'use client';

import { useEffect, useState, useRef } from 'react';

/**
 * Animates a number from its previous value to the target value.
 * Uses a cubic ease-out animation curve.
 */
export function useCountUp(target: number, duration: number = 500): number {
  const [count, setCount] = useState(target);
  const prevTargetRef = useRef(target);

  useEffect(() => {
    const startValue = prevTargetRef.current;
    const endValue = target;
    prevTargetRef.current = target;

    if (startValue === endValue) {
      setCount(target);
      return;
    }

    let startTimestamp: number | null = null;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      
      // Cubic ease-out curve
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * ease;
      
      setCount(currentValue);

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
      } else {
        setCount(endValue); // Ensure precise final state
      }
    };

    animationFrameId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [target, duration]);

  return count;
}
export default useCountUp;
