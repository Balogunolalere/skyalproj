"use client";

import { useState } from "react";
import { TRACK_STATES, formatNaira, type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { Search, Package, Scissors, Truck, CheckCircle2, CreditCard, ClipboardList, Loader2, ArrowRight } from "lucide-react";

const STEP_ICONS = [CreditCard, ClipboardList, Scissors, CheckCircle2, Truck, Package];

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

interface OrderData {
  orderNumber: string;
  brand: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceLabel: string;
  serviceType: string;
  quantity: number;
  totalAmount: number;
  state: string;
  sla: string;
  deliveryMethod: string | null;
  deliveryAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function TrackView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const track = async (val: string) => {
    const v = val.trim();
    if (!v) return;
    setLoading(true);
    setError(null);
    setOrder(null);
    setSearched(v);
    try {
      const res = await fetch(`${API_URL}/api/orders?id=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || "Order not found");
        setOrder(null);
      } else {
        setOrder(data.data || data);
        setError(null);
      }
    } catch {
      setError("Network error. Please try again.");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  // Map order state to timeline index
  const stateToIndex: Record<string, number> = {
    PAYMENT_PENDING: -1,
    PAYMENT_SUCCESS: 0,
    IN_QUEUE: 1,
    IN_PRODUCTION: 2,
    READY: 3,
    DISPATCHED: 4,
    DELIVERED: 5,
    ON_HOLD: -1,
    CANCELLED: -1,
    REFUNDED: -1,
    QUOTING: -1,
  };

  const idx = order ? (stateToIndex[order.state] ?? 0) : 0;
  const isTerminal = order && ["DELIVERED", "CANCELLED", "REFUNDED"].includes(order.state);
  const isCancelled = order && order.state === "CANCELLED";

  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      <Coord>ORDER TRACKING</Coord>
      <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
        Track your order
      </Heading>
      <p className="text-base text-thread mt-6 max-w-[460px] leading-relaxed">
        Enter your order number to see real-time status — from the cutting bed
        to your doorstep.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          track(q);
        }}
        className="mt-8 flex gap-3 flex-wrap"
      >
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thread" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. SKY-ABC123"
            className="w-full bg-bone border border-hairline pl-10 pr-4 py-3.5 text-base text-ink focus:border-laser outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-6 py-3.5 hover:bg-laser hover:text-white transition-colors disabled:opacity-30"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Track
        </button>
      </form>

      {/* Loading */}
      {loading && (
        <div className="mt-10 bg-vellum border border-hairline p-5 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-laser animate-spin" />
          <span className="text-sm text-thread">Looking up your order…</span>
        </div>
      )}

      {/* Error / Not found */}
      {searched && !loading && (error || !order) && (
        <div className="mt-10 bg-vellum border-l-2 border-laser p-6">
          <Coord>NOT FOUND</Coord>
          <p className="text-sm text-ink mt-3">
            {error || `We couldn't find an order matching ${searched}. Check the number and try again.`}
          </p>
          <button
            onClick={() => {
              setSearched(null);
              setQ("");
              setError(null);
              setOrder(null);
            }}
            className="mt-5 inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-3 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
          >
            Try another
          </button>
        </div>
      )}

      {/* Result */}
      {searched && !loading && order && !error && (
        <div className="mt-10 space-y-8">
          {/* Cancelled banner */}
          {isCancelled && (
            <div className="bg-oxblood/10 border-l-2 border-oxblood p-4">
              <p className="text-sm text-oxblood font-medium">This order has been cancelled.</p>
            </div>
          )}

          {/* Summary */}
          <div className="bg-vellum border border-hairline p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <Coord>ORDER NUMBER</Coord>
                <div className="font-mono text-xl font-bold text-ink tnum mt-1">{order.orderNumber}</div>
              </div>
              <div className="text-right">
                <Coord>STATUS</Coord>
                <div className="inline-flex items-center gap-2 text-sm font-medium text-laser mt-1">
                  <span className={`w-2 h-2 bg-laser rounded-full ${!isTerminal ? "animate-laser-pulse" : ""}`} />
                  {order.state.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                </div>
              </div>
            </div>
            <div className="h-px bg-hairline my-5" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              <Meta k="Service" v={order.serviceLabel || order.serviceType} />
              <Meta k="Quantity" v={`${order.quantity} ${order.quantity === 1 ? "piece" : "pieces"}`} />
              <Meta k="Total" v={formatNaira(order.totalAmount)} />
              <Meta k="SLA" v={order.sla || "Standard"} />
            </div>
          </div>

          {/* Timeline */}
          {idx >= 0 && !isCancelled && (
            <div className="bg-vellum border border-hairline p-6 sm:p-8">
              <Coord>ORDER TIMELINE</Coord>
              <div className="mt-7 relative">
                <div className="absolute left-[19px] top-5 bottom-5 w-px bg-kerf" />
                {TRACK_STATES.map((s, i) => {
                  const Icon = STEP_ICONS[i] ?? Package;
                  const done = i < idx;
                  const now = i === idx;
                  return (
                    <div key={s.key} className="relative flex gap-5 items-start pb-8 last:pb-0">
                      <div
                        className={`relative z-10 shrink-0 w-10 h-10 flex items-center justify-center border ${
                          done
                            ? "bg-laser border-laser text-white"
                            : now
                              ? "bg-laser border-laser text-white animate-laser-pulse"
                              : "bg-bone border-hairline text-thread"
                        }`}
                      >
                        <Icon className="w-4 h-4" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 pt-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-display font-semibold text-base ${now || done ? "text-ink" : "text-thread"}`}>
                            {s.label}
                          </span>
                          {now && (
                            <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 bg-laser text-white">
                              in progress
                            </span>
                          )}
                          {done && (
                            <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 bg-ink text-bone">
                              done
                            </span>
                          )}
                        </div>
                        <p className={`text-sm mt-1 leading-relaxed ${now || done ? "text-thread" : "text-thread/60"}`}>
                          {s.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => onNavigate("contact")}
              className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-3 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
            >
              Questions about this order?
            </button>
            <button
              onClick={() => {
                setSearched(null);
                setQ("");
                setOrder(null);
                setError(null);
              }}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-3 hover:bg-laser hover:text-white transition-colors"
            >
              Track another <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread mb-1">{k}</div>
      <div className="text-sm text-ink">{v}</div>
    </div>
  );
}
