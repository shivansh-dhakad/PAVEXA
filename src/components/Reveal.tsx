import { useEffect, useRef, useState, type ReactNode } from "react";

export function useInView<T extends Element>(threshold = 0.15, rootMargin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, inView] as const;
}

interface RevealProps {
  children: ReactNode;
  /** Delay in ms, useful for staggering siblings. */
  delay?: number;
  variant?: "up" | "scale" | "fade";
  className?: string;
}

/** Fades/slides its children in the first time they scroll into view. */
export default function Reveal({ children, delay = 0, variant = "up", className = "" }: RevealProps) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-reveal={variant}
      data-visible={inView}
      className={className}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
