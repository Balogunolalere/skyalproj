"use client";

import { useState } from "react";
import { type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { Loader2 } from "lucide-react";

type Mode = "login" | "register";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

export default function LoginView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "login") {
      if (phone.trim().length < 6) {
        setError("Enter the phone number you ordered with.");
        return;
      }
      setLoading(true);
      try {
        // Call admin API to verify phone and get orders
        const res = await fetch(`${API_URL}/api/magic-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error?.message || "No orders found for this phone number.");
          setLoading(false);
          return;
        }
        // Get customer name from the most recent order
        const orders = data.data?.orders || [];
        if (orders.length === 0) {
          setError("No orders found for this phone number.");
          setLoading(false);
          return;
        }
        const customerName = orders[0]?.customerName || "Customer";
        const customerEmail = orders[0]?.customerEmail || "";
        localStorage.setItem(
          "skyal_customer",
          JSON.stringify({ name: customerName, phone: phone.trim(), email: customerEmail }),
        );
        setLoading(false);
        onNavigate("dashboard");
      } catch {
        setError("Network error. Please try again.");
        setLoading(false);
      }
    } else {
      if (!name.trim() || !phone.trim() || !email.trim()) {
        setError("Fill in your name, phone and email.");
        return;
      }
      localStorage.setItem(
        "skyal_customer",
        JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() }),
      );
      onNavigate("dashboard");
    }
  };

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24">
        {/* Form */}
        <div>
          <Coord>CUSTOMER LOGIN</Coord>
          <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
            Access your orders
          </Heading>
          <p className="text-base text-thread mt-6 max-w-[440px] leading-relaxed">
            Returning customer? Log in with the phone number you ordered with —
            we&apos;ll pull up your history. New here? Save your details and
            we&apos;ll recognise you next time.
          </p>

          {/* Mode toggle */}
          <div className="mt-8 flex gap-6 border-b border-hairline">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-sm font-medium pb-3 transition-colors ${
                  mode === m ? "text-ink border-b-2 border-laser -mb-px" : "text-thread hover:text-ink"
                }`}
              >
                {m === "login" ? "Login" : "New customer"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-5 bg-oxblood/10 border-l-2 border-oxblood px-4 py-3 text-sm text-oxblood">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-8 space-y-7">
            {mode === "register" && (
              <Field label="Your name" value={name} onChange={setName} placeholder="Company or individual" />
            )}
            <Field label="Phone number" value={phone} onChange={setPhone} placeholder="0803 000 0000" type="tel" />
            {mode === "register" && (
              <Field label="Email" value={email} onChange={setEmail} placeholder="you@studio.com" type="email" />
            )}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-7 py-3.5 hover:bg-laser hover:text-white transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Verifying..." : mode === "login" ? "Access orders" : "Continue"}
            </button>
          </form>

          <p className="text-xs text-thread mt-6">
            We verify by phone — no password. Your profile is stored on this device.
          </p>
        </div>

        {/* Info panel */}
        <div className="space-y-6">
          <div className="bg-vellum border border-hairline p-6">
            <Coord>WHY LOG IN</Coord>
            <ul className="mt-4 space-y-3 text-sm text-thread leading-relaxed">
              <li><span className="font-medium text-ink">1.</span> See every order you&apos;ve placed — past and current.</li>
              <li><span className="font-medium text-ink">2.</span> Track active orders from the cutting bed to your door.</li>
              <li><span className="font-medium text-ink">3.</span> Pre-fill your details on new orders — no re-typing.</li>
              <li><span className="font-medium text-ink">4.</span> Reach support with full context on your history.</li>
            </ul>
          </div>
          <div className="bg-vellum border border-hairline p-6">
            <Coord>HOW IT WORKS</Coord>
            <p className="text-sm text-thread mt-3 leading-relaxed">
              Enter the phone number from your last order. We verify it against
              our system and pull up your real order history — no password
              required. No account yet? Switch to the New customer tab, save
              your details, and place your first order.
            </p>
          </div>
          <button
            onClick={() => onNavigate("home")}
            className="text-sm text-thread hover:text-ink transition-colors"
          >
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full bg-bone border-b border-hairline py-2.5 text-base text-ink focus:border-laser outline-none placeholder:text-thread/40"
      />
    </div>
  );
}
