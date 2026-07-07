"use client";

import { useCallback, useEffect, useState } from "react";
import { type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import {
  Loader2,
  Plus,
  Edit3,
  Trash2,
  Check,
  ArrowLeft,
  AlertCircle,
  MapPin,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

interface SavedAddress {
  id: string;
  customerPhone: string;
  label: string;
  recipientName?: string | null;
  phone?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  landmark?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface AddressForm {
  label: string;
  recipientName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  landmark: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressForm = {
  label: "",
  recipientName: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  landmark: "",
  isDefault: false,
};

function toForm(a: SavedAddress): AddressForm {
  return {
    label: a.label || "",
    recipientName: a.recipientName || "",
    phone: a.phone || "",
    address: a.address || "",
    city: a.city || "",
    state: a.state || "",
    landmark: a.landmark || "",
    isDefault: !!a.isDefault,
  };
}

function fullAddress(a: SavedAddress): string {
  return [a.address, a.city, a.state, a.landmark].filter(Boolean).join(", ");
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function AddressesView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
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
      const res = await fetch(`${API_URL}/api/saved-addresses?phone=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (!res.ok) {
        setActionError(data?.error?.message || "Could not load addresses.");
        setAddresses([]);
      } else {
        const payload = data.data || data;
        setAddresses(payload?.addresses || []);
      }
    } catch {
      setActionError("Network error. Please try again.");
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (phone) load(phone);
  }, [phone, load]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (a: SavedAddress) => {
    setForm(toForm(a));
    setEditingId(a.id);
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleField = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    const v = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setForm((prev) => ({ ...prev, [name]: v }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    if (!form.label.trim() || !form.address.trim()) {
      setFormError("Label and address are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        customerPhone: phone,
        label: form.label.trim(),
        recipientName: form.recipientName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim(),
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        landmark: form.landmark.trim() || undefined,
        isDefault: form.isDefault,
      };
      if (editingId) {
        // Update existing address.
        const updateRes = await fetch(
          `${API_URL}/api/saved-addresses/${encodeURIComponent(editingId)}?phone=${encodeURIComponent(phone)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, customerPhone: phone }),
          },
        );
        const updateData = await updateRes.json();
        if (!updateRes.ok) throw new Error(updateData?.error?.message || "Could not update address.");
      } else {
        // Create new address.
        const res = await fetch(`${API_URL}/api/saved-addresses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "Could not save address.");
      }
      await load(phone);
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save address. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const setDefault = async (a: SavedAddress) => {
    if (!phone) return;
    setActionError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/saved-addresses/${encodeURIComponent(a.id)}?phone=${encodeURIComponent(phone)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerPhone: phone, isDefault: true }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Could not set default address.");
      }
      await load(phone);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not set default address.");
    }
  };

  const confirmDelete = async (id: string) => {
    if (!phone) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/saved-addresses/${encodeURIComponent(id)}?phone=${encodeURIComponent(phone)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerPhone: phone }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Could not delete address.");
      }
      setConfirmDeleteId(null);
      await load(phone);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete address.");
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
            Delivery addresses
          </Heading>
          <p className="text-sm text-thread mt-3 leading-relaxed max-w-[34rem]">
            Save the addresses you ship to most. We&apos;ll offer them at checkout
            and on the order form.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate("dashboard")}
            className="inline-flex items-center gap-1.5 text-sm text-thread hover:text-ink transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </button>
          {!showForm && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-3 hover:bg-laser hover:text-white transition-colors"
            >
              <Plus className="w-4 h-4" /> Add address
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-6 border-l-2 border-leather bg-vellum p-4 flex items-start gap-2 text-leather">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-sm">{actionError}</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={submit} className="bg-vellum border border-hairline p-6 mb-10 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <Coord>{editingId ? "EDIT ADDRESS" : "NEW ADDRESS"}</Coord>
            <button
              type="button"
              onClick={closeForm}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label htmlFor="label" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                Label <span className="text-laser">*</span>
              </label>
              <input
                id="label"
                name="label"
                type="text"
                required
                value={form.label}
                onChange={handleField}
                placeholder="Home, Office, Workshop…"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
              />
            </div>

            <div>
              <label htmlFor="recipientName" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                Recipient name
              </label>
              <input
                id="recipientName"
                name="recipientName"
                type="text"
                value={form.recipientName}
                onChange={handleField}
                placeholder="Who receives the package"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
              />
            </div>

            <div>
              <label htmlFor="phone" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                Recipient phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleField}
                placeholder="0803 000 0000"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="address" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                Address <span className="text-laser">*</span>
              </label>
              <textarea
                id="address"
                name="address"
                required
                rows={2}
                value={form.address}
                onChange={handleField}
                placeholder="House number, street, area"
                className="w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none resize-none"
              />
            </div>

            <div>
              <label htmlFor="city" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                value={form.city}
                onChange={handleField}
                placeholder="Ikeja"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
              />
            </div>

            <div>
              <label htmlFor="state" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                State
              </label>
              <input
                id="state"
                name="state"
                type="text"
                value={form.state}
                onChange={handleField}
                placeholder="Lagos"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="landmark" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread block mb-2">
                Landmark <span className="normal-case tracking-normal text-thread/70">(optional)</span>
              </label>
              <input
                id="landmark"
                name="landmark"
                type="text"
                value={form.landmark}
                onChange={handleField}
                placeholder="Beside the filling station"
                className="w-full bg-bone border border-hairline px-4 py-2.5 text-sm text-ink focus:border-laser outline-none"
              />
            </div>
          </div>

          {/* Default toggle */}
          <div className="flex items-center gap-3 cursor-pointer select-none">
            <button
              type="button"
              role="switch"
              aria-checked={form.isDefault}
              onClick={() => setForm((prev) => ({ ...prev, isDefault: !prev.isDefault }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                form.isDefault ? "bg-laser" : "bg-kerf"
              }`}
              aria-label="Set as default address"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  form.isDefault ? "translate-x-4" : ""
                }`}
              />
            </button>
            <span className="text-sm text-ink">Set as default address</span>
          </div>

          {formError && (
            <p className="text-sm text-leather">{formError}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-3 hover:bg-laser hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? "Saving…" : editingId ? "Save changes" : "Save address"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-5 py-3 hover:border-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="bg-vellum border border-hairline p-6 flex items-center gap-4">
          <Loader2 className="w-6 h-6 text-laser animate-spin" />
          <p className="text-sm text-thread">Loading your addresses…</p>
        </div>
      ) : addresses.length === 0 && !showForm ? (
        <div className="bg-vellum border border-hairline p-12 text-center">
          <MapPin className="w-10 h-10 text-thread mx-auto mb-4" />
          <Coord>NO SAVED ADDRESSES</Coord>
          <p className="text-sm text-thread mt-3 max-w-sm mx-auto leading-relaxed">
            Save your home, office, or workshop so checkout is faster next time.
          </p>
          <button
            onClick={openAdd}
            className="mt-6 inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-5 py-3 hover:bg-laser hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" /> Add your first address
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {addresses.map((a) => (
            <div key={a.id} className="bg-vellum border border-hairline p-5 flex flex-col h-full">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-ink truncate">{a.label}</p>
                    {a.isDefault && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-laser/10 text-laser border border-laser/30 text-[10px] font-medium font-mono uppercase tracking-[0.1em]">
                        Default
                      </span>
                    )}
                  </div>
                  {a.recipientName && (
                    <p className="text-xs text-thread mt-1">{a.recipientName}</p>
                  )}
                </div>
              </div>

              <p className="text-sm text-ink leading-relaxed mb-1">
                {fullAddress(a) || a.address}
              </p>
              {a.phone && (
                <p className="font-mono text-xs text-thread">{a.phone}</p>
              )}
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread/70 mt-3">
                Added {formatDate(a.createdAt)}
              </p>

              <div className="w-full h-px bg-hairline my-4" />

              {/* Actions */}
              {confirmDeleteId === a.id ? (
                <div className="mt-auto flex items-center gap-2">
                  <button
                    onClick={() => confirmDelete(a.id)}
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
                <div className="mt-auto flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => openEdit(a)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-laser transition-colors"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                  {!a.isDefault && (
                    <button
                      onClick={() => setDefault(a)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-thread hover:text-laser transition-colors"
                    >
                      <Check className="w-3 h-3" /> Set as default
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDeleteId(a.id)}
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
