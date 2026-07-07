"use client";

import { useEffect, useMemo, useState } from "react";
import { formatNaira, type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

interface Service {
  id: string;
  type: string;
  label: string;
  description: string;
  category: string;
  basePriceNaira: number;
  unit: string;
  minPriceNaira: number;
  customerSupplied: boolean;
  standardLeadTime: string;
  expressLeadTime: string | null;
  allowExpress: boolean;
  expressSurchargePct: number;
}

interface QuoteBreakdown {
  serviceLabel?: string;
  basePrice?: number;
  subtotal?: number;
  expressSurcharge?: number;
  addOnsTotal?: number;
  discount?: number;
  deliveryFee?: number;
  finalPriceNaira?: number;
  sla?: string;
  leadTime?: string;
  quantity?: number;
  [k: string]: unknown;
}

interface QuoteResponse {
  quoteNaira: number;
  breakdown?: QuoteBreakdown;
}

type DeliveryOption = "pickup" | "local" | "nationwide" | "";
type Sla = "Standard" | "Express";

const DELIVERY_OPTIONS: { value: DeliveryOption; label: string; hint: string }[] = [
  { value: "pickup", label: "Pickup", hint: "Wempco Rd, Ogba, Ikeja" },
  { value: "local", label: "Local delivery", hint: "Within Lagos" },
  { value: "nationwide", label: "Nationwide waybill", hint: "Outside Lagos" },
];

function buildDeliveryBody(opt: DeliveryOption): Record<string, unknown> {
  if (opt === "pickup") return { deliveryMethod: "PICKUP" };
  if (opt === "local") return { deliveryMethod: "LOCAL_DELIVERY", deliveryDistanceKm: 10 };
  if (opt === "nationwide") return { deliveryMethod: "NATIONWIDE_WAYBILL", deliveryDistanceKm: 80 };
  return {};
}

export default function CalculatorView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [serviceType, setServiceType] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [sla, setSla] = useState<Sla>("Standard");
  const [delivery, setDelivery] = useState<DeliveryOption>("");

  const [breakdown, setBreakdown] = useState<QuoteBreakdown | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setServicesLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/services?brand=SKYAL`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setServicesError(data?.error?.message || "Failed to load services");
          setServices([]);
        } else {
          const list = Array.isArray(data?.data) ? data.data : [];
          setServices(list);
          if (list.length) setServiceType(list[0].type);
        }
      } catch {
        if (!cancelled) {
          setServicesError("Network error. Please try again.");
          setServices([]);
        }
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedService = useMemo(
    () => services.find((s) => s.type === serviceType) || null,
    [services, serviceType],
  );

  // If the currently-selected service doesn't allow Express, force Standard.
  useEffect(() => {
    if (selectedService && !selectedService.allowExpress && sla === "Express") {
      setSla("Standard");
    }
  }, [selectedService, sla]);

  const calculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceType) {
      setQuoteError("Pick a service first.");
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    setSearched(true);
    try {
      const res = await fetch(`${API_URL}/api/services/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: "SKYAL",
          serviceType,
          quantity: Math.max(1, quantity || 1),
          sla,
          ...buildDeliveryBody(delivery),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Could not calculate a quote. Try again.");
      }
      const result: QuoteResponse = data.data || data;
      setBreakdown(result.breakdown || null);
      setTotal(result.breakdown?.finalPriceNaira ?? result.quoteNaira ?? 0);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Could not calculate a quote. Try again.");
      setBreakdown(null);
      setTotal(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  const rows: { label: string; value: number | undefined; muted?: boolean }[] = [
    { label: "Service", value: breakdown?.basePrice },
    {
      label: `Quantity${breakdown?.quantity ? ` × ${breakdown.quantity}` : ""}`,
      value: undefined,
      muted: true,
    },
    { label: "Express surcharge", value: breakdown?.expressSurcharge },
    { label: "Add-ons", value: breakdown?.addOnsTotal },
    { label: "Discount", value: breakdown?.discount },
    { label: "Delivery fee", value: breakdown?.deliveryFee },
  ].filter((r) => r.muted || (typeof r.value === "number" && r.value !== 0));

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-24 items-start">
        {/* Left — Hero copy + form */}
        <div>
          <Coord>PRICE CALCULATOR</Coord>
          <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
            Estimate your job
          </Heading>
          <p className="text-base text-thread mt-6 max-w-[440px] leading-relaxed">
            Pick a service, quantity, turnaround, and delivery option to get an
            instant estimate. Final pricing is confirmed when you place an order.
          </p>

          <form onSubmit={calculate} className="mt-8 sm:mt-12 space-y-6">
            {/* Service */}
            <div className="space-y-2">
              <label htmlFor="serviceType" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                <span className="text-laser">01</span> Service
              </label>
              {servicesLoading ? (
                <div className="flex items-center gap-3 bg-bone border border-hairline px-4 py-3">
                  <Loader2 className="w-4 h-4 text-laser animate-spin" />
                  <span className="text-sm text-thread">Loading services…</span>
                </div>
              ) : servicesError ? (
                <div className="border-l-2 border-leather bg-vellum p-4 text-sm text-leather">
                  {servicesError}
                </div>
              ) : (
                <select
                  id="serviceType"
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.type}>
                      {s.label} — {formatNaira(s.basePriceNaira)}/{s.unit || "unit"}
                    </option>
                  ))}
                </select>
              )}
              {selectedService && (
                <p className="text-xs text-thread leading-relaxed mt-1">
                  {selectedService.description}
                </p>
              )}
              {selectedService?.minPriceNaira ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mt-1">
                  Minimum order: {formatNaira(selectedService.minPriceNaira)}
                </p>
              ) : null}
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <label htmlFor="quantity" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                <span className="text-laser">02</span> Quantity
                {selectedService?.unit ? (
                  <span className="normal-case tracking-normal text-thread/70">
                    {" "}({selectedService.unit})
                  </span>
                ) : null}
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
              />
            </div>

            {/* SLA */}
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                <span className="text-laser">03</span> Turnaround
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSla("Standard")}
                  className={`text-left border px-4 py-3 transition-colors ${
                    sla === "Standard"
                      ? "border-laser bg-vellum"
                      : "border-hairline hover:border-ink/40"
                  }`}
                >
                  <p className="text-sm font-medium text-ink">Standard</p>
                  {selectedService?.standardLeadTime && (
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mt-1">
                      {selectedService.standardLeadTime}
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => selectedService?.allowExpress !== false && setSla("Express")}
                  disabled={selectedService?.allowExpress === false}
                  className={`text-left border px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    sla === "Express"
                      ? "border-laser bg-vellum"
                      : "border-hairline hover:border-ink/40"
                  }`}
                >
                  <p className="text-sm font-medium text-ink">Express</p>
                  {selectedService?.expressLeadTime ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mt-1">
                      {selectedService.expressLeadTime}
                    </p>
                  ) : (
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread/70 mt-1">
                      {selectedService?.allowExpress === false ? "Not available" : "Faster turnaround"}
                    </p>
                  )}
                </button>
              </div>
              {selectedService?.expressSurchargePct ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mt-1">
                  Express adds +{selectedService.expressSurchargePct}% surcharge
                </p>
              ) : null}
            </div>

            {/* Delivery */}
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                <span className="text-laser">04</span> Delivery{" "}
                <span className="normal-case tracking-normal text-thread/70">(optional)</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {DELIVERY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDelivery(delivery === opt.value ? "" : opt.value)}
                    className={`text-left border px-3 py-2.5 transition-colors ${
                      delivery === opt.value
                        ? "border-laser bg-vellum"
                        : "border-hairline hover:border-ink/40"
                    }`}
                  >
                    <p className="text-sm font-medium text-ink">{opt.label}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mt-1">
                      {opt.hint}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={quoteLoading || servicesLoading || !serviceType}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-7 py-3.5 hover:bg-laser hover:text-white transition-colors active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {quoteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {quoteLoading ? "Calculating…" : "Calculate price"}
            </button>

            {quoteError && (
              <div className="border-l-2 border-leather bg-vellum p-4 flex items-start gap-2 text-leather">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-sm">{quoteError}</p>
              </div>
            )}
          </form>
        </div>

        {/* Right — Result */}
        <div>
          {!searched && !quoteLoading && (
            <div className="bg-vellum border border-hairline p-6 space-y-4">
              <Coord>YOUR ESTIMATE</Coord>
              <p className="text-sm text-thread leading-relaxed">
                Choose a service, quantity, and turnaround on the left, then hit{" "}
                <span className="text-ink font-medium">Calculate price</span> for a
                line-by-line breakdown including delivery.
              </p>
            </div>
          )}

          {quoteLoading && (
            <div className="bg-vellum border border-hairline p-6 flex items-center gap-4">
              <Loader2 className="w-6 h-6 text-laser animate-spin" />
              <p className="text-sm text-thread">Calculating your estimate…</p>
            </div>
          )}

          {!quoteLoading && breakdown && (
            <div className="bg-vellum border border-hairline p-6">
              <Coord>ESTIMATE BREAKDOWN</Coord>

              {breakdown.serviceLabel && (
                <p className="text-sm font-display font-semibold text-ink mt-4 mb-4">
                  {breakdown.serviceLabel}
                </p>
              )}

              <div className="space-y-3 mt-4">
                {rows.map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread">
                      {r.label}
                    </span>
                    <span className="text-ink tnum text-right">
                      {r.muted
                        ? breakdown?.quantity ?? quantity
                        : formatNaira(r.value || 0)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="w-full h-px bg-hairline my-5" />

              <div className="flex items-baseline justify-between gap-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                  Estimated total
                </span>
                <span className="text-2xl sm:text-3xl font-display font-bold text-laser tnum">
                  {formatNaira(total ?? 0)}
                </span>
              </div>

              <div className="mt-6 pt-5 border-t border-hairline flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-xs text-thread leading-relaxed">
                  This is an estimate. Place an order to proceed.
                </p>
                <button
                  onClick={() => onNavigate("order")}
                  className="inline-flex items-center gap-2 bg-laser text-white text-sm font-medium px-5 py-3 hover:bg-ink hover:text-bone transition-colors whitespace-nowrap"
                >
                  Place an order <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
