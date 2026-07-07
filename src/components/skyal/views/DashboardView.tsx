"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNaira, type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { EscalationThread } from "../EscalationThread";
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
  MapPin,
  FileText,
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

/* ── Pretty-print a stored delivery address. Some legacy orders stored the
   address as a JSON blob (e.g. {"line1":"…","city":"…"}); if we detect
   JSON we collapse the values into a readable single-line string. ── */
function prettyAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).join(", ");
      if (parsed && typeof parsed === "object") {
        const parts = Object.values(parsed).filter((v) => typeof v === "string" && v.trim());
        if (parts.length) return parts.join(", ");
      }
    } catch {
      // not real JSON — fall through to the raw string
    }
  }
  return trimmed;
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
  canModify?: boolean;
  canCancel?: boolean;
  gracePeriodExpires?: string | null;
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
  messageCount?: number;
  lastAdminMessageAt?: string | null;
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
  RESPONDED: "text-laser",
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

  /* ── Escalation thread dialog (chat) ── */
  const [threadEscalation, setThreadEscalation] = useState<Escalation | null>(null);

  /* ── Order modify form (24h grace) ── */
  const [showModify, setShowModify] = useState(false);
  const [modifyQty, setModifyQty] = useState(1);
  const [modifyAddress, setModifyAddress] = useState("");
  const [modifySubmitting, setModifySubmitting] = useState(false);
  const [modifyError, setModifyError] = useState<string | null>(null);
  const [modifySuccess, setModifySuccess] = useState<string | null>(null);

  /* ── Order cancel form (24h grace) ── */
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  /* ── Email-me-updates preferences ── */
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [prefEmail, setPrefEmail] = useState<string | null>(null);
  const [emailPrefSaving, setEmailPrefSaving] = useState(false);
  const [emailPrefError, setEmailPrefError] = useState<string | null>(null);
  const [emailPrefSaved, setEmailPrefSaved] = useState(false);

  /* ── Profile edit state ── */
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState("");
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

  const fetchOrderDetail = async (orderNumber: string): Promise<OrderDetail | null> => {
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);
    try {
      const res = await fetch(`${API_URL}/api/orders?id=${encodeURIComponent(orderNumber)}`);
      const data = await res.json();
      if (!res.ok) {
        setDetailError(data?.error?.message || "Failed to load order details");
        return null;
      }
      const detail: OrderDetail = data.data || data;
      setDetailData(detail);
      return detail;
    } catch {
      setDetailError("Network error. Please try again.");
      return null;
    } finally {
      setDetailLoading(false);
    }
  };

  /* ── Email-me-updates preferences ── */
  const loadEmailPreferences = useCallback(async (phoneVal: string) => {
    try {
      const res = await fetch(`${API_URL}/api/customer/preferences?phone=${encodeURIComponent(phoneVal)}`);
      const data = await res.json();
      if (!res.ok) return;
      const prefs = data.data || data;
      setEmailNotifications(!!prefs?.emailNotifications);
      setPrefEmail(prefs?.customerEmail || null);
    } catch {
      // Endpoint may not be live yet — fall back to defaults silently.
    }
  }, []);

  const handleToggleEmailPref = useCallback(
    async (next: boolean) => {
      if (!phone || emailPrefSaving) return;
      const prev = emailNotifications;
      setEmailNotifications(next);
      setEmailPrefError(null);
      setEmailPrefSaving(true);
      try {
        const res = await fetch(`${API_URL}/api/customer/preferences`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerPhone: phone,
            emailNotifications: next,
            customerEmail: prefEmail || editEmail || undefined,
            customerName: name || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error?.message || "Could not update preferences.");
        }
        setEmailPrefSaved(true);
        setTimeout(() => setEmailPrefSaved(false), 1500);
      } catch (err) {
        setEmailNotifications(prev); // revert on failure
        setEmailPrefError(err instanceof Error ? err.message : "Could not update preferences. Try again.");
      } finally {
        setEmailPrefSaving(false);
      }
    },
    [phone, name, emailNotifications, emailPrefSaving, prefEmail, editEmail],
  );

  const submitEscalation = async () => {
    if (!detailOrder) return;
    const reason = escalateReason;
    const message = escalateMessage.trim();
    if (!message) {
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
          reason,
          message,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEscalateError(data?.error?.message || "Failed to submit escalation. Please try again.");
        setEscalateSubmitting(false);
        return;
      }
      const ticket = data.data?.ticketId || data.data?.id || data.ticketId || data.id || "";
      toast({
        title: "Escalation submitted",
        description: `Ticket ${ticket} — our team will review and respond shortly.`,
      });
      setShowEscalate(false);
      setEscalateMessage("");
      setEscalateError(null);
      // Refresh escalations list, then auto-open the new ticket's thread
      // so the customer can continue the conversation immediately.
      if (phone) await fetchEscalations(phone);
      closeDetail();
      if (ticket) {
        setThreadEscalation({
          id: ticket,
          ticketId: ticket,
          orderNumber: detailOrder.orderNumber,
          reason,
          message,
          status: "OPEN",
          response: null,
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      setEscalateError("Network error. Please try again.");
    } finally {
      setEscalateSubmitting(false);
    }
  };

  /* ── Reset all detail-dialog sub-forms (modify / cancel / escalate) ── */
  const resetDetailForms = () => {
    setShowEscalate(false);
    setEscalateError(null);
    setEscalateMessage("");
    setEscalateReason("Quality issue");
    setShowModify(false);
    setModifyError(null);
    setModifySuccess(null);
    setModifyQty(1);
    setModifyAddress("");
    setShowCancel(false);
    setCancelError(null);
    setCancelReason("");
  };

  const openDetail = (o: Order) => {
    setDetailOrder(o);
    setDetailData(null);
    setDetailError(null);
    resetDetailForms();
    // Prefill the modify form defaults from the list-row so the form is
    // usable even before the detail fetch resolves.
    setModifyQty(o.quantity ?? 1);
    setModifyAddress("");
    fetchOrderDetail(o.orderNumber).then((detail) => {
      if (detail) {
        setModifyQty(detail.quantity ?? o.quantity ?? 1);
        setModifyAddress(prettyAddress(detail.deliveryAddress));
      }
    });
  };

  const closeDetail = () => {
    setDetailOrder(null);
    setDetailData(null);
    setDetailError(null);
    resetDetailForms();
  };

  /* ── Submit a modification (quantity + delivery address) within 24h grace ── */
  const submitModify = async () => {
    if (!detailOrder) return;
    if (modifyQty < 1) {
      setModifyError("Quantity must be at least 1.");
      return;
    }
    setModifySubmitting(true);
    setModifyError(null);
    setModifySuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/orders/${encodeURIComponent(detailOrder.orderNumber)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "modify",
          customerPhone: phone,
          quantity: modifyQty,
          deliveryAddress: modifyAddress.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Could not modify the order. Please try again.");
      }
      const result = data.data || data;
      const newTotal = result?.totalAmount;
      setModifySuccess(
        typeof newTotal === "number"
          ? `Order updated. New total: ${formatNaira(newTotal)}.`
          : "Order updated successfully.",
      );
      // Refresh the order detail + orders list so the displayed total stays in sync.
      try {
        const freshRes = await fetch(`${API_URL}/api/orders?id=${encodeURIComponent(detailOrder.orderNumber)}`);
        const freshData = await freshRes.json();
        if (freshRes.ok) {
          const fresh = freshData.data || freshData;
          setDetailData(fresh);
          setModifyQty(fresh?.quantity ?? modifyQty);
          setModifyAddress(prettyAddress(fresh?.deliveryAddress));
        }
      } catch {
        // non-fatal — the success banner already shows the new total.
      }
      if (phone) fetchOrders(phone);
    } catch (err) {
      setModifyError(err instanceof Error ? err.message : "Could not modify the order. Please try again.");
    } finally {
      setModifySubmitting(false);
    }
  };

  /* ── Cancel the order within 24h grace ── */
  const submitCancel = async () => {
    if (!detailOrder) return;
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      const res = await fetch(`${API_URL}/api/orders/${encodeURIComponent(detailOrder.orderNumber)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          customerPhone: phone,
          reason: cancelReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Could not cancel the order. Please try again.");
      }
      toast({
        title: "Order cancelled",
        description: `${detailOrder.orderNumber} has been cancelled.`,
      });
      closeDetail();
      if (phone) {
        fetchOrders(phone);
        fetchEscalations(phone);
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not cancel the order. Please try again.");
    } finally {
      setCancelSubmitting(false);
    }
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
            loadEmailPreferences(c.phone);
          } else {
            // Signed in but no phone on file — can't fetch orders.
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
    setEditEmail("");
    try {
      const raw = localStorage.getItem("skyal_customer");
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.email) setEditEmail(c.email);
        if (c?.name) setEditName(c.name);
        if (c?.phone) setPhone(c.phone);
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
      email: editEmail.trim(),
      phone,
    };
    try {
      localStorage.setItem("skyal_customer", JSON.stringify(next));
    } catch {
      // ignore
    }
    setName(next.name);
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

  /* ── Reorder: stash service + qty, jump to the order view ── */
  const handleReorder = (o: Order) => {
    try {
      sessionStorage.setItem(
        "skyal_reorder",
        JSON.stringify({
          serviceType: o.serviceType,
          serviceLabel: o.serviceLabel,
          quantity: o.quantity,
        }),
      );
    } catch {
      // ignore
    }
    onNavigate("order");
  };

  /* ── Track: stash order number so TrackView pre-fills it ── */
  const handleTrackOrder = (orderNumber: string) => {
    try {
      sessionStorage.setItem("skyal_track", orderNumber);
    } catch {
      // ignore
    }
    closeDetail();
    onNavigate("track");
  };

  /* ── Escalation badge set: orderNumbers with an OPEN/RESPONDED ticket ── */
  const escalatedOrderNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const e of escalations) {
      const status = (e.status || "").toUpperCase();
      if ((status === "OPEN" || status === "RESPONDED") && e.orderNumber) {
        set.add(e.orderNumber);
      }
    }
    return set;
  }, [escalations]);

  const total = orders.length;
  const inProgress = orders.filter((o) => ["IN_QUEUE", "IN_PRODUCTION", "READY", "PAYMENT_SUCCESS"].includes(o.state)).length;
  const delivered = orders.filter((o) => o.state === "DELIVERED").length;
  const spent = orders.filter((o) => !["CANCELLED", "REFUNDED"].includes(o.state)).reduce((s, o) => s + o.totalAmount, 0);

  /* ── Recent Updates: last 3 orders by updatedAt ── */
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

      {/* Recent Updates */}
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

      {/* Profile card (edit + view with email-me-updates toggle) */}
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
                value={phone || ""}
                readOnly
                disabled
                placeholder="+234…"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink opacity-60 cursor-not-allowed outline-none"
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
        <div className="mt-10 bg-vellum border border-hairline p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

          {/* Email-me-updates toggle */}
          <div className="mt-5 pt-5 border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-ink">Email me order updates</p>
                {emailPrefSaved && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#16A34A]">
                    ✓ Saved
                  </span>
                )}
              </div>
              <p className="text-xs text-thread mt-1 leading-relaxed">
                {emailNotifications
                  ? prefEmail
                    ? `Order updates are sent to ${prefEmail}.`
                    : "Add an email to your profile to receive order updates."
                  : "Turn on to receive order status updates by email."}
              </p>
              {emailPrefError && (
                <p className="text-xs text-leather mt-1">{emailPrefError}</p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={emailNotifications}
              aria-label="Email me order updates"
              disabled={emailPrefSaving}
              onClick={() => handleToggleEmailPref(!emailNotifications)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                emailNotifications ? "bg-laser" : "bg-kerf"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  emailNotifications ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
        <StatCard icon={Package} label="Total Orders" value={String(total)} />
        <StatCard icon={Scissors} label="In Progress" value={String(inProgress)} />
        <StatCard icon={CheckCircle2} label="Delivered" value={String(delivered)} />
        <StatCard icon={TrendingUp} label="Total Spent" value={formatNaira(spent)} />
      </div>

      {/* Manage: address book + saved designs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <button
          onClick={() => onNavigate("addresses")}
          className="text-left bg-vellum border border-hairline p-5 hover:border-ink/40 transition-colors group"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-laser/10 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-laser" />
            </div>
            <div className="min-w-0">
              <Coord>ADDRESS BOOK</Coord>
              <p className="text-base font-display font-semibold text-ink mt-1">Delivery addresses</p>
              <p className="text-xs text-thread mt-1">Save and reuse addresses for faster checkout.</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => onNavigate("designs")}
          className="text-left bg-vellum border border-hairline p-5 hover:border-ink/40 transition-colors group"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-laser/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-laser" />
            </div>
            <div className="min-w-0">
              <Coord>SAVED DESIGNS</Coord>
              <p className="text-base font-display font-semibold text-ink mt-1">Design library</p>
              <p className="text-xs text-thread mt-1">Reuse files from past orders without re-uploading.</p>
            </div>
          </div>
        </button>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium text-laser">{o.orderNumber}</span>
                        {escalatedOrderNumbers.has(o.orderNumber) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-[#DC2626]/30 bg-[#DC2626]/10 text-[#DC2626] text-[9px] font-medium uppercase tracking-[0.12em] font-mono">
                            <AlertTriangle className="w-2.5 h-2.5" /> Escalated
                          </span>
                        )}
                      </div>
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
              {escalations.map((e) => {
                const statusKey = (e.status || "open").toUpperCase();
                const isResolved = statusKey === "RESOLVED" || statusKey === "CLOSED";
                return (
                  <div
                    key={e.id || e.ticketId}
                    role="button"
                    tabIndex={0}
                    onClick={() => setThreadEscalation(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setThreadEscalation(e);
                      }
                    }}
                    className="bg-vellum border border-hairline p-5 hover:border-ink/40 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-laser focus-visible:ring-offset-2"
                  >
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
                            (ESCALATION_STATUS_COLOR[statusKey] || "text-thread")
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
                          <p className="text-xs text-thread mt-1.5 leading-relaxed line-clamp-2">{e.message}</p>
                        )}
                        {e.response && (
                          <div className="mt-3 pt-3 border-t border-hairline">
                            <div className="flex items-center gap-2 mb-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-laser" />
                              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-laser font-medium">
                                Team Response
                              </p>
                            </div>
                            <p className="text-xs text-ink leading-relaxed line-clamp-2">{e.response}</p>
                          </div>
                        )}
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-laser mt-3">
                          Open thread →
                          {typeof e.messageCount === "number" ? `  ·  ${e.messageCount} message${e.messageCount === 1 ? "" : "s"}` : ""}
                        </p>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mb-0.5">
                          opened
                        </p>
                        <p className="text-xs text-ink">
                          {new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        {isResolved && (
                          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#16A34A] mt-2">
                            Resolved
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                    <DetailItem k="Service" v={detailData?.serviceLabel || detailOrder.serviceLabel || detailOrder.serviceType} />
                    <DetailItem k="Quantity" v={String(detailData?.quantity ?? detailOrder.quantity)} />
                    <DetailItem k="Total" v={formatNaira(detailData?.totalAmount ?? detailOrder.totalAmount)} />
                    <DetailItem k="SLA" v={detailData?.sla || detailOrder.sla || "Standard"} />
                    <DetailItem
                      k="Delivery"
                      v={
                        (detailData?.deliveryMethod || detailOrder.deliveryMethod)
                          ? (detailData?.deliveryMethod || detailOrder.deliveryMethod || "").replace(/_/g, " ").toLowerCase()
                          : "—"
                      }
                    />
                    {detailData?.deliveryAddress && (
                      <DetailItem k="Address" v={prettyAddress(detailData.deliveryAddress)} />
                    )}
                    {detailData?.trackingPin && (
                      <DetailItem k="Tracking PIN" v={detailData.trackingPin} />
                    )}
                  </dl>

                  {/* Status Timeline (always rendered; empty-state aware) */}
                  <div className="mt-6">
                    <Coord>TIMELINE</Coord>
                    {detailData?.timeline && detailData.timeline.length > 0 ? (
                      <ol className="mt-4 space-y-3">
                        {detailData.timeline.map((t, i) => (
                          <li key={i} className="flex gap-3 items-start">
                            <div className="flex flex-col items-center pt-1">
                              <span className={`w-2 h-2 rounded-full ${i === detailData.timeline!.length - 1 ? "bg-laser" : "bg-kerf"}`} />
                              {i < detailData.timeline!.length - 1 && <span className="w-px h-6 bg-hairline mt-1" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-ink">
                                  {STATE_LABEL[t.state] || t.state.replace(/_/g, " ").toLowerCase()}
                                </p>
                                {t.changedBy && (
                                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-thread">
                                    by {t.changedBy}
                                  </span>
                                )}
                              </div>
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
                    ) : (
                      <p className="text-xs text-thread italic mt-4">No history yet.</p>
                    )}
                  </div>

                  {/* Grace-period modify form (24h) */}
                  {showModify ? (
                    <div className="mt-6 bg-vellum border border-hairline p-5">
                      <Coord>MODIFY THIS ORDER</Coord>
                      <div className="space-y-4 mt-4">
                        <div>
                          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                            Quantity
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={modifyQty}
                            onChange={(e) => setModifyQty(Math.max(1, Number(e.target.value) || 1))}
                            className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
                          />
                        </div>
                        <div>
                          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                            Delivery address
                          </label>
                          <textarea
                            value={modifyAddress}
                            onChange={(e) => setModifyAddress(e.target.value)}
                            rows={3}
                            placeholder="Delivery address"
                            className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none resize-none"
                          />
                        </div>
                        {modifyError && (
                          <div className="border-l-2 border-leather bg-bone p-3 text-sm text-leather">
                            {modifyError}
                          </div>
                        )}
                        {modifySuccess && (
                          <div className="border-l-2 border-[#16A34A] bg-[#F0FDF4] p-3 text-sm text-[#166534]">
                            {modifySuccess}
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setShowModify(false);
                              setModifyError(null);
                              setModifySuccess(null);
                            }}
                            disabled={modifySubmitting}
                            className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-4 py-2.5 hover:border-ink transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={submitModify}
                            disabled={modifySubmitting}
                            className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-4 py-2.5 hover:bg-laser hover:text-white transition-colors disabled:opacity-60"
                          >
                            {modifySubmitting ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Saving
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4" /> Save changes
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : showCancel ? (
                    /* Grace-period cancel form (24h) */
                    <div className="mt-6 bg-[#FEF2F2] border border-[#DC2626]/30 p-5">
                      <Coord>CANCEL THIS ORDER</Coord>
                      <p className="text-xs text-thread mt-3 mb-4 leading-relaxed">
                        This will cancel the order and start a refund if payment was made. This action cannot be undone.
                      </p>
                      <div className="space-y-4">
                        <div>
                          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                            Reason (optional)
                          </label>
                          <textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            rows={2}
                            placeholder="Tell us why you're cancelling — helps us improve."
                            className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none resize-none"
                          />
                        </div>
                        {cancelError && (
                          <div className="border-l-2 border-[#DC2626] bg-bone p-3 text-sm text-[#DC2626]">
                            {cancelError}
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setShowCancel(false);
                              setCancelError(null);
                              setCancelReason("");
                            }}
                            disabled={cancelSubmitting}
                            className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-4 py-2.5 hover:border-ink transition-colors disabled:opacity-50"
                          >
                            Keep order
                          </button>
                          <button
                            onClick={submitCancel}
                            disabled={cancelSubmitting}
                            className="inline-flex items-center gap-2 bg-[#DC2626] text-white text-sm font-medium px-4 py-2.5 hover:bg-[#B91C1C] transition-colors disabled:opacity-60"
                          >
                            {cancelSubmitting ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Cancelling
                              </>
                            ) : (
                              <>
                                <X className="w-4 h-4" /> Confirm cancellation
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : showEscalate ? (
                    /* Escalate form */
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
                    <div className="mt-6 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleReorder(detailOrder)}
                          className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-4 py-2.5 hover:bg-laser hover:text-white transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" /> Reorder
                        </button>
                        {detailData?.canModify && (
                          <button
                            onClick={() => {
                              setModifyQty(detailData?.quantity ?? detailOrder.quantity ?? 1);
                              setModifyAddress(prettyAddress(detailData?.deliveryAddress));
                              setModifyError(null);
                              setModifySuccess(null);
                              setShowModify(true);
                            }}
                            className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-4 py-2.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
                          >
                            <Edit3 className="w-4 h-4" /> Modify order
                          </button>
                        )}
                        {detailData?.canCancel && (
                          <button
                            onClick={() => {
                              setCancelError(null);
                              setCancelReason("");
                              setShowCancel(true);
                            }}
                            className="inline-flex items-center gap-2 border border-[#DC2626]/50 text-[#DC2626] text-sm font-medium px-4 py-2.5 hover:bg-[#DC2626] hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" /> Cancel order
                          </button>
                        )}
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
                      {!detailData?.canCancel && !detailData?.canModify && (
                        <p className="text-xs text-thread italic">
                          Modifications allowed within 24 hours of placing the order.
                        </p>
                      )}
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

      {/* ── Escalation thread dialog (chat) ── */}
      {threadEscalation && phone && (
        <div
          className="fixed inset-0 z-[200] bg-ink/60 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setThreadEscalation(null)}
        >
          <div
            className="bg-bone border border-hairline w-full max-w-2xl my-4 sm:my-0 relative flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Thread header */}
            <div className="flex items-start justify-between p-5 sm:p-6 border-b border-hairline">
              <div className="min-w-0">
                <Coord>ESCALATION THREAD</Coord>
                <div className="font-mono text-xl font-bold text-laser mt-2 truncate">
                  {threadEscalation.ticketId || threadEscalation.id}
                </div>
                {threadEscalation.orderNumber && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-thread mt-1">
                    order · {threadEscalation.orderNumber}
                  </p>
                )}
              </div>
              <button
                onClick={() => setThreadEscalation(null)}
                className="text-thread hover:text-ink transition-colors p-1 -m-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thread body */}
            <EscalationThread
              ticketId={threadEscalation.ticketId || threadEscalation.id || ""}
              phone={phone}
              customerName={name}
              onResolved={() => {
                if (phone) fetchEscalations(phone);
              }}
            />

            {/* Thread footer */}
            <div className="border-t border-hairline p-4 sm:p-5 flex items-center justify-between gap-3 bg-vellum">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread">
                Opened {new Date(threadEscalation.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
              <button
                onClick={() => setThreadEscalation(null)}
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
