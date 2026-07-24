"use client";

import { Logo } from "./Logo";
import { type ViewId } from "./data";
import { Facebook, Instagram } from "lucide-react";

/* The footer's top edge is a laser-cut jagged line — the kerf where
   the beam parted the material. Earned: it's the literal shape of a cut. */
function CutEdge({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 28"
      preserveAspectRatio="none"
      className={`w-full h-5 sm:h-7 ${className}`}
      aria-hidden="true"
    >
      <path
        d="M0,28 L30,2 L60,28 L90,2 L120,28 L150,2 L180,28 L210,2 L240,28 L270,2 L300,28 L330,2 L360,28 L390,2 L420,28 L450,2 L480,28 L510,2 L540,28 L570,2 L600,28 L630,2 L660,28 L690,2 L720,28 L750,2 L780,28 L810,2 L840,28 L870,2 L900,28 L930,2 L960,28 L990,2 L1020,28 L1050,2 L1080,28 L1110,2 L1140,28 L1170,2 L1200,28 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function Footer({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const year = new Date().getFullYear();
  const go = (v: ViewId) => onNavigate(v);

  return (
    <footer className="relative mt-auto leather-surface grain text-bone">
      {/* Laser-cut top edge — bone-coloured, sitting on the leather */}
      <div className="text-bone -mb-px">
        <CutEdge className="text-bone" />
      </div>

      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pt-14 sm:pt-20 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-14">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Logo className="text-[2.2rem] -mb-1" onDark />
            <p className="text-sm text-bone/70 mt-5 leading-relaxed max-w-[260px]">
              Precision laser cutting for fabrics, leather &amp; more. Your
              designs, cut on the beam, tracked to your door.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <a
                href="https://facebook.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Skyal on Facebook"
                className="w-9 h-9 flex items-center justify-center border border-bone/25 text-bone/80 hover:text-bone hover:border-bone transition-colors"
              >
                <Facebook className="w-4 h-4" strokeWidth={1.5} />
              </a>
              <a
                href="https://instagram.com/skyal_laser_services"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Skyal on Instagram"
                className="w-9 h-9 flex items-center justify-center border border-bone/25 text-bone/80 hover:text-bone hover:border-bone transition-colors"
              >
                <Instagram className="w-4 h-4" strokeWidth={1.5} />
              </a>
            </div>
          </div>

          {/* Pages */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone/50 mb-5">
              Pages
            </div>
            <ul className="space-y-2.5 text-sm text-bone/80">
              <li><button onClick={() => go("home")} className="hover:text-laser transition-colors">Home</button></li>
              <li><button onClick={() => go("order")} className="hover:text-laser transition-colors">Order</button></li>
              <li><button onClick={() => go("track")} className="hover:text-laser transition-colors">Track</button></li>
              <li><button onClick={() => go("dashboard")} className="hover:text-laser transition-colors">Dashboard</button></li>
              <li><button onClick={() => go("chat")} className="hover:text-laser transition-colors">Support</button></li>
              <li><button onClick={() => go("contact")} className="hover:text-laser transition-colors">Contact</button></li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone/50 mb-5">
              Services
            </div>
            <ul className="space-y-2.5 text-sm text-bone/80">
              <li><button onClick={() => go("home")} className="hover:text-laser transition-colors">Laser Cutting</button></li>
              <li><button onClick={() => go("home")} className="hover:text-laser transition-colors">Material Cutting</button></li>
              <li><button onClick={() => go("track")} className="hover:text-laser transition-colors">Order Tracking</button></li>
              <li><button onClick={() => go("home")} className="hover:text-laser transition-colors">Smart Scheduling</button></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone/50 mb-5">
              Company
            </div>
            <ul className="space-y-2.5 text-sm text-bone/80">
              <li><button onClick={() => go("contact")} className="hover:text-laser transition-colors">Contact</button></li>
              <li><button onClick={() => go("terms")} className="hover:text-laser transition-colors">Terms</button></li>
              <li><button onClick={() => go("privacy")} className="hover:text-laser transition-colors">Privacy</button></li>
              <li><button onClick={() => go("delivery")} className="hover:text-laser transition-colors">Delivery</button></li>
              <li><button onClick={() => go("refund")} className="hover:text-laser transition-colors">Refunds</button></li>
              <li><button onClick={() => go("cancellation")} className="hover:text-laser transition-colors">Cancellation</button></li>
            </ul>
          </div>
        </div>

        {/* Materials marquee strip */}
        <div className="mt-12 border-t border-bone/15 pt-6 overflow-hidden">
          <div className="flex gap-8 font-display italic text-bone/30 text-lg whitespace-nowrap animate-[marquee_28s_linear_infinite]">
            {[
              "cotton", "silk", "denim", "leather", "ankara", "aso-oke",
              "lace", "plywood", "acrylic", "felt", "suede", "linen",
              "cotton", "silk", "denim", "leather", "ankara", "aso-oke",
              "lace", "plywood", "acrylic", "felt", "suede", "linen",
            ].map((m, i) => (
              <span key={i} className="flex items-center gap-8">
                {m}
                <span className="w-1.5 h-1.5 bg-laser rounded-full" />
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs text-bone/50">
          <div>© {year} Skyal Laser Services. Cut on the beam, in Lagos.</div>
          <div className="flex gap-6">
            <button onClick={() => go("privacy")} className="hover:text-bone transition-colors">Privacy</button>
            <button onClick={() => go("terms")} className="hover:text-bone transition-colors">Terms</button>
            <button onClick={() => go("delivery")} className="hover:text-bone transition-colors">Delivery</button>
            <button onClick={() => go("refund")} className="hover:text-bone transition-colors">Refunds</button>
            <button onClick={() => go("cancellation")} className="hover:text-bone transition-colors">Cancellation</button>
          </div>
        </div>
      </div>

      <style>{`@keyframes marquee{to{transform:translateX(-50%)}}`}</style>
    </footer>
  );
}
