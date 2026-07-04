"use client";

import { useEffect, useRef } from "react";

/* Build a continuous 6-petal bloom path — the laser cuts each petal
   in sequence, travelling back through the centre between them.
   This reads as a real fabric appliqué cut path, not decoration. */
function buildBloomPath(cx: number, cy: number, R: number, petals = 6): string {
  const parts: string[] = [`M ${cx} ${cy}`];
  for (let i = 0; i < petals; i++) {
    const theta = (i / petals) * Math.PI * 2 - Math.PI / 2; // start pointing up
    const tipX = cx + R * Math.cos(theta);
    const tipY = cy + R * Math.sin(theta);
    // out along one edge of the petal
    const a1 = theta - 0.42;
    const a2 = theta - 0.17;
    const c1x = cx + R * 0.45 * Math.cos(a1);
    const c1y = cy + R * 0.45 * Math.sin(a1);
    const c2x = cx + R * 1.02 * Math.cos(a2);
    const c2y = cy + R * 1.02 * Math.sin(a2);
    // back along the other edge
    const a3 = theta + 0.17;
    const a4 = theta + 0.42;
    const c3x = cx + R * 1.02 * Math.cos(a3);
    const c3y = cy + R * 1.02 * Math.sin(a3);
    const c4x = cx + R * 0.45 * Math.cos(a4);
    const c4y = cy + R * 0.45 * Math.sin(a4);
    parts.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${tipX.toFixed(1)} ${tipY.toFixed(1)}`,
    );
    parts.push(
      `C ${c3x.toFixed(1)} ${c3y.toFixed(1)}, ${c4x.toFixed(1)} ${c4y.toFixed(1)}, ${cx} ${cy}`,
    );
  }
  parts.push("Z");
  return parts.join(" ");
}

const BLOOM = buildBloomPath(200, 200, 120, 6);

export default function LaserTrace() {
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;

    if (mq.matches) {
      // Static: fully cut, head at the end
      path.style.strokeDashoffset = "0";
      const p = path.getPointAtLength(len);
      if (dotRef.current) {
        dotRef.current.setAttribute("cx", String(p.x));
        dotRef.current.setAttribute("cy", String(p.y));
      }
      if (glowRef.current) {
        glowRef.current.setAttribute("cx", String(p.x));
        glowRef.current.setAttribute("cy", String(p.y));
      }
      return;
    }

    const duration = 4200;
    let start: number | null = null;
    let raf = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const e = ease(t);
      path.style.strokeDashoffset = String(len * (1 - e));
      const p = path.getPointAtLength(len * e);
      if (dotRef.current) {
        dotRef.current.setAttribute("cx", String(p.x));
        dotRef.current.setAttribute("cy", String(p.y));
      }
      if (glowRef.current) {
        glowRef.current.setAttribute("cx", String(p.x));
        glowRef.current.setAttribute("cy", String(p.y));
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg
      viewBox="0 0 400 400"
      className="w-full h-full"
      role="img"
      aria-label="A laser head tracing a six-petal bloom across a coordinate cutting bed"
    >
      <defs>
        <radialGradient id="laser-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6090E1" stopOpacity="0.85" />
          <stop offset="40%" stopColor="#6090E1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#6090E1" stopOpacity="0" />
        </radialGradient>
        <pattern id="bed-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="#C5B89E"
            strokeOpacity="0.45"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      {/* The cutting bed */}
      <rect x="0" y="0" width="400" height="400" fill="url(#bed-grid)" />

      {/* Axis ticks — top + left, like a real graph-paper readout */}
      <g stroke="#6E6852" strokeWidth="0.8" opacity="0.55">
        {[80, 160, 240, 320].map((p) => (
          <line key={`tx-${p}`} x1={p} y1={0} x2={p} y2={6} />
        ))}
        {[80, 160, 240, 320].map((p) => (
          <line key={`ty-${p}`} x1={0} y1={p} x2={6} y2={p} />
        ))}
      </g>

      {/* Bed registration crosses at the corners */}
      {[
        [20, 20],
        [380, 20],
        [20, 380],
        [380, 380],
      ].map(([x, y], i) => (
        <g key={i} stroke="#6E6852" strokeWidth="1.2" opacity="0.7">
          <line x1={x - 6} y1={y} x2={x + 6} y2={y} />
          <line x1={x} y1={y - 6} x2={x} y2={y + 6} />
        </g>
      ))}

      {/* Origin marker (0,0) */}
      <g opacity="0.75">
        <circle cx="20" cy="20" r="3" fill="none" stroke="#1C1714" strokeWidth="1.2" />
        <text x="28" y="18" fontFamily="ui-monospace, monospace" fontSize="9" fill="#6E6852">
          0,0
        </text>
      </g>

      {/* Corner marginalia — path length + kerf width, like a CAM header */}
      <g fontFamily="ui-monospace, monospace" fontSize="8" fill="#6E6852" opacity="0.7">
        <text x="370" y="14" textAnchor="end">X 0400</text>
        <text x="14" y="394">Y 0400</text>
      </g>

      {/* The cut path — drawn progressively by the tool head */}
      <path
        ref={pathRef}
        d={BLOOM}
        fill="none"
        stroke="#6090E1"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 5px rgba(96,144,225,0.5))" }}
      />

      {/* Faint full path ghost (so the destination is legible before it draws) */}
      <path
        d={BLOOM}
        fill="none"
        stroke="#6090E1"
        strokeOpacity="0.14"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Tool head glow */}
      <circle
        ref={glowRef}
        cx="200"
        cy="200"
        r="22"
        fill="url(#laser-glow)"
        className="animate-laser-pulse"
      />
      {/* Tool head dot */}
      <circle
        ref={dotRef}
        cx="200"
        cy="200"
        r="3.6"
        fill="#6090E1"
        style={{ filter: "drop-shadow(0 0 4px rgba(96,144,225,0.9))" }}
      />
    </svg>
  );
}
