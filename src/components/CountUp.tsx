import { useEffect, useState } from "react";
import { useInView } from "./Reveal";

interface CountUpProps {
  to: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
}

/** Counts from 0 to `to` the first time it scrolls into view. */
export default function CountUp({ to, decimals = 0, suffix = "", duration = 1400 }: CountUpProps) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.4);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setValue(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref}>
      {value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
