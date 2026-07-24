"use client";

import { type ViewId } from "../data";
import { Coord, Heading } from "../primitives";

/* ── Parse section content: split on newlines, render **bold** as <strong>. ── */
function SectionContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>;
            }
            return <span key={j}>{part}</span>;
          })}
        </span>
      ))}
    </>
  );
}

export default function LegalLayout({
  eyebrow,
  title,
  sections,
  onNavigate,
}: {
  eyebrow: string;
  title: string;
  sections: { id: string; title: string; content: string }[];
  onNavigate: (v: ViewId) => void;
}) {
  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-10 lg:gap-20">
        {/* Sticky index */}
        <aside className="md:sticky md:top-24 h-fit">
          <Coord>{eyebrow}</Coord>
          <ul className="mt-5 flex flex-row md:flex-col gap-2 md:gap-3 flex-wrap">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#section-${s.id}`}
                  className="text-sm text-thread hover:text-ink transition-colors flex items-center gap-2"
                >
                  <span className="font-mono text-xs text-laser">[{s.id}]</span>
                  <span className="hidden md:inline">{s.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </aside>

        {/* Content */}
        <div>
          <Heading className="text-4xl sm:text-5xl lg:text-6xl mb-12">{title}</Heading>
          <div className="space-y-12">
            {sections.map((s) => (
              <section key={s.id} id={`section-${s.id}`} className="scroll-mt-24">
                <div className="flex items-center gap-4 mb-4">
                  <h2 className="font-mono text-sm font-bold text-ink">
                    [{s.id}] {s.title}
                  </h2>
                  <div className="h-px bg-hairline flex-1" />
                </div>
                <div className="bg-vellum border border-hairline p-6 lg:p-8">
                  <p className="text-sm lg:text-base text-thread leading-relaxed">
                    <SectionContent text={s.content} />
                  </p>
                </div>
              </section>
            ))}
          </div>

          <button
            onClick={() => onNavigate("home")}
            className="mt-12 text-sm text-thread hover:text-ink transition-colors"
          >
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
