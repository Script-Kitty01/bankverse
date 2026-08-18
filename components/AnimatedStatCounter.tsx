"use client";

/**
 * BankVerse — Animated Stat Counter
 *
 * Animates a numeric value from 0 to the target using requestAnimationFrame
 * with an ease-out cubic curve. Re-triggers when the value changes.
 */

import { useState, useEffect, useRef } from "react";

interface AnimatedStatCounterProps {
  value: number;
  suffix?: string;
  decimals?: number;
  className?: string;
  duration?: number;
}

export default function AnimatedStatCounter({
  value,
  suffix = "",
  decimals = 0,
  className = "",
  duration = 800,
}: AnimatedStatCounterProps) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    const startTime = performance.now();

    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = start + (end - start) * eased;

      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevValue.current = end;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();

  return (
    <span className={className}>
      {formatted}
      {suffix}
    </span>
  );
}
