"use client";

import { useEffect, useState } from "react";
import { formatNaira, type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Scissors,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  LogOut,
  Plus,
  Loader2,
  RefreshCw,
  X,
  AlertTriangle,
  Flag,
  Clock,
  MessageSquare,
  User,
  Edit3,
  Save,
  RotateCcw,
  Bell,
  Check,
  Mail,
  Phone,
} from "lucide-react";

/* ── Relative time formatter (e.g. "2 hours ago") for Recent Updates ── */
function relativeTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

interface Order {
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
  createdAt: string;
  updatedAt: string;
}

interface TimelineEntry {
  state: string;
  timestamp: string;
  note?: string | null;
  changedBy?: string | null;
}

interface OrderDetail extends Order {
  deliveryAddress?: string | null;
  timeline?: TimelineEntry[];
  trackingPin?: string | null;
}

interface Escalation {
  id: string;
  ticketId?: string;
  orderNumber?: string;
  reason: string;
  message?: string;
  status: string;
  response?: string | null;
  createdAt: string;
  updatedAt?: string;
}

const STATE_COLOR: Record<string, string> = {
  PAYMENT_PENDING: "text-leather",
  PAYMENT_SUCCESS: "text-laser",
  IN_QUEUE: "text-laser",
  IN_PRODUCTION: "text-laser",
  READY: "text-ink",
  DISPATCHED: "text-thread",
  DELIVERED: "text-thread",
  CANCELLED: "text-leather",
  REFUNDED: "text-leather",
  ON_HOLD: "text-leather",
  QUOTING: "text-thread",
};

const STATE_LABEL: Record<string, string> = {
  PAYMENT_PENDING: "Awaiting payment",
  PAYMENT_SUCCESS: "Payment received",
  IN_QUEUE: "In queue",
  IN_PRODUCTION: "On the bed",
  READY: "Quality checked",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  ON_HOLD: "On hold",
  QUOTING: "Quoting",
};

const ESCALATION_REASONS = [
  "Quality issue",
  "Delay",
  "Wrong item",
  "Other",
] as const;

const ESCALATION_STATUS_COLOR: Record<string, string> = {
  OPEN: "text-laser",
  PENDING: "text-laser",
  IN_REVIEW: "text-laser",
  RESOLVED: "text-thread",
  CLOSED: "text-thread",
  REJECTED: "text-leather",
};

export default function DashboardView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("there");
  const [phone, setPhone] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Detail dialog state ── */
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailData, setDetailData] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  /* ── Escalation form state ── */
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateReason, setEscalateReason] = useState<(typeof ESCALATION_REASONS)[number]>("Quality issue");
  const [escalateMessage, setEscalateMessage] = useState("");
  const [escalateSubmitting, setEscalateSubmitting] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);

  /* ── Escalations list state ── */
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [escalationsLoading, setEscalationsLoading] = useState(false);

  /* ── Profile edit state ── */
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  const fetchOrders = async (phoneVal: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneVal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || "Failed to load orders");
        setOrders([]);
      } else {
        setOrders(data.data?.orders || []);
      }
    } catch {
      setError("Network error. Please try again.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEscalations = async (phoneVal: string) => {
    setEscalationsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/escalations?phone=${encodeURIComponent(phoneVal)}`);
      const data = await res.json();
      if (!res.ok) {
        // The escalations endpoint may not be live yet — silently show empty.
        setEscalations([]);
      } else {
        // API returns { data: { escalations: [...] } } — handle both
        // the nested shape and a plain array fallback.
        const list = data.data?.escalations || data.escalations || (Array.isArray(data.data) ? data.data : data);
        setEscalations(Array.isArray(list) ? list : []);
      }
    } catch {
      setEscalations([]);
    } finally {
      setEscalationsLoading(false);
    }
  };

  const fetchOrderDetail = async (orderNumber: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);
    try {
      const res = await fetch(`${API_URL}/api/orders?id=${encodeURIComponent(orderNumber)}`);
      const data = await res.json();
      if (!res.ok) {
        setDetailError(data?.error?.message || "Failed to load order details");
      } else {
        setDetailData(data.data || data);
      }
    } catch {
      setDetailError("Network error. Please try again.");
    } finally {
      setDetailLoading(false);
    }
  };

  const submitEscalation = async () => {
    if (!detailOrder) return;
    if (!escalateMessage.trim()) {
      setEscalateError("Please describe the issue in the message field.");
      return;
    }
    setEscalateSubmitting(true);
    setEscalateError(null);
    try {
      const res = await fetch(`${API_URL}/api/escalations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: detailOrder.orderNumber,
          customerPhone: phone,
          customerName: detailOrder.customerName || name,
          reason: escalateReason,
          message: escalateMessage.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEscalateError(data?.error?.message || "Failed to submit escalation. Please try again.");
        setEscalateSubmitting(false);
        return;
      }
      const ticket = data.data?.ticketId || data.data?.id || data.ticketId || data.id || "—";
      toast({
        title: "Escalation submitted",
        description: `Ticket ${ticket} — our team will review and respond shortly.`,
      });
      setShowEscalate(false);
      setEscalateMessage("");
      setEscalateError(null);
      // Refresh escalations list
      if (phone) fetchEscalations(phone);
    } catch {
      setEscalateError("Network error. Please try again.");
    } finally {
      setEscalateSubmitting(false);
    }
  };

  const openDetail = (o: Order) => {
    setDetailOrder(o);
    setShowEscalate(false);
    setEscalateError(null);
    setEscalateMessage("");
    setEscalateReason("Quality issue");
    fetchOrderDetail(o.orderNumber);
  };

  const closeDetail = () => {
    setDetailOrder(null);
    setDetailData(null);
    setDetailError(null);
    setShowEscalate(false);
    setEscalateError(null);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("skyal_customer");
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.name) {
          setName(c.name);
          setSignedIn(true);
          if (c.phone) {
            setPhone(c.phone);
            fetchOrders(c.phone);
            fetchEscalations(c.phone);
          } else {
            // Signed in but no phone on file — can't fetch orders. Keep
            // loading true so we don't flash the empty dashboard before
            // the redirect fires.
            onNavigate("login");
          }
        } else {
          // Stored customer is invalid — redirect to login.
          onNavigate("login");
        }
      } else {
        // No customer at all — redirect to login immediately.
        onNavigate("login");
      }
    } catch {
      onNavigate("login");
    }
  }, []);

  /* ── Profile: open editor with current values ── */
  const openProfileEdit = () => {
    setEditName(name === "there" ? "" : name);
    setEditPhone(phone);
    setEditEmail("");
    try {
      const raw = localStorage.getItem("skyal_customer");
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.email) setEditEmail(c.email);
        if (c?.name) setEditName(c.name);
        if (c?.phone) setEditPhone(c.phone);
      }
    } catch {
      // ignore
    }
    setProfileSaved(false);
    setShowProfileEdit(true);
  };

  /* ── Profile: save updated details to localStorage ── */
  const saveProfile = () => {
    const next = {
      name: editName.trim() || name,
      phone: editPhone.trim() || phone,
      email: editEmail.trim(),
    };
    try {
      localStorage.setItem("skyal_customer", JSON.stringify(next));
    } catch {
      // ignore
    }
    setName(next.name);
    setPhone(next.phone);
    setProfileSaved(true);
    toast({
      title: "Profile updated",
      description: "Your details have been saved on this device.",
    });
    // Auto-close after a brief confirmation flash.
    setTimeout(() => {
      setShowProfileEdit(false);
      setProfileSaved(false);
    }, 900);
  };

  /* ── Reorder: stash service + qty, jump to the order view (Feature 2) ── */
  const handleReorder = (o: Order) => {
    try {
      sessionStorage.setItem(
        "skyal_reorder",
        JSON.stringify({
          serviceType: o.serviceType,
          serviceLabel: o.serviceLabel,
          quantity: o.quantity,
        })
      );
    } catch {
      // ignore
    }
    onNavigate("order");
  };

  /* ── Track: stash order number so TrackView pre-fills it (Bug 3) ── */
  const handleTrackOrder = (orderNumber: string) => {
    try {
      sessionStorage.setItem("skyal_track", orderNumber);
    } catch {
      // ignore
    }
    closeDetail();
    onNavigate("track");
  };

  const total = orders.length;
  const inProgress = orders.filter((o) => ["IN_QUEUE", "IN_PRODUCTION", "READY", "PAYMENT_SUCCESS"].includes(o.state)).length;
  const delivered = orders.filter((o) => o.state === "DELIVERED").length;
  const spent = orders.filter((o) => !["CANCELLED", "REFUNDED"].includes(o.state)).reduce((s, o) => s + o.totalAmount, 0);

  /* ── Recent Updates: last 3 orders by updatedAt (Feature 3) ── */
  const recentUpdates = [...orders]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 3);

  // While loading or before we've confirmed the customer, render only a
  // minimal spinner — never the "Welcome back, there" empty state.
  if (loading || !signedIn) {
    return (
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-24 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-6 h-6 text-laser animate-spin" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
          {loading ? "Loading dashboard" : "Redirecting to sign in"}
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <Coord>YOUR DASHBOARD</Coord>
          <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
            Welcome back, {name.split(" ")[0]}
          </Heading>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={openProfileEdit}
            className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-2.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
          >
            <User className="w-4 h-4" /> Profile
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("skyal_customer");
              setSignedIn(false);
              setName("there");
              setOrders([]);
              setEscalations([]);
              setPhone("");
              onNavigate("login");
            }}
            className="inline-flex items-center gap-2 text-sm text-thread hover:text-ink transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>

      {/* Recent Updates (Feature 3) */}
      {recentUpdates.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-laser" />
            <Coord>RECENT UPDATES</Coord>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentUpdates.map((o) => (
              <button
                key={o.orderNumber}
                onClick={() => openDetail(o)}
                className="text-left bg-vellum border border-hairline p-4 hover:border-ink/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-sm font-bold text-laser">{o.orderNumber}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-thread">
                    {relativeTime(o.updatedAt || o.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-ink leading-relaxed">
                  Moved to{" "}
                  <span className={`font-medium ${STATE_COLOR[o.state] || "text-thread"}`}>
                    {STATE_LABEL[o.state] || o.state.replace(/_/g, " ").toLowerCase()}
                  </span>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mt-2">
                  {o.serviceLabel || o.serviceType} · Qty {o.quantity}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Profile card (Feature 1) */}
      {showProfileEdit ? (
        <div className="mt-10 bg-vellum border border-hairline p-6">
          <div className="flex items-center gap-2 mb-5">
            <User className="w-4 h-4 text-laser" />
            <Coord>EDIT YOUR PROFILE</Coord>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                Name
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                Phone
              </label>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+234…"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                Email
              </label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-5 justify-end">
            <button
              onClick={() => {
                setShowProfileEdit(false);
                setProfileSaved(false);
              }}
              className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-4 py-2.5 hover:border-ink transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveProfile}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-4 py-2.5 hover:bg-laser hover:text-white transition-colors"
            >
              {profileSaved ? (
                <>
                  <Check className="w-4 h-4" /> Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-10 bg-vellum border border-hairline p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-laser text-bone flex items-center justify-center font-display font-bold text-lg shrink-0">
              {(name && name.charAt(0).toUpperCase()) || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{name}</p>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {phone && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-thread">
                    <Phone className="w-3 h-3" /> {phone}
                  </span>
                )}
                {(() => {
                  let email = "";
                  try {
                    const raw = localStorage.getItem("skyal_customer");
                    if (raw) email = JSON.parse(raw)?.email || "";
                  } catch {
                    // ignore
                  }
                  return email ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-thread truncate">
                      <Mail className="w-3 h-3" /> {email}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
          <button
            onClick={openProfileEdit}
            className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-4 py-2.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors self-start sm:self-auto"
          >
            <Edit3 className="w-4 h-4" /> Edit profile
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
        <StatCard icon={Package} label="Total Orders" value={String(total)} />
        <StatCard icon={Scissors} label="In Progress" value={String(inProgress)} />
        <StatCard icon={CheckCircle2} label="Delivered" value={String(delivered)} />
        <StatCard icon={TrendingUp} label="Total Spent" value={formatNaira(spent)} />
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 flex-wrap mt-8">
        <button
          onClick={() => onNavigate("order")}
          className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-2.5 hover:bg-laser hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> Place New Order
        </button>
        <button
          onClick={() => onNavigate("track")}
          className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-2.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
        >
          Track an Order
        </button>
        <button
          onClick={() => onNavigate("chat")}
          className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-2.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
        >
          Get Support
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-12 bg-vellum border border-hairline p-8 flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 text-laser animate-spin" />
          <span className="text-sm text-thread">Loading your orders…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="mt-12 bg-vellum border-l-2 border-leather p-6">
          <p className="text-sm text-leather">{error}</p>
          {signedIn && (
            <button
              onClick={() => {
                if (phone) fetchOrders(phone);
              }}
              className="mt-4 inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-4 py-2 hover:border-ink transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && orders.length === 0 && (
        <div className="mt-12 bg-vellum border border-hairline p-10 text-center">
          <Package className="w-10 h-10 text-thread mx-auto mb-4" />
          <p className="text-sm font-medium text-ink">No orders yet</p>
          <p className="text-xs text-thread mt-1">Place your first order to get started.</p>
          <button
            onClick={() => onNavigate("order")}
            className="mt-6 inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-2.5 hover:bg-laser hover:text-white transition-colors"
          >
            Place an Order <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Orders table */}
      {!loading && !error && orders.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <Coord>RECENT ORDERS · click a row for details</Coord>
            {signedIn && (
              <button
                onClick={() => {
                  if (phone) fetchOrders(phone);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-thread hover:text-ink transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            )}
          </div>
          <div className="bg-vellum border border-hairline overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-thread py-3 px-4">Order #</th>
                  <th className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-thread py-3 px-4">Service</th>
                  <th className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-thread py-3 px-4">Status</th>
                  <th className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-thread py-3 px-4 hidden sm:table-cell">Date</th>
                  <th className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-thread py-3 px-4">Amount</th>
                  <th className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-thread py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.orderNumber}
                    onClick={() => openDetail(o)}
                    className="border-b border-hairline last:border-b-0 hover:bg-bone cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span className="font-mono text-sm font-medium text-laser">{o.orderNumber}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-thread">{o.serviceLabel || o.serviceType}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATE_COLOR[o.state] || "text-thread"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${["IN_PRODUCTION", "IN_QUEUE", "PAYMENT_SUCCESS"].includes(o.state) ? "bg-laser animate-laser-pulse" : STATE_COLOR[o.state]?.includes("leather") ? "bg-leather" : "bg-thread"}`} />
                        {STATE_LABEL[o.state] || o.state}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-thread hidden sm:table-cell">
                      {new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="py-3 px-4 text-sm text-ink font-medium text-right">{formatNaira(o.totalAmount)}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReorder(o);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-laser hover:text-ink transition-colors"
                        title="Place a new order with the same service & quantity"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reorder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Escalations section */}
      {!loading && !error && signedIn && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <Coord>YOUR ESCALATIONS</Coord>
            {escalations.length > 0 && (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread">
                {escalations.length} {escalations.length === 1 ? "ticket" : "tickets"}
              </span>
            )}
          </div>

          {escalationsLoading ? (
            <div className="bg-vellum border border-hairline p-6 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-laser animate-spin" />
              <span className="text-sm text-thread">Loading escalations…</span>
            </div>
          ) : escalations.length === 0 ? (
            <div className="bg-vellum border border-hairline p-6 flex items-start gap-3">
              <Flag className="w-4 h-4 text-thread mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-ink">No escalations yet.</p>
                <p className="text-xs text-thread mt-1">
                  Open any order to raise an escalation if something isn&apos;t right — our team will respond within 24 hours.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {escalations.map((e) => (
                <div key={e.id || e.ticketId} className="bg-vellum border border-hairline p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <span className="font-mono text-sm font-bold text-ink">
                          {e.ticketId || e.id}
                        </span>
                        {e.orderNumber && (
                          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-thread">
                            order · {e.orderNumber}
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border text-[10px] font-medium uppercase tracking-[0.12em] ${
                          (ESCALATION_STATUS_COLOR[e.status?.toUpperCase()] || "text-thread")
                        } border-hairline bg-bone`}>
                          <span className="w-1 h-1 rounded-full bg-current" />
                          {e.status || "open"}
                        </span>
                      </div>
                      <p className="text-sm text-ink mt-1">
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-thread">reason · </span>
                        {e.reason}
                      </p>
                      {e.message && (
                        <p className="text-xs text-thread mt-1.5 leading-relaxed">{e.message}</p>
                      )}
                      {e.response && (
                        <div className="mt-3 pt-3 border-t border-hairline bg-bone -mx-5 -mb-5 px-5 pb-5 pt-3">
                          <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-3.5 h-3.5 text-laser" />
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-laser font-medium">
                              Team Response
                            </p>
                          </div>
                          <p className="text-xs text-ink leading-relaxed">{e.response}</p>
                          {e.updatedAt && (
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mt-2">
                              Responded {new Date(e.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mb-0.5">
                        opened
                      </p>
                      <p className="text-xs text-ink">
                        {new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Help */}
      {!loading && !error && (
        <div className="mt-10 bg-vellum border border-hairline p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">Need help with an order?</p>
            <p className="text-sm text-thread mt-0.5">Our support team is available 06:00–22:00 WAT.</p>
          </div>
          <button
            onClick={() => onNavigate("chat")}
            className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-2.5 hover:bg-laser hover:text-white transition-colors"
          >
            Chat with Us
          </button>
        </div>
      )}

      {/* ── Order detail dialog ── */}
      {detailOrder && (
        <div
          className="fixed inset-0 z-[200] bg-ink/60 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={closeDetail}
        >
          <div
            className="bg-bone border border-hairline w-full max-w-2xl my-4 sm:my-0 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div className="flex items-start justify-between p-5 sm:p-6 border-b border-hairline">
              <div>
                <Coord>ORDER DETAILS</Coord>
                <div className="font-mono text-xl font-bold text-laser mt-2 tnum">{detailOrder.orderNumber}</div>
              </div>
              <button
                onClick={closeDetail}
                className="text-thread hover:text-ink transition-colors p-1 -m-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog body */}
            <div className="p-5 sm:p-6 max-h-[60vh] overflow-y-auto">
              {detailLoading && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <Loader2 className="w-5 h-5 text-laser animate-spin" />
                  <span className="text-sm text-thread">Loading details…</span>
                </div>
              )}

              {detailError && !detailLoading && (
                <div className="border-l-2 border-leather bg-vellum p-4 flex items-start gap-2 text-leather">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-sm">{detailError}</p>
                </div>
              )}

              {!detailLoading && !detailError && (
                <>
                  {/* Status row */}
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <span className={`inline-flex items-center gap-2 text-sm font-medium ${STATE_COLOR[detailOrder.state] || "text-thread"}`}>
                      <span className={`w-2 h-2 rounded-full ${["IN_PRODUCTION", "IN_QUEUE", "PAYMENT_SUCCESS"].includes(detailOrder.state) ? "bg-laser animate-laser-pulse" : STATE_COLOR[detailOrder.state]?.includes("leather") ? "bg-leather" : "bg-thread"}`} />
                      {STATE_LABEL[detailOrder.state] || detailOrder.state}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-thread">
                      {new Date(detailOrder.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>

                  {/* Detail grid */}
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-4 bg-vellum border border-hairline p-5">
                    <DetailItem k="Service" v={detailOrder.serviceLabel || detailOrder.serviceType} />
                    <DetailItem k="Quantity" v={String(detailOrder.quantity)} />
                    <DetailItem k="Total" v={formatNaira(detailOrder.totalAmount)} />
                    <DetailItem k="SLA" v={detailOrder.sla || "Standard"} />
                    <DetailItem
                      k="Delivery"
                      v={detailOrder.deliveryMethod ? detailOrder.deliveryMethod.replace(/_/g, " ").toLowerCase() : "—"}
                    />
                    {detailData?.deliveryAddress && (
                      <DetailItem k="Address" v={detailData.deliveryAddress} />
                    )}
                    {detailData?.trackingPin && (
                      <DetailItem k="Tracking PIN" v={detailData.trackingPin} />
                    )}
                  </dl>

                  {/* Timeline */}
                  {detailData?.timeline && detailData.timeline.length > 0 && (
                    <div className="mt-6">
                      <Coord>TIMELINE</Coord>
                      <ol className="mt-4 space-y-3">
                        {detailData.timeline.map((t, i) => (
                          <li key={i} className="flex gap-3 items-start">
                            <div className="flex flex-col items-center pt-1">
                              <span className={`w-2 h-2 rounded-full ${i === detailData.timeline!.length - 1 ? "bg-laser" : "bg-kerf"}`} />
                              {i < detailData.timeline!.length - 1 && <span className="w-px h-6 bg-hairline mt-1" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-ink">
                                {STATE_LABEL[t.state] || t.state.replace(/_/g, " ").toLowerCase()}
                              </p>
                              <p className="font-mono text-[10px] text-thread mt-0.5">
                                {new Date(t.timestamp).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                              {t.note && <p className="text-xs text-thread mt-1 italic">{t.note}</p>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Escalate form */}
                  {showEscalate ? (
                    <div className="mt-6 bg-vellum border border-hairline p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Flag className="w-4 h-4 text-leather" />
                        <Coord>ESCALATE THIS ORDER</Coord>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">Reason</label>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {ESCALATION_REASONS.map((r) => (
                              <button
                                key={r}
                                onClick={() => setEscalateReason(r)}
                                className={`p-3 border text-left text-sm transition-colors ${
                                  escalateReason === r
                                    ? "border-laser bg-bone text-ink"
                                    : "border-hairline bg-bone text-thread hover:border-ink/40"
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                            Message
                          </label>
                          <textarea
                            value={escalateMessage}
                            onChange={(e) => setEscalateMessage(e.target.value)}
                            rows={3}
                            placeholder="Tell us what went wrong. The more detail, the faster we can fix it."
                            className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none resize-none"
                          />
                        </div>
                        {escalateError && (
                          <div className="border-l-2 border-leather bg-bone p-3 flex items-start gap-2 text-leather">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <p className="text-sm">{escalateError}</p>
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setShowEscalate(false);
                              setEscalateError(null);
                              setEscalateMessage("");
                            }}
                            disabled={escalateSubmitting}
                            className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-4 py-2.5 hover:border-ink transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={submitEscalation}
                            disabled={escalateSubmitting}
                            className="inline-flex items-center gap-2 bg-leather text-bone text-sm font-medium px-4 py-2.5 hover:bg-ink transition-colors disabled:opacity-50"
                          >
                            {escalateSubmitting ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Submitting
                              </>
                            ) : (
                              <>
                                <Flag className="w-4 h-4" /> Submit escalation
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleReorder(detailOrder)}
                        className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-4 py-2.5 hover:bg-laser hover:text-white transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" /> Reorder
                      </button>
                      <button
                        onClick={() => setShowEscalate(true)}
                        className="inline-flex items-center gap-2 border border-leather/40 text-leather text-sm font-medium px-4 py-2.5 hover:bg-leather hover:text-bone transition-colors"
                      >
                        <Flag className="w-4 h-4" /> Escalate this order
                      </button>
                      <button
                        onClick={() => handleTrackOrder(detailOrder.orderNumber)}
                        className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-4 py-2.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
                      >
                        <ArrowRight className="w-4 h-4" /> Track this order
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Dialog footer */}
            <div className="border-t border-hairline p-4 sm:p-5 flex items-center justify-between gap-3 bg-vellum">
              <div className="flex items-center gap-1.5 text-[11px] text-thread">
                <Clock className="w-3.5 h-3.5" />
                <span>Opened {new Date(detailOrder.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
              <button
                onClick={closeDetail}
                className="inline-flex items-center gap-2 text-sm text-thread hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" /> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-vellum border border-hairline p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread">{label}</span>
        <Icon className="w-4 h-4 text-thread" />
      </div>
      <div className="text-2xl font-display font-bold text-ink tnum">{value}</div>
    </div>
  );
}

function DetailItem({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-thread mb-1">{k}</dt>
      <dd className="text-sm text-ink break-words">{v}</dd>
    </div>
  );
}
