"use client";

import { CONTACT_DETAILS, HOURS, type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { ArrowRight } from "lucide-react";

export default function ContactView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24">
        {/* Left — details */}
        <div>
          <Coord>GET IN TOUCH</Coord>
          <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
            Let&apos;s talk about your project
          </Heading>
          <p className="text-base text-thread mt-6 max-w-[440px] leading-relaxed">
            A question about materials, a quote for a large run, or just
            curious how laser cutting works — we&apos;re here. We reply to every
            enquiry within a few hours during operating hours.
          </p>

          <div className="mt-10 space-y-px bg-hairline border border-hairline">
            {CONTACT_DETAILS.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target={c.label === "Address" || c.label === "Socials" ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex items-start gap-5 bg-vellum p-5 hover:bg-bone transition-colors"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread w-16 shrink-0 pt-0.5">
                  {c.label}
                </span>
                <span className="text-sm text-ink leading-relaxed">{c.value}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Right — hours + quote */}
        <div className="space-y-8">
          <div>
            <Coord>OPERATING HOURS</Coord>
            <div className="mt-4 bg-vellum border border-hairline">
              {HOURS.map((h) => (
                <div
                  key={h.day}
                  className="flex justify-between items-baseline gap-4 px-5 py-4 border-b border-hairline last:border-b-0"
                >
                  <span className="text-sm text-thread">{h.day}</span>
                  <span className="text-sm font-medium text-ink tnum">{h.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Coord>QUOTE RESPONSE</Coord>
            <div className="mt-4 leather-surface grain text-bone p-6 relative overflow-hidden">
              <p className="text-sm text-bone/85 leading-relaxed">
                Standard quotes return within{" "}
                <span className="font-display font-semibold text-bone">4 hours</span>{" "}
                during operating hours. Complex runs may take up to 24 hours for
                a detailed estimate. Need it faster? Call us.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between bg-vellum border border-hairline p-6">
            <div>
              <Coord>READY TO ORDER?</Coord>
              <p className="text-sm text-thread mt-2">Send us your design.</p>
            </div>
            <button
              onClick={() => onNavigate("order")}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-3 hover:bg-laser hover:text-white transition-colors"
            >
              Start <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="mt-16">
        <Coord>LOCATION · WEMPCO RD, OGBA</Coord>
        <div className="mt-4 w-full h-[380px] bg-vellum border border-hairline relative overflow-hidden">
          <iframe
            src="https://www.google.com/maps?q=Wempco+Rd,+Ogba,+Ikeja,+Lagos,+Nigeria&output=embed"
            width="100%"
            height="100%"
            style={{ border: 0, filter: "grayscale(0.3) sepia(0.15)" }}
            allowFullScreen={false}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Skyal location map"
          />
        </div>
      </div>
    </div>
  );
}
