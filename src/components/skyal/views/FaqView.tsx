"use client";

import { useEffect, useMemo, useState } from "react";
import { type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { Search, Plus, Loader2, AlertCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  brand?: string | null;
}

function humanCategory(raw: string): string {
  const map: Record<string, string> = {
    PRICING: "Pricing",
    LEAD_TIMES: "Lead times",
    LEAD_TIME: "Lead time",
    ORDERS: "Orders",
    PAYMENTS: "Payments",
    DELIVERY: "Delivery",
    QUALITY: "Quality",
    MATERIALS: "Materials",
    GENERAL: "General",
  };
  if (map[raw]) return map[raw];
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FaqView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/faq?brand=SKYAL`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error?.message || "Could not load FAQs.");
          setFaqs([]);
        } else {
          setFaqs(data.data?.faqs || data.faqs || []);
        }
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Category pills — unique, preserving first-seen order.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const f of faqs) {
      if (f.category && !seen.includes(f.category)) seen.push(f.category);
    }
    return seen;
  }, [faqs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faqs.filter((f) => {
      if (activeCategory !== "ALL" && f.category !== activeCategory) return false;
      if (!q) return true;
      return (
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q)
      );
    });
  }, [faqs, query, activeCategory]);

  const toggleOpen = (id: string) =>
    setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="max-w-[52rem] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      {/* Header */}
      <Coord>FREQUENTLY ASKED QUESTIONS</Coord>
      <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
        Answers, fast
      </Heading>
      <p className="text-base text-thread mt-6 max-w-[40rem] leading-relaxed">
        Search by keyword or browse by category. Can&apos;t find what you need?
        Reach us on live chat or send a message.
      </p>

      {/* Search */}
      <div className="mt-8 sm:mt-10">
        <label htmlFor="faq-search" className="sr-only">
          Search FAQs
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-thread pointer-events-none">
            <Search className="w-[18px] h-[18px]" />
          </span>
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions or answers…"
            className="w-full bg-bone border border-hairline pl-11 pr-4 py-3 text-sm text-ink focus:border-laser outline-none placeholder:text-thread/50"
            autoComplete="off"
          />
        </div>
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory("ALL")}
            className={`px-3 py-1.5 border text-xs font-medium transition-colors ${
              activeCategory === "ALL"
                ? "bg-ink text-bone border-ink"
                : "bg-bone text-thread border-hairline hover:border-ink hover:text-ink"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCategory(c)}
              className={`px-3 py-1.5 border text-xs font-medium transition-colors ${
                activeCategory === c
                  ? "bg-ink text-bone border-ink"
                  : "bg-bone text-thread border-hairline hover:border-ink hover:text-ink"
              }`}
            >
              {humanCategory(c)}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="mt-8 sm:mt-10">
        {loading ? (
          <div className="bg-vellum border border-hairline p-6 flex items-center gap-4">
            <Loader2 className="w-6 h-6 text-laser animate-spin" />
            <p className="text-sm text-thread">Loading FAQs…</p>
          </div>
        ) : error ? (
          <div className="border-l-2 border-leather bg-vellum p-4 flex items-start gap-2 text-leather">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        ) : faqs.length === 0 ? (
          <div className="bg-vellum border border-hairline p-6">
            <p className="text-sm text-thread">No FAQs published yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-vellum border border-hairline p-6">
            <p className="text-sm text-thread">
              No results — try a different search or category.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((f) => {
              const isOpen = openId === f.id;
              return (
                <li key={f.id} className="bg-vellum border border-hairline">
                  <button
                    type="button"
                    onClick={() => toggleOpen(f.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-start justify-between gap-4 text-left p-5"
                  >
                    <div className="min-w-0">
                      {f.category && (
                        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-laser mb-1.5">
                          {humanCategory(f.category)}
                        </p>
                      )}
                      <p className="text-sm sm:text-base font-display font-semibold text-ink leading-snug">
                        {f.question}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 mt-0.5 w-6 h-6 border border-hairline flex items-center justify-center text-thread transition-transform duration-200 ${
                        isOpen ? "rotate-45" : ""
                      }`}
                      aria-hidden="true"
                    >
                      <Plus className="w-3 h-3" />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mt-0 px-5 pb-5 pt-0">
                      <div className="pt-4 border-t border-hairline">
                        <p className="text-sm text-thread leading-relaxed whitespace-pre-line">
                          {f.answer}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer CTA */}
      {!loading && !error && (
        <div className="bg-vellum border border-hairline p-6 mt-10 sm:mt-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Coord>STILL STUCK?</Coord>
            <p className="text-sm text-ink mt-2">Our team is one message away.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate("chat")}
              className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-3 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
            >
              Live chat
            </button>
            <button
              onClick={() => onNavigate("contact")}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-3 hover:bg-laser hover:text-white transition-colors"
            >
              Contact us
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
