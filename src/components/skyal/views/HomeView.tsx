"use client";

import { useState } from "react";
import { type ViewId, SERVICES, CRAFT, MATERIALS, PROCESS_STEPS, PLATFORM_FEATURES, DIFFERENTIATORS, TESTIMONIALS, FAQS } from "../data";
import { Reveal, Coord, Heading } from "../primitives";
import LaserTrace from "../LaserTrace";
import { ArrowRight, Plus } from "lucide-react";

export default function HomeView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  return (
    <div className="w-full">
      {/* ════════════════ HERO ════════════════ */}
      <section className="relative cutting-bed grain border-b border-hairline">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 pt-28 sm:pt-32 lg:pt-40 pb-16 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-16 items-center">
            <div>
              <Reveal>
                <Coord>LASER · CUTTING / FABRIC · LEATHER · WOOD · ACRYLIC</Coord>
              </Reveal>

              <Reveal delay={0.08}>
                <h1 className="font-display font-semibold text-ink leading-[0.94] tracking-[-0.028em] mt-6 text-[2.9rem] sm:text-[3.9rem] lg:text-[5rem]">
                  Your designs,
                  <br />
                  <span className="italic font-medium text-cordovan">cut on the</span>
                  <br />
                  beam<span className="text-laser text-glow">.</span>
                </h1>
              </Reveal>

              {/* A periwinkle cut-rule beneath the headline — the beam's trace */}
              <Reveal delay={0.12}>
                <div className="mt-7 flex items-center gap-3">
                  <div className="h-[2px] w-16 bg-laser" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-laser">CO₂ · 10.6µm · ±0.05mm</span>
                </div>
              </Reveal>

              <Reveal delay={0.16}>
                <p className="text-base lg:text-lg text-thread max-w-[500px] mt-8 leading-relaxed">
                  Send us a sketch, a screenshot, or a CAD file. Pick your
                  material. We laser-cut it, track every step from the bed to
                  your door, and deliver — usually inside 72 hours.
                </p>
              </Reveal>

              <Reveal delay={0.24}>
                <div className="flex flex-wrap gap-3 mt-10">
                  <button
                    onClick={() => onNavigate("order")}
                    className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-7 py-3.5 hover:bg-laser hover:text-white transition-colors active:scale-[0.98] group"
                  >
                    Place an order
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <a
                    href="#services"
                    className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-7 py-3.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
                  >
                    See what we cut
                  </a>
                </div>
              </Reveal>
            </div>

            <Reveal delay={0.2}>
              <figure className="relative bg-vellum border border-hairline">
                {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos, i) => (
                  <span
                    key={i}
                    className={`absolute ${pos} w-3 h-3 border-l border-t border-ink/40`}
                    style={
                      i === 1
                        ? { borderLeft: "none", borderRight: "1px solid", borderTop: "1px solid" }
                        : i === 2
                        ? { borderTop: "none", borderBottom: "1px solid" }
                        : i === 3
                        ? { borderLeft: "none", borderRight: "1px solid", borderTop: "none", borderBottom: "1px solid" }
                        : {}
                    }
                  />
                ))}
                <div className="aspect-square p-6 sm:p-8">
                  <LaserTrace />
                </div>
                <figcaption className="flex items-center justify-between px-5 py-3 border-t border-hairline font-mono text-[10px] uppercase tracking-[0.16em] text-thread">
                  <span>tool path · bloom-06</span>
                  <span className="text-laser">● cutting</span>
                  <span>1200 mm/s</span>
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════════ SERVICES — editorial 2-col ════════════════ */}
      <section id="services" className="border-b border-hairline">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-[0.42fr_0.58fr] gap-10 lg:gap-20">
            <div className="lg:sticky lg:top-24 h-fit">
              <Coord>WHAT WE DO</Coord>
              <Heading className="text-3xl sm:text-4xl lg:text-5xl mt-4">
                From your design to your door, all in one place
              </Heading>
              <p className="text-sm text-thread mt-6 max-w-[340px] leading-relaxed">
                One studio handles the cutting, the tracking, and the delivery —
                so you stop coordinating three vendors.
              </p>
            </div>
            <div>
              {SERVICES.map((s, i) => (
                <div
                  key={s.title}
                  className={i > 0 ? "border-t border-hairline pt-7 mt-7" : ""}
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-xs text-laser tnum shrink-0">
                      §{String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display font-semibold text-2xl text-ink">{s.title}</h3>
                  </div>
                  <p className="text-sm text-thread leading-relaxed mt-3 pl-10 max-w-[520px]">
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════ CRAFT — spec-sheet with header row ════════════════ */}
      <section className="border-b border-hairline bg-vellum">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16 items-start">
            <div className="lg:sticky lg:top-24">
              <Coord>OUR CRAFT</Coord>
              <Heading className="text-3xl sm:text-4xl lg:text-5xl mt-4">
                Precision manufacturing,
                <br />
                <span className="italic font-medium">engineered for makers</span>
              </Heading>
              <p className="text-base text-thread mt-6 max-w-[440px] leading-relaxed">
                Industrial CO₂ and fibre lasers, machine-vision QA, a
                climate-controlled floor. The same piece, every time — from 5
                units to 5,000.
              </p>
              <div className="mt-8 aspect-[4/3] leather-surface overflow-hidden border border-hairline relative">
                <img
                  src="/skyal/laser-leather.png"
                  alt="A CO₂ laser beam cutting through oxblood leather, glowing amber"
                  className="w-full h-full object-cover mix-blend-luminosity opacity-85"
                  onError={(e) => { (e.currentTarget.style.display = "none"); }}
                />
                <div className="absolute inset-0 bg-leather/20" />
                <div className="absolute bottom-0 left-0 right-0 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/85 bg-leather/70 flex justify-between">
                  <span>CO₂ · 10.6µm · 120w</span>
                  <span className="text-laser">leather</span>
                </div>
              </div>
            </div>

            {/* Spec-sheet — header row + numbered rows with datum */}
            <div>
              <div className="grid grid-cols-[auto_1fr_auto] gap-5 items-baseline pb-3 border-b border-ink/40">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">#</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">process</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread hidden sm:inline">datum</span>
              </div>
              {CRAFT.map((c, i) => (
                <div
                  key={c.title}
                  className="grid grid-cols-[auto_1fr_auto] gap-5 items-baseline py-5 border-b border-hairline group"
                >
                  <span className="font-mono text-xs text-thread tnum">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display font-semibold text-lg text-ink group-hover:text-laser transition-colors">{c.title}</h3>
                    <p className="text-[13px] text-thread leading-relaxed mt-1.5 max-w-[460px]">{c.desc}</p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-laser whitespace-nowrap hidden sm:inline">
                    {["±0.05mm", "40+ mats", "92–97%", "100%", "±1.5°C", "SPC"][i] ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════ MATERIALS — library index ════════════════ */}
      <section id="materials" className="border-b border-hairline">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-[0.42fr_0.58fr] gap-10 lg:gap-20">
            <div className="lg:sticky lg:top-24 h-fit">
              <Coord>MATERIALS · 40+</Coord>
              <Heading className="text-3xl sm:text-4xl lg:text-5xl mt-4">
                One precision process,
                <br />
                <span className="italic font-medium">forty materials</span>
              </Heading>
              <p className="text-sm text-thread mt-6 max-w-[340px] leading-relaxed">
                Each material has its own tuned power, speed, and frequency
                profile — so cotton cuts clean, leather doesn&apos;t scorch, and
                acrylic comes out flame-polished.
              </p>
              <div className="mt-6 relative bg-vellum border border-hairline overflow-hidden">
                <img
                  src="/skyal/materials-flatlay.png"
                  alt="Folded fabrics and leather swatches arranged on a bone linen surface"
                  className="w-full h-[200px] sm:h-[240px] object-cover"
                  onError={(e) => { (e.currentTarget.style.display = "none"); }}
                />
                <div className="absolute bottom-0 left-0 right-0 px-4 py-2.5 bg-gradient-to-t from-ink/70 to-transparent flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone/90">library · 40+</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-laser">tuned</span>
                </div>
              </div>
            </div>

            <div className="border-t border-ink/30">
              {MATERIALS.map((m, i) => (
                <div
                  key={m.name}
                  className="grid grid-cols-[auto_1fr] gap-5 items-baseline py-5 border-b border-hairline group"
                >
                  <span className="font-mono text-xs text-thread tnum">
                    M·{String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex items-baseline justify-between gap-4 flex-wrap">
                    <h3 className="font-display font-semibold text-xl text-ink group-hover:text-laser transition-colors">
                      {m.name}
                    </h3>
                    <span className="text-[12px] text-thread leading-relaxed text-right">
                      {m.items}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════ HOW IT WORKS ════════════════ */}
      <section id="how-it-works" className="border-b border-hairline bg-vellum">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20">
            <div>
              <Coord>HOW IT WORKS</Coord>
              <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
                Three steps.
                <br />
                <span className="italic font-medium">Your custom design</span>
              </Heading>
              <p className="text-base text-thread mt-8 max-w-[460px] leading-relaxed">
                Send a photo, a sketch, or a CAD file. Pick your material and
                quantity. We line up the cut, the machines do the work, and you
                track everything from your phone. Most orders ship within 72
                hours.
              </p>
              <button
                onClick={() => onNavigate("order")}
                className="mt-8 inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-7 py-3.5 hover:bg-laser hover:text-white transition-colors active:scale-[0.98] group"
              >
                Submit your first order
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="relative">
              <div className="flex items-center gap-3 mb-8">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread">process timeline</span>
                <div className="flex-1 h-px bg-kerf" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-laser">~76 hrs total</span>
              </div>
              <div className="relative">
                <div className="absolute left-[18px] top-[18px] bottom-[18px] w-px bg-kerf" />
                {PROCESS_STEPS.map((step, i) => (
                  <div key={step.title} className="relative flex gap-5 items-start pb-10 last:pb-0">
                    <div className="relative z-10 shrink-0 w-9 h-9 bg-bone border border-ink/30 flex items-center justify-center font-mono text-[11px] font-bold text-ink">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="flex-1 pt-1">
                      <div className="flex items-baseline justify-between gap-3 mb-1.5">
                        <h3 className="font-display font-semibold text-lg text-ink">{step.title}</h3>
                        <span className="font-mono text-[11px] text-laser font-bold whitespace-nowrap tnum">{step.time}</span>
                      </div>
                      <p className="text-sm text-thread leading-relaxed max-w-[380px]">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════ PLATFORM ════════════════ */}
      <section className="border-b border-hairline">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20">
            <div>
              <Coord>PLATFORM</Coord>
              <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
                Order management
                <br />
                <span className="italic font-medium">built for makers</span>
              </Heading>
              <p className="text-base text-thread mt-8 max-w-[460px] leading-relaxed">
                From quote to delivery, everything lives in one place. Your
                order history, fabric preferences, job status, and shipping —
                all connected. No spreadsheets. No sticky notes.
              </p>
              <button
                onClick={() => onNavigate("contact")}
                className="mt-8 inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-7 py-3.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
              >
                Learn about the platform
              </button>
            </div>
            <div>
              {PLATFORM_FEATURES.map((f, i) => (
                <div key={f.title} className={i > 0 ? "border-t border-hairline pt-8 mt-8" : ""}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-laser mb-2">
                    {f.title.split(" ")[0]}
                  </div>
                  <h3 className="font-display font-semibold text-xl text-ink mb-2">{f.title}</h3>
                  <p className="text-sm text-thread leading-relaxed max-w-[440px]">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════ WHY SKYAL ════════════════ */}
      <section className="border-b border-hairline bg-vellum">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-16 lg:py-24">
          <Coord>WHY SKYAL</Coord>
          <Heading className="text-3xl sm:text-4xl lg:text-5xl mt-4 max-w-[700px]">
            Built for makers who can&apos;t afford to wait
          </Heading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8 mt-12">
            {DIFFERENTIATORS.map((d, i) => (
              <div key={d.title} className="flex gap-4">
                <span className="font-mono text-xs text-laser tnum shrink-0 pt-1">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-display font-semibold text-lg text-ink mb-1">{d.title}</h3>
                  <p className="text-[13px] text-thread leading-relaxed">{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════ ONE NUMBER — bleed onto leather, dramatic ════════════════
          The number sits on the walnut leather surface; periwinkle "+",
          bone copy. No count-up — the number is a fact, stated confidently.
          Generous whitespace; the periwinkle rule extends on hover. */}
      <section className="leather-surface grain text-bone relative overflow-hidden border-b border-leather group/num">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-28 lg:py-48">
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-12 lg:gap-20 items-end">
            <div className="relative">
              <Coord className="[&_*]:!text-laser/80">BY THE NUMBERS</Coord>
              {/* The number — set enormous in Fraunces with max optical sizing.
                  Bleeds slightly off the left on large screens for drama. */}
              <div className="font-display display-opt font-semibold leading-[0.76] tracking-[-0.05em] mt-8 text-[7.5rem] sm:text-[12rem] lg:text-[16rem] xl:text-[18rem] tnum -ml-1 sm:-ml-2 lg:-ml-3 transition-colors duration-500">
                <span className="text-bone">12,000</span><span className="text-laser group-hover/num:text-glow">+</span>
              </div>
              {/* A periwinkle rule beneath — the "cut line", extends on hover */}
              <div className="mt-8 h-[3px] bg-laser transition-all duration-500 group-hover/num:w-56 w-32" />
            </div>
            <div className="max-w-[420px] lg:pb-12">
              <p className="font-display font-medium italic text-3xl lg:text-4xl text-bone leading-[1.15] tracking-[-0.01em]">
                Orders cut on the beam,
                <br />
                since 2022.
              </p>
              <p className="text-sm text-bone/60 mt-6 leading-relaxed">
                For designers across Nigeria — atelier labels, streetwear
                houses, leather-goods studios, furniture makers. Forty
                materials, a 72-hour average turnaround, and a 99.2% on-time
                rate we actually keep.
              </p>
              <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-bone/50">
                <span><span className="text-bone tnum">72 hrs</span> avg turnaround</span>
                <span><span className="text-bone tnum">40+</span> materials</span>
                <span><span className="text-laser tnum">99.2%</span> on-time</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════ ONE PULL-QUOTE ════════════════ */}
      <PullQuote onNavigate={onNavigate} />

      {/* ════════════════ FAQ ════════════════ */}
      <section id="faq" className="border-b border-hairline">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-20">
            <div>
              <Coord>FAQ</Coord>
              <Heading className="text-4xl sm:text-5xl mt-4">
                Questions? We&apos;ve got answers
              </Heading>
              <p className="text-base text-thread mt-6 max-w-[360px] leading-relaxed">
                Everything about placing an order, tracking, and delivery. Still
                stuck? Talk to us — a real person replies fast.
              </p>
              <button
                onClick={() => onNavigate("contact")}
                className="mt-8 inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-7 py-3.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
              >
                Talk to us
              </button>
            </div>
            <div>
              {FAQS.map((faq, i) => (
                <details
                  key={faq.q}
                  className="group border-t border-hairline last:border-b py-5 [&_summary::-webkit-details-marker]:hidden"
                  {...(i === 0 ? { open: true } : {})}
                >
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                    <span className="font-display font-semibold text-lg text-ink group-open:text-laser transition-colors">
                      {faq.q}
                    </span>
                    <span className="shrink-0 w-7 h-7 flex items-center justify-center border border-ink/20 text-ink group-open:bg-laser group-open:text-white group-open:border-laser transition-colors">
                      <Plus className="w-4 h-4 group-open:rotate-45 transition-transform duration-300" />
                    </span>
                  </summary>
                  <p className="text-sm text-thread leading-relaxed mt-4 pr-10">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════ CLOSING CTA — on leather, editorial ════════════════ */}
      <section className="leather-surface grain text-bone relative overflow-hidden">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-20 lg:py-32">
          <div className="max-w-[680px]">
            <Coord className="[&_*]:!text-bone/55">READY</Coord>
            <h2 className="font-display font-semibold text-5xl sm:text-6xl lg:text-7xl text-bone leading-[0.98] tracking-[-0.025em] mt-6">
              Send a design.
              <br />
              We&apos;ll put it on the
              <br />
              <span className="italic font-medium text-laser">next available bed.</span>
            </h2>
            <p className="text-base text-bone/70 max-w-[440px] mt-8 leading-relaxed">
              Precision cutting, real-time tracking, on-time delivery. Quotes
              back inside four hours.
            </p>
            <div className="mt-10 flex gap-3 flex-wrap">
              <button
                onClick={() => onNavigate("order")}
                className="inline-flex items-center gap-2 bg-laser text-white text-sm font-medium px-8 py-4 hover:bg-bone hover:text-leather transition-colors active:scale-[0.98] group"
              >
                Place an order
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => onNavigate("contact")}
                className="inline-flex items-center gap-2 border border-bone/35 text-bone text-sm font-medium px-8 py-4 hover:bg-bone hover:text-leather transition-colors"
              >
                Talk to us
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Single rotating pull-quote — magazine spread, not a card grid. ── */
function PullQuote({ onNavigate: _onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const [i, setI] = useState(0);
  const t = TESTIMONIALS[i];
  const next = () => setI((p) => (p + 1) % TESTIMONIALS.length);
  const prev = () => setI((p) => (p - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);

  return (
    <section className="border-b border-hairline bg-vellum">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-20 lg:py-28">
        <div className="flex items-center justify-between mb-10">
          <Coord>FROM THE WORKBENCH</Coord>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread tnum">
            {String(i + 1).padStart(2, "0")} / {String(TESTIMONIALS.length).padStart(2, "0")}
          </span>
        </div>

        <blockquote className="max-w-[960px]">
          <span className="font-display italic text-laser text-8xl leading-none select-none block -mb-4" aria-hidden="true">
            &ldquo;
          </span>
          <p className="font-display font-medium text-2xl sm:text-3xl lg:text-[2.6rem] text-ink leading-[1.22] tracking-[-0.012em]">
            {t.quote}
          </p>
          <figcaption className="mt-8 flex items-baseline gap-3">
            <span className="w-8 h-px bg-laser" />
            <span className="text-sm font-medium text-ink">{t.name}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-thread">{t.role}</span>
          </figcaption>
        </blockquote>

        <div className="mt-10 flex items-center gap-2">
          <button
            onClick={prev}
            className="w-10 h-10 flex items-center justify-center border border-hairline text-thread hover:border-ink hover:text-ink transition-colors"
            aria-label="Previous quote"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
          <button
            onClick={next}
            className="w-10 h-10 flex items-center justify-center border border-hairline text-thread hover:border-ink hover:text-ink transition-colors"
            aria-label="Next quote"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <span className="ml-3 text-xs text-thread">tap to hear from the next maker</span>
        </div>
      </div>
    </section>
  );
}
