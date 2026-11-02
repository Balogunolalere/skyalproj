"use client";

import { useState } from "react";
import { type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { Loader2 } from "lucide-react";

type Mode = "login" | "register";

import { apiFetch, ApiError } from "@/lib/api";

interface VerifiedCustomer {
  phone: string;
  name?: string;
  email?: string;
  brand?: string;
}

export default function LoginView({
  onNavigate,
}: {
  onNavigate: (v: ViewId) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetCode = () => {
    setCodeSent(false);
    setCode("");
    setNotice(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (phone.trim().length < 6) {
      setError("Enter the phone number you ordered with.");
      return;
    }
    if (mode === "register" && (!name.trim() || !email.trim())) {
      setError("Fill in your name, phone and email.");
      return;
    }

    setLoading(true);
    try {
      if (!codeSent) {
        // Step 1: ask the backend to email a one-time code. A phone number is
        // not a credential, so no order data is returned at this point.
        await apiFetch("/api/auth/otp/request", {
          method: "POST",
          body: JSON.stringify({
            phone: phone.trim(),
            brand: "SKYAL",
            ...(mode === "register" ? { name: name.trim(), email: email.trim() } : {}),
          }),
        });
        setCodeSent(true);
        setNotice(
          "If this number has an email on file, a one-time code is on its way. Enter it below — it expires in 10 minutes.",
        );
        setLoading(false);
        return;
      }

      // Step 2: exchange the code for a signed, expiring session token.
      const session = await apiFetch<{ token: string; customer: VerifiedCustomer }>(
        "/api/auth/otp/verify",
        {
          method: "POST",
          body: JSON.stringify({
            phone: phone.trim(),
            code: code.trim(),
            brand: "SKYAL",
            ...(mode === "register" ? { name: name.trim(), email: email.trim() } : {}),
          }),
        },
      );
      if (!session?.token) {
        setError("Could not verify that code. Please try again.");
        setLoading(false);
        return;
      }

      localStorage.setItem(
        "skyal_customer",
        JSON.stringify({
          name: session.customer?.name || name.trim() || "Customer",
          phone: session.customer?.phone || phone.trim(),
          email: session.customer?.email || email.trim() || "",
          token: session.token,
        }),
      );
      setLoading(false);
      onNavigate("dashboard");
    } catch (err) {
      // "No orders found" is only true for a 404. A rate limit or a server
      // fault must not tell a customer with real orders that they do not exist.
      const e = err as ApiError;
      setError(
        e?.isNotFound
          ? "No orders found for this phone number."
          : e?.message || "Could not sign you in. Please try again.",
      );
      setLoading(false);
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
            We email a one-time code to the address on your orders. No password
            to forget — and knowing your phone number alone is not enough to
            open your account.
          </p>

          {/* Mode toggle */}
          <div className="mt-8 flex gap-6 border-b border-hairline">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  resetCode();
                }}
                className={`text-sm font-medium pb-3 transition-colors ${
                  mode === m ? "text-ink border-b-2 border-laser -mb-px" : "text-thread hover:text-ink"
                }`}
              >
                {m === "login" ? "Login" : "New customer"}
              </button>
            ))}
          </div>

          {notice && (
            <div className="mt-5 bg-laser/10 border-l-2 border-laser px-4 py-3 text-sm text-ink">
              {notice}
            </div>
          )}

          {error && (
            <div className="mt-5 bg-oxblood/10 border-l-2 border-oxblood px-4 py-3 text-sm text-oxblood">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-8 space-y-7">
            {mode === "register" && !codeSent && (
              <Field label="Your name" value={name} onChange={setName} placeholder="Company or individual" />
            )}
            <Field label="Phone number" value={phone} onChange={setPhone} placeholder="0803 000 0000" type="tel" />
            {mode === "register" && !codeSent && (
              <Field label="Email" value={email} onChange={setEmail} placeholder="you@studio.com" type="email" />
            )}
            {codeSent && (
              <Field
                label="One-time code"
                value={code}
                onChange={setCode}
                placeholder="6-digit code"
                type="text"
              />
            )}
            <div className="flex items-center gap-4 flex-wrap">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-7 py-3.5 hover:bg-laser hover:text-white transition-colors active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Checking..." : codeSent ? "Verify code" : "Send login code"}
              </button>
              {codeSent && (
                <button
                  type="button"
                  onClick={resetCode}
                  className="text-sm text-thread hover:text-ink transition-colors"
                >
                  Change number
                </button>
              )}
            </div>
          </form>

          <p className="text-xs text-thread mt-6">
            New customer? Switch to the New customer tab, enter your details and
            verify the same way — we&apos;ll set you up at checkout.
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
              Enter the phone number from your last order. We email a short-lived
              code to the address on file; entering it proves you own the number
              and opens your real order history. A phone number by itself never
              grants access.
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
