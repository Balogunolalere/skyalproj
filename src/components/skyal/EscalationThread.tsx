"use client";

/**
 * Escalation chat thread — customer side.
 *
 * Renders the full message history of a single escalation ticket and lets
 * the customer append a reply. Polls every 8s so admin replies appear in
 * near-real time. When the ticket is RESOLVED, the reply box is disabled
 * and a banner is shown.
 *
 * Uses the shared admin API (raw fetch, not an `api` object):
 *   GET  /api/escalations/TICKETID/messages?phone=PHONE
 *        → { ticketId, orderNumber, status, messages[{id,role,body,authorName,createdAt}] }
 *   POST /api/escalations/TICKETID/messages { phone, message, customerName? }
 *        → { message: {...} }
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Send } from "lucide-react";

const API_URL =
  process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

interface EscalationMessage {
  id: string;
  role: "CUSTOMER" | "ADMIN" | "SYSTEM";
  body: string;
  authorName?: string | null;
  createdAt: string;
}

interface EscalationThreadData {
  ticketId: string;
  orderNumber?: string | null;
  status: string;
  messages: EscalationMessage[];
}

interface EscalationThreadProps {
  ticketId: string;
  phone: string;
  customerName?: string;
  /** Called when the thread transitions to RESOLVED (best-effort, fires once). */
  onResolved?: () => void;
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

function fullName(m: EscalationMessage): string {
  const role = (m.role || "").toLowerCase();
  if (role === "admin") return "Skyal team";
  if (role === "system") return "System";
  return m.authorName?.trim() || "You";
}

export function EscalationThread({ ticketId, phone, customerName, onResolved }: EscalationThreadProps) {
  const [thread, setThread] = useState<EscalationThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest onResolved in a ref so the polling interval never
  // captures a stale closure.
  const onResolvedRef = useRef<(() => void) | undefined>(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);
  // Track whether onResolved has already fired for this ticket so the
  // 8s poll doesn't re-trigger it on every tick once RESOLVED.
  const resolvedFiredRef = useRef(false);

  const loadThread = useCallback(async () => {
    if (!ticketId || !phone) return;
    try {
      const res = await fetch(
        `${API_URL}/api/escalations/${encodeURIComponent(ticketId)}/messages?phone=${encodeURIComponent(phone)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || "Could not load this conversation.");
        return;
      }
      const t: EscalationThreadData = data.data || data;
      setThread(t);
      // Fire onResolved once when the ticket transitions to RESOLVED.
      if (t?.status?.toUpperCase() === "RESOLVED" && !resolvedFiredRef.current) {
        resolvedFiredRef.current = true;
        onResolvedRef.current?.();
      }
    } catch {
      setError("Network error. Could not load this conversation.");
    } finally {
      setLoading(false);
    }
  }, [ticketId, phone]);

  // Initial load + 8s polling for new admin replies.
  useEffect(() => {
    setLoading(true);
    loadThread();
    const interval = setInterval(loadThread, 8000);
    return () => clearInterval(interval);
  }, [loadThread]);

  // Auto-scroll to the newest message whenever the thread changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread?.messages?.length]);

  const sendReply = async () => {
    const message = draft.trim();
    if (!message || sending || !ticketId || !phone) return;
    setSending(true);
    setSendError(null);

    // Optimistic append — build a temporary CUSTOMER message and append it
    // before the network call resolves.
    const optimistic: EscalationMessage = {
      id: `optimistic-${Date.now()}`,
      role: "CUSTOMER",
      body: message,
      authorName: customerName || "You",
      createdAt: new Date().toISOString(),
    };
    setThread((prev) =>
      prev
        ? { ...prev, messages: [...(prev.messages || []), optimistic] }
        : {
            ticketId,
            orderNumber: null,
            status: "OPEN",
            messages: [optimistic],
          },
    );
    setDraft("");

    try {
      const res = await fetch(
        `${API_URL}/api/escalations/${encodeURIComponent(ticketId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, message, customerName }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Could not send your message.");
      }
      // Replace the optimistic bubble with the canonical one returned by the API.
      const canonical = data.data?.message || data.message || null;
      setThread((prev) => {
        if (!prev) return prev;
        const nextMsgs = canonical
          ? [...(prev.messages || []).filter((m) => m.id !== optimistic.id), canonical]
          : prev.messages || [];
        return { ...prev, messages: nextMsgs };
      });
    } catch {
      // Roll back the optimistic bubble and restore the unsent text.
      setThread((prev) =>
        prev ? { ...prev, messages: (prev.messages || []).filter((m) => m.id !== optimistic.id) } : prev,
      );
      setDraft(message);
      setSendError("Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const messages = thread?.messages || [];
  const status = (thread?.status || "").toUpperCase();
  const isResolved = status === "RESOLVED";

  return (
    <div className="flex flex-col h-[60vh] min-h-[360px]">
      {/* Resolved banner */}
      {isResolved && (
        <div className="flex items-center gap-2 px-4 py-3 bg-[#F0FDF4] border-b border-[#BBF7D0] text-[#166534] text-xs">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 10l3 3 7-7" />
          </svg>
          <span className="font-medium">This escalation has been resolved.</span>
          <span className="text-[#166534]/70">Replies are disabled.</span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-bone">
        {loading ? (
          <div className="flex items-center gap-3 justify-center py-10">
            <Loader2 className="w-5 h-5 text-laser animate-spin" />
            <span className="text-sm text-thread">Loading conversation…</span>
          </div>
        ) : error ? (
          <div className="border border-leather/30 bg-leather/5 px-4 py-3 text-sm text-leather">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-thread">No messages yet.</p>
            <p className="text-xs text-thread/70 mt-1">
              Send the first message below — our team typically replies within 24 hours.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const role = (m.role || "").toUpperCase();
            if (role === "SYSTEM") {
              return (
                <div key={m.id} className="flex justify-center my-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread italic">
                    {m.body}
                  </span>
                </div>
              );
            }
            const isCustomer = role === "CUSTOMER";
            return (
              <div key={m.id} className={`flex flex-col ${isCustomer ? "items-start" : "items-end"}`}>
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 ${
                    isCustomer
                      ? "bg-vellum text-ink border border-hairline rounded-bl-sm"
                      : "bg-laser text-white rounded-br-sm"
                  }`}
                >
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                </div>
                <p
                  className={`font-mono text-[10px] uppercase tracking-[0.1em] text-thread mt-1 ${
                    isCustomer ? "text-left" : "text-right"
                  }`}
                >
                  {fullName(m)} · {relativeTime(m.createdAt)}
                </p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="border-t border-hairline p-3 sm:p-4 bg-vellum">
        {sendError && <p className="text-xs text-leather mb-2">{sendError}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                sendReply();
              }
            }}
            disabled={isResolved || sending}
            rows={2}
            placeholder={isResolved ? "Escalation resolved — replies disabled." : "Type your reply…  (⌘/Ctrl + Enter to send)"}
            className="flex-1 resize-none bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none placeholder:text-thread/50 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            onClick={sendReply}
            disabled={isResolved || sending || !draft.trim()}
            className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-4 py-3 hover:bg-laser hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">{sending ? "Sending" : "Send"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default EscalationThread;
