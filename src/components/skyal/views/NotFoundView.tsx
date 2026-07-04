"use client";

import { type ViewId } from "../data";
import { Coord } from "../primitives";
import { ArrowRight } from "lucide-react";

export default function NotFoundView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-24 lg:py-36 text-center">
      <Coord className="justify-center inline-flex">ERROR · 404</Coord>
      {/* A laser-cut "404" — the beam parted these numbers */}
      <h1 className="font-display font-semibold text-[7rem] sm:text-[11rem] lg:text-[14rem] leading-none text-ink tracking-tighter mt-4">
        4<span className="text-laser text-glow">0</span>4
      </h1>
      <p className="text-base text-thread max-w-[440px] mx-auto mt-4 leading-relaxed">
        This page isn&apos;t on the bed. It may have moved, or the URL has a
        typo. No hard feelings — let&apos;s get you back to cutting.
      </p>
      <div className="mt-10 flex justify-center gap-3 flex-wrap">
        <button
          onClick={() => onNavigate("home")}
          className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-7 py-3.5 hover:bg-laser hover:text-white transition-colors"
        >
          Back to home <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onNavigate("order")}
          className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-7 py-3.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
        >
          Start an order
        </button>
      </div>
    </div>
  );
}
