"use client";

import { useState } from "react";
import { Logo } from "./Logo";
import { NAV_ITEMS, type ViewId } from "./data";
import { Menu, X } from "lucide-react";

export default function Nav({
  view,
  onNavigate,
}: {
  view: ViewId;
  onNavigate: (v: ViewId) => void;
}) {
  const [open, setOpen] = useState(false);

  const go = (v: ViewId) => {
    onNavigate(v);
    setOpen(false);
  };

  return (
    <header className="fixed top-0 inset-x-0 z-[100] bg-bone/85 backdrop-blur-md border-b border-hairline">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
        {/* Wordmark */}
        <button
          onClick={() => go("home")}
          className="text-[1.7rem] leading-none hover:opacity-80 transition-opacity -mb-1"
          aria-label="Skyal home"
        >
          <Logo />
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={`px-3 py-2 text-sm transition-colors relative ${
                view === item.id
                  ? "text-ink"
                  : "text-thread hover:text-ink"
              }`}
            >
              {item.label}
              {view === item.id && (
                <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-laser" />
              )}
            </button>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => go("order")}
            className="hidden sm:inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-2.5 hover:bg-laser hover:text-white transition-colors active:scale-[0.98]"
          >
            Place an order
          </button>
          {/* Mobile toggle */}
          <button
            onClick={() => setOpen((o) => !o)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 text-ink hover:bg-ink/5 transition-colors"
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="md:hidden border-t border-hairline bg-bone">
          <nav className="max-w-[1320px] mx-auto px-4 py-3 flex flex-col">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                className={`text-left px-2 py-3 text-base border-b border-hairline last:border-b-0 ${
                  view === item.id ? "text-ink" : "text-thread"
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => go("order")}
              className="mt-4 mb-2 bg-ink text-bone text-sm font-medium px-5 py-3.5 text-center hover:bg-laser hover:text-white transition-colors"
            >
              Place an order
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
