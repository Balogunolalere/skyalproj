"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Logo } from "./Logo";
import { NAV_ITEMS, type ViewId } from "./data";
import { Menu, X, Bell } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

interface CustomerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  orderNumber?: string | null;
  isRead: boolean;
  createdAt: string;
}

/* ── Relative time formatter (e.g. "2 hours ago") ── */
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

/**
 * Read the logged-in customer's phone from localStorage `skyal_customer`.
 * Returns null when not signed in.
 */
function readCustomerPhone(): string | null {
  try {
    const raw = localStorage.getItem("skyal_customer");
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c?.phone || null;
  } catch {
    return null;
  }
}

/**
 * In-app notifications bell. Shown only when a customer is logged in.
 * Polls /api/customer/notifications every 30s, shows an unread-count badge,
 * and on open marks everything read. Closes on outside-click + Escape.
 */
function NotificationBell({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Pick up the customer phone on mount + whenever the hash changes
  // (login/logout navigates between views, and localStorage is mutated
  // by LoginView/DashboardView).
  useEffect(() => {
    setPhone(readCustomerPhone());
    const onHash = () => setPhone(readCustomerPhone());
    window.addEventListener("hashchange", onHash);
    // Also poll localStorage lightly — the dashboard sign-out doesn't
    // always change the hash before the bell re-renders.
    const id = window.setInterval(() => setPhone(readCustomerPhone()), 2000);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.clearInterval(id);
    };
  }, []);

  const fetchNotifications = useCallback(async (p: string) => {
    try {
      const res = await fetch(
        `${API_URL}/api/customer/notifications?phone=${encodeURIComponent(p)}`,
      );
      const data = await res.json();
      if (!res.ok) return;
      const payload = data.data || data;
      setNotifications(payload?.notifications || []);
      setUnreadCount(payload?.unreadCount || 0);
    } catch {
      // Endpoint may be unavailable — swallow silently.
    }
  }, []);

  // Initial fetch + 30s polling while logged in.
  useEffect(() => {
    if (!phone) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    fetchNotifications(phone);
    const id = window.setInterval(() => fetchNotifications(phone), 30000);
    return () => window.clearInterval(id);
  }, [phone, fetchNotifications]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next && phone && unreadCount > 0) {
        // Optimistically clear the badge; mark-all-read on the server.
        setUnreadCount(0);
        fetch(`${API_URL}/api/customer/notifications?phone=${encodeURIComponent(phone)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markAllRead: true }),
        }).catch(() => {
          // On failure, re-fetch to restore the true unread count.
          fetchNotifications(phone);
        });
      }
      return next;
    });
  }, [phone, unreadCount, fetchNotifications]);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Bail after all hooks — render nothing when logged out.
  if (!phone) return null;

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);
  const recent = notifications.slice(0, 20);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative w-9 h-9 flex items-center justify-center text-thread hover:text-ink hover:bg-ink/5 transition-colors"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-laser text-white text-[9px] font-bold flex items-center justify-center leading-none"
            aria-hidden="true"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-2 w-[20rem] sm:w-[22rem] max-h-[28rem] flex flex-col bg-vellum border border-hairline shadow-lg z-[60] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-thread">
              Notifications
            </span>
            {unreadCount > 0 ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-laser">
                {unreadCount} new
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread">
                All read
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {recent.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-thread">You&apos;re all caught up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-hairline/60">
                {recent.map((n) => {
                  const snippet =
                    n.body && n.body.length > 110 ? n.body.slice(0, 110) + "…" : n.body;
                  const inner = (
                    <div className="px-4 py-3 hover:bg-bone transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-ink leading-snug">{n.title}</p>
                        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-thread whitespace-nowrap">
                          {relativeTime(n.createdAt)}
                        </span>
                      </div>
                      {snippet && (
                        <p className="text-xs text-thread mt-1 leading-relaxed">{snippet}</p>
                      )}
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.orderNumber ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            onNavigate("dashboard");
                          }}
                          className="block w-full text-left"
                        >
                          {inner}
                        </button>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
          <NotificationBell onNavigate={onNavigate} />
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
