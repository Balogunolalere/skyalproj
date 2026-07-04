"use client";

import { useEffect, useState } from "react";

/* The Bed Readout — a fixed corner instrument that tracks the visitor's
   position on the page as a Y-axis coordinate on the cutting bed. It's the
   signature interaction: a small, real instrument, not decoration. Hidden
   on mobile and when the hero isn't yet scrolled past. */
export default function BedReadout() {
  const [y, setY] = useState(0);
  const [pct, setPct] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const sc = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setY(sc);
      setPct(max > 0 ? sc / max : 0);
      // appear once the hero is scrolled past ~120px
      setVisible(sc > 120);
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!visible) return null;

  // Format as a bed coordinate: 0000.0 mm, clamped to a plausible bed depth
  const bedMm = Math.min(1200, Math.round(y * 1.4));
  const coord = `${String(bedMm).padStart(4, "0")}.0`;

  return (
    <div
      className="fixed bottom-4 right-4 z-[90] hidden lg:block pointer-events-none select-none"
      aria-hidden="true"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translateY(${visible ? 0 : 8}px)`,
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      <div className="bg-leather/92 backdrop-blur-sm text-bone px-3.5 py-2.5 flex items-center gap-3">
        {/* Y-axis indicator */}
        <div className="relative w-[3px] h-9 bg-bone/20 overflow-hidden">
          <div
            className="absolute left-0 top-0 w-full bg-laser"
            style={{ height: `${Math.max(4, pct * 100)}%`, transition: "height 0.15s linear" }}
          />
        </div>
        <div className="font-mono text-[10px] leading-tight">
          <div className="text-bone/55 uppercase tracking-[0.16em]">Y-axis</div>
          <div className="text-bone tnum text-[13px] mt-0.5">{coord} <span className="text-bone/50">mm</span></div>
        </div>
        <div className="w-px h-7 bg-bone/15" />
        <div className="font-mono text-[10px] leading-tight">
          <div className="text-bone/55 uppercase tracking-[0.16em]">bed</div>
          <div className="text-laser tnum text-[13px] mt-0.5">{Math.round(pct * 100)}<span className="text-bone/50">%</span></div>
        </div>
      </div>
    </div>
  );
}
