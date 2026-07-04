"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, animate } from "framer-motion";

/* Deliberately sparing — NOT applied to every block. The SKILL warns
   that staggered scroll-reveal on everything reads as AI-generated.
   Use only on major section openings. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* Count-up — earned: a live counter on real stats. */
export function StatCounter({
  value,
  decimals = 0,
}: {
  value: number;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <span ref={ref} className="tnum">
      {display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

/* A coordinate chip — mono, marks a real position/label on the bed.
   `pos` is shown verbatim (e.g. "BED · 03" or "FAQ"). Earned when it
   encodes something true, never decorative numbering. */
export function Coord({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`coord ${className}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
        {children}
      </span>
    </span>
  );
}

/* Section heading — Fraunces display. No automatic accent; the caller
   decides where a periwinkle stop earns its place (most should not have one). */
export function Heading({
  children,
  className = "",
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag
      className={`font-display font-semibold text-ink leading-[1.05] tracking-[-0.01em] ${className}`}
    >
      {children}
    </Tag>
  );
}
