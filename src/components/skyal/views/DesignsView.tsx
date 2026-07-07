"use client";

import { useCallback, useEffect, useState } from "react";
import { type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import {
  Loader2,
  Plus,
  Trash2,
  ArrowLeft,
  AlertCircle,
  FileText,
  ExternalLink,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

interface SavedDesign {
  id: string;
  customerPhone: string;
  name: string;
  fileUrl: string;
  filePublicId?: string | null;
  serviceType?: string | null;
  notes?: string | null;
  createdAt: string;
}

interface PastOrder {
  orderNumber: string;
  state: string;
  serviceLabel: string;
  serviceType: string;
  quantity: number;
  totalAmount: number;
  sla: string;
  deliveryMethod: string | null;
  createdAt: string;
  brand: string;
}

type AddMode = "order" | "url" | null;

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function DesignsView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);

  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const [addMode, setAddMode] = useState<AddMode>(null);
  const [orders, setOrders] = useState<PastOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Order-mode form
  const [orderPick, setOrderPick] = useState("");
  const [orderName, setOrderName] = useState("");

  // URL-mode form
  const [urlName, setUrlName] = useState("");
  const [urlFile, setUrlFile] = useState("");
  const [urlServiceType, setUrlServiceType] = useState("");
  const [urlNotes, setUrlNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Auth gate: read localStorage skyal_customer ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("skyal_customer");
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.phone) {
          setPhone(c.phone);
        } else {
          onNavigate("login");
        }
      } else {
        onNavigate("login");
      }
    } catch {
      onNavigate("login");
    }
    setCheckedAuth(true);
  }, []);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/saved-designs?phone=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (!res.ok) {
        setActionError(data?.error?.message || "Could not load saved designs.");
        setDesigns([]);
      } else {
        const payload = data.data || data;
        setDesigns(payload?.designs || []);
      }
    } catch {
      setActionError("Network error. Please try again.");
      setDesigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (phone) load(phone);
  }, [phone, load]);

  // Lazy-load the customer's orders only when the "save from order" tab opens.
  const loadOrders = useCallback(async (p: string) => {
    if (orders.length) return;
    setOrdersLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(data.data?.orders || []);
      }
    } catch {
      // swallow — the dropdown just stays empty
    } finally {
      setOrdersLoading(false);
    }
  }, [orders.length]);

  const openMode = (mode: AddMode) => {
    setFormError(null);
    setAddMode(mode);
    if (mode === "order" && phone) loadOrders(phone);
  };

  const closeMode = () => {
    setAddMode(null);
    setOrderPick("");
    setOrderName("");
    setUrlName("");
    setUrlFile("");
    setUrlServiceType("");
    setUrlNotes("");
    setFormError(null);
  };

  const submitFromOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    if (!orderPick || !orderName.trim()) {
      setFormError("Pick an order and name this design.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`${API_URL}/api/saved-designs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: phone,
          name: orderName.trim(),
          fromOrderNumber: orderPick,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Could not save design.");
      await load(phone);
      closeMode();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save design. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    if (!urlName.trim() || !urlFile.trim()) {
      setFormError("Name and file URL are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`${API_URL}/api/saved-designs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: phone,
          name: urlName.trim(),
          fileUrl: urlFile.trim(),
          serviceType: urlServiceType.trim() || undefined,
          notes: urlNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Could not save design.");
      await load(phone);
      closeMode();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save design. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async (id: string) => {
    if (!phone) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/saved-designs/${encodeURIComponent(id)}?phone=${encodeURIComponent(phone)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerPhone: phone }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Could not delete design.");
      }
      setConfirmDeleteId(null);
      await load(phone);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete design.");
    } finally {
      setDeleting(false);
    }
  };

  // While checking auth or redirecting, show a minimal spinner.
  if (!checkedAuth || !phone) {
    return (
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-24 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-6 h-6 text-laser animate-spin" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
          Loading
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
        <div>
          <Coord>DASHBOARD</Coord>
          <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
            Saved designs
          </Heading>
          <p className="text-sm text-thread mt-3 leading-relaxed max-w-[34rem]">
            A library of your design files. Reuse them on new orders without
            re-uploading or digging through old emails.
          </p>
        </div>
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-thread hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </button>
      </div>

      {actionError && (
        <div className="mb-6 border-l-2 border-leather bg-vellum p-4 flex items-start gap-2 text-leather">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-sm">{actionError}</p>
        </div>
      )}

      {/* Add design — mode switcher */}
      <div className="mb-8">
        {!addMode ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => openMode("order")}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-3 hover:bg-laser hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4" /> Save from a past order
            </button>
            <button
              onClick={() => openMode("url")}
              className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-3 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
            >
              <Plus className="w-4 h-4" /> Add by URL
            </button>
          </div>
        ) : (
          <div className="bg-vellum border border-hairline p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setAddMode("order");
                    if (phone) loadOrders(phone);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                    addMode === "order"
                      ? "bg-ink text-bone border-ink"
                      : "bg-bone text-thread border-hairline hover:border-ink hover:text-ink"
                  }`}
                >
                  From a past order
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setAddMode("url");
                  }}
                  className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                    addMode === "url"
                      ? "bg-ink text-bone border-ink"
                      : "bg-bone text-thread border-hairline hover:border-ink hover:text-ink"
                  }`}
                >
                  Add by URL
                </button>
              </div>
              <button
                type="button"
                onClick={closeMode}
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>

            {addMode === "order" && (
              <form onSubmit={submitFromOrder} className="space-y-5">
                <div>
                  <label htmlFor="orderPick" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                    Pick a past order
                  </label>
                  {ordersLoading ? (
                    <div className="flex items-center gap-3 bg-bone border border-hairline px-4 py-3">
                      <Loader2 className="w-4 h-4 text-laser animate-spin" />
                      <span className="text-sm text-thread">Loading orders…</span>
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="bg-bone border border-hairline px-4 py-3 text-sm text-thread">
                      No past orders found for your number.
                    </div>
                  ) : (
                    <select
                      id="orderPick"
                      value={orderPick}
                      onChange={(e) => setOrderPick(e.target.value)}
                      className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                    >
                      <option value="">Select an order…</option>
                      {orders.map((o) => (
                        <option key={o.orderNumber} value={o.orderNumber}>
                          {o.orderNumber} · {o.serviceLabel} · {formatDate(o.createdAt)}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-thread mt-2 leading-relaxed">
                    We&apos;ll copy the design file attached to that order.
                  </p>
                </div>

                <div>
                  <label htmlFor="orderName" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                    Name this design <span className="text-laser">*</span>
                  </label>
                  <input
                    id="orderName"
                    type="text"
                    required
                    value={orderName}
                    onChange={(e) => setOrderName(e.target.value)}
                    placeholder="e.g. Wedding invite cut file"
                    className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                  />
                </div>

                {formError && (
                  <p className="text-sm text-leather">{formError}</p>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !orderPick || !orderName.trim()}
                    className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-3 hover:bg-laser hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {submitting ? "Saving…" : "Save design"}
                  </button>
                  <button
                    type="button"
                    onClick={closeMode}
                    className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-3 hover:border-ink transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {addMode === "url" && (
              <form onSubmit={submitByUrl} className="space-y-5">
                <div>
                  <label htmlFor="urlName" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                    Name <span className="text-laser">*</span>
                  </label>
                  <input
                    id="urlName"
                    type="text"
                    required
                    value={urlName}
                    onChange={(e) => setUrlName(e.target.value)}
                    placeholder="e.g. Logo acrylic proof"
                    className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="urlFile" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                    File URL <span className="text-laser">*</span>
                  </label>
                  <input
                    id="urlFile"
                    type="url"
                    required
                    value={urlFile}
                    onChange={(e) => setUrlFile(e.target.value)}
                    placeholder="https://…"
                    className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                  />
                  <p className="text-xs text-thread mt-2 leading-relaxed">
                    Link to a Google Drive, Dropbox, or hosted file. Make sure
                    it&apos;s shareable.
                  </p>
                </div>

                <div>
                  <label htmlFor="urlServiceType" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                    Service type <span className="normal-case tracking-normal text-thread/70">(optional)</span>
                  </label>
                  <input
                    id="urlServiceType"
                    type="text"
                    value={urlServiceType}
                    onChange={(e) => setUrlServiceType(e.target.value)}
                    placeholder="e.g. LASER_CUTTING"
                    className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="urlNotes" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                    Notes <span className="normal-case tracking-normal text-thread/70">(optional)</span>
                  </label>
                  <textarea
                    id="urlNotes"
                    rows={3}
                    value={urlNotes}
                    onChange={(e) => setUrlNotes(e.target.value)}
                    placeholder="Material, dimensions, anything we should remember"
                    className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none resize-none"
                  />
                </div>

                {formError && (
                  <p className="text-sm text-leather">{formError}</p>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !urlName.trim() || !urlFile.trim()}
                    className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-3 hover:bg-laser hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {submitting ? "Saving…" : "Save design"}
                  </button>
                  <button
                    type="button"
                    onClick={closeMode}
                    className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-3 hover:border-ink transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-vellum border border-hairline p-6 flex items-center gap-4">
          <Loader2 className="w-6 h-6 text-laser animate-spin" />
          <p className="text-sm text-thread">Loading your designs…</p>
        </div>
      ) : designs.length === 0 ? (
        <div className="bg-vellum border border-hairline p-12 text-center">
          <FileText className="w-10 h-10 text-thread mx-auto mb-4" />
          <Coord>NO SAVED DESIGNS</Coord>
          <p className="text-sm text-thread mt-3 max-w-sm mx-auto leading-relaxed">
            Save a file from a past order, or paste a link to a design you
            host elsewhere.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {designs.map((d) => (
            <div key={d.id} className="bg-vellum border border-hairline p-5 flex flex-col h-full">
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm font-bold text-ink leading-snug break-words">
                  {d.name}
                </p>
              </div>
              {d.serviceType && (
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-laser mb-2">
                  {d.serviceType}
                </p>
              )}
              {d.notes && (
                <p className="text-xs text-thread leading-relaxed mb-2 whitespace-pre-line">
                  {d.notes}
                </p>
              )}

              {d.fileUrl ? (
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-laser hover:underline"
                >
                  Open file <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <p className="text-xs italic text-thread/70">No file attached</p>
              )}

              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread/70 mt-3">
                Added {formatDate(d.createdAt)}
              </p>

              <div className="w-full h-px bg-hairline my-4" />

              {confirmDeleteId === d.id ? (
                <div className="mt-auto flex items-center gap-2">
                  <button
                    onClick={() => confirmDelete(d.id)}
                    disabled={deleting}
                    className="text-xs font-medium text-white bg-[#DC2626] px-3 py-1.5 hover:bg-[#B91C1C] transition-colors disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs font-medium text-thread hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-auto">
                  <button
                    onClick={() => setConfirmDeleteId(d.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#DC2626] hover:text-[#B91C1C] transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
