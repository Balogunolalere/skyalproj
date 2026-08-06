"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { formatNaira, type ViewId } from "../data";
import { Coord, Heading } from "../primitives";
import { ArrowLeft, ArrowRight, Check, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from 'sonner';
import { buildChatOrderNotes } from "@/lib/chat-order";
import type { ChatSpecs, Availability } from "@/lib/chat";
import { AvailabilityLine } from "../AvailabilityLine";
import { AddressPicker } from "./AddressPicker";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

/* ── Upload limits (shared by the file picker and the submit path) ── */
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB each
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB total

/* ── Real admin API types (mirror the admin /api/services response) ── */
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
  [k: string]: unknown;
}

interface QuoteResponse {
  quoteNaira: number;
  breakdown?: QuoteBreakdown;
  availability?: Availability | null;
  quoteId?: string;
  quoteNumber?: string;
  quoteExpiresAt?: string | null;
}

/** Minimal order shape returned by POST /api/orders (and quote accept). */
interface CreatedOrder {
  orderNumber: string;
  serviceLabel?: string;
  serviceType?: string;
  quantity?: number;
  totalAmount: number;
  sla?: string;
  state: string;
  customerEmail?: string;
}

/* ── Saved address (for the delivery-step picker) ── */
interface SavedAddress {
  id: string;
  label: string;
  recipientName?: string | null;
  phone?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  landmark?: string | null;
  isDefault: boolean;
}

function fullSavedAddress(a: SavedAddress): string {
  return [a.address, a.city, a.state, a.landmark].filter(Boolean).join(", ");
}

const STEPS = [
  { n: "01", label: "Service" },
  { n: "02", label: "Details" },
  { n: "03", label: "Delivery" },
  { n: "04", label: "Customer" },
  { n: "05", label: "Review" },
] as const;

const DELIVERY_OPTIONS = [
  { id: "pickup", label: "Studio pickup", detail: "Wempco Rd, Ogba — Ikeja", cost: 0, apiMethod: "PICKUP" },
  { id: "lagos", label: "Lagos delivery", detail: "Within 24 hrs, mainland & island", cost: 3500, apiMethod: "LOCAL_DELIVERY" },
  { id: "waybill", label: "Nationwide waybill", detail: "2–5 days via GIG / RedStar", cost: 8000, apiMethod: "NATIONWIDE_WAYBILL" },
];

const SLA_OPTIONS = [
  { id: "Standard" as const, label: "Standard", detail: "~72 hrs" },
  { id: "Express" as const, label: "Express", detail: "~48 hrs" },
];

const CATEGORY_LABELS: Record<string, string> = {
  FABRIC_CUTTING: "Fabric Cutting",
  ENGRAVING: "Engraving",
  SHEET_CUTTING: "Sheet Cutting",
  ADD_ON: "Add-ons",
};

/** Handoff from the chat assistant (or calculator) — SPECS-based, no [QUOTE]. */
interface ChatHandoff {
  specs?: ChatSpecs;
  custom?: boolean;
  context?: string;
}

export default function OrderView({
  onNavigate,
  chatHandoff,
}: {
  onNavigate: (v: ViewId) => void;
  chatHandoff?: ChatHandoff | null;
}) {
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [sla, setSla] = useState<"Standard" | "Express">("Standard");
  const [delivery, setDelivery] = useState("pickup");
  const [address, setAddress] = useState("");
  // Live mirror of `address` for effects that run once on mount (so an async
  // saved-address fetch never overwrites an address set by another effect).
  const addressRef = useRef(address);
  addressRef.current = address;
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [referral, setReferral] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [uploadFiles, setUploadFiles] = useState<{ name: string; data: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [chatPrefillApplied, setChatPrefillApplied] = useState(false);

  // Custom job mode ("Something else" / chat handoff with no catalog match):
  // describe the job, we price it via rules or confirm pricing quickly.
  const [customMode, setCustomMode] = useState(false);
  const [customDescription, setCustomDescription] = useState("");
  const [customMaterial, setCustomMaterial] = useState("");
  const [customDimensions, setCustomDimensions] = useState("");

  // Order created successfully — drives the success screen (QUOTING orders
  // skip payment until the team confirms the price).
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Prefill from chat specs: EXACT service_type mapping (no fuzzy matching —
  // the AI's service_type is authoritative), custom mode when the job has no
  // catalog match, then jump to the Details step so the customer only
  // reviews, doesn't re-enter everything.
  useEffect(() => {
    if (chatPrefillApplied || !chatHandoff || servicesLoading || services.length === 0) return;
    const specs = chatHandoff.specs;
    const context = chatHandoff.context || null;

    if (chatHandoff.custom || !specs?.service_type) {
      // Custom job (from chat with no catalog match, or calculator link)
      setCustomMode(true);
      setCustomDescription(specs?.custom_description || "");
      setCustomMaterial(specs?.material || "");
      setCustomDimensions("");
      if (specs && specs.quantity > 0) setQty(specs.quantity);
      if (specs?.sla === "Express") setSla("Express");
      const notesText = buildChatOrderNotes(specs, context);
      if (notesText) setNotes(notesText);
    } else {
      // Catalog job — exact match only
      const match = services.find((s) => s.type === specs.service_type);
      if (match) {
        setServiceType(match.type);
        if (specs.quantity > 0) setQty(specs.quantity);
        if (specs.sla === "Express") setSla("Express");
        if (specs.delivery === "LOCAL_DELIVERY") {
          setDelivery("lagos");
          if (specs.delivery_address) setAddress(specs.delivery_address);
        }
        const notesText = buildChatOrderNotes(specs, context);
        if (notesText) setNotes(notesText);
      }
    }
    setStep(1);
    setChatPrefillApplied(true);
  }, [chatHandoff, services, servicesLoading, chatPrefillApplied]);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);

  /* ── Prefill from localStorage (if the customer is signed in) ── */
  useEffect(() => {
    let custPhone = "";
    try {
      const raw = localStorage.getItem("skyal_customer");
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.name) setName(c.name);
        if (c?.phone) {
          setPhone(c.phone);
          custPhone = c.phone;
        }
        if (c?.email) setEmail(c.email);
      }
    } catch {
      // ignore
    }
    /* ── Saved-address picker: fetch addresses when logged in ── */
    if (!custPhone) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/saved-addresses?phone=${encodeURIComponent(custPhone)}`);
        const data = await res.json();
        if (res.ok) {
          const payload = data.data || data;
          const list = payload?.addresses || [];
          setSavedAddresses(list);
          // Auto-fill the delivery address with the default (or most recent) saved
          // address — the customer shouldn't re-type what they've saved before.
          if (list.length > 0 && !addressRef.current.trim()) {
            const preferred = list.find((a: SavedAddress) => a.isDefault) || list[0];
            if (preferred) {
              setAddress(
                [preferred.address, preferred.city, preferred.state, preferred.landmark]
                  .filter(Boolean)
                  .join(", "),
              );
            }
          }
        }
      } catch {
        // swallow — picker just stays empty
      }
    })();
  }, []);

  /* ── Reorder prefill: when arriving from the dashboard with a stashed
       serviceType + quantity, apply them and skip straight to the
       Details step so the customer can review and submit quickly. ── */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("skyal_reorder");
      if (!raw) return;
      sessionStorage.removeItem("skyal_reorder");
      const pre = JSON.parse(raw);
      if (pre?.serviceType) {
        setServiceType(pre.serviceType);
      }
      if (typeof pre?.quantity === "number" && pre.quantity > 0) {
        setQty(pre.quantity);
      }
      // Jump straight to the Details step (index 1) — the quote will
      // auto-recalculate once serviceType + qty are set.
      setStep(1);
    } catch {
      // ignore
    }
  }, []);

  /* ── Check for pending payment after returning from Paystack ── */
  useEffect(() => {
    let cancelled = false;
    
    // Check URL query parameters first (e.g., ?reference=... from Paystack redirect)
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    const orderNum = params.get('order');
    
    if (reference) {
      // Verify payment directly from URL param
      fetch(`${API_URL}/api/payment/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data?.data?.verified) {
          const displayOrder = orderNum || 'unknown';
          toast('Payment Confirmed!', {
            icon: '✅',
            description: `Your order #${displayOrder} has been paid successfully.`,
          });
          // Clean up query params without re-rendering
          const url = new URL(window.location.href);
          url.searchParams.delete('reference');
          url.searchParams.delete('order');
          window.history.replaceState({}, document.title, url.toString());
        }
      })
      .catch(err => {
        console.error('Payment verification error:', err);
      });
    }
    
    // Also check sessionStorage for pending payments (from return via "Return to Merchant")
    const paymentKey = 'skyal_pending_payment';
    const pendingPayment = sessionStorage.getItem(paymentKey);
    
    if (pendingPayment) {
      const { orderNumber: pn, reference: pref } = JSON.parse(pendingPayment);
      
      // Verify payment with admin API
      fetch(`${API_URL}/api/payment/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: pref }),
      })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data?.data?.verified) {
          // Payment successful - clear pending marker and show toast
          sessionStorage.removeItem(paymentKey);
          toast('Payment Confirmed!', {
            icon: '✅',
            description: `Order #${pn} has been paid successfully.`,
          });
        } else if (!cancelled) {
          // Payment failed or not verified yet - maybe try again later
          console.log('Payment verification failed or not completed');
        }
      })
      .catch(err => {
        console.error('Payment verification error:', err);
        if (!cancelled) {
          sessionStorage.removeItem(paymentKey);
          toast('Payment Error', {
            icon: '⚠️',
            description: 'Failed to verify payment. Please check your order.',
          });
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Fetch real services from the admin API on mount ── */
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
          setServices(Array.isArray(data?.data) ? data.data : []);
          setServicesError(null);
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

  const service = services.find((s) => s.type === serviceType);
  const delivOption = DELIVERY_OPTIONS.find((d) => d.id === delivery);

  /* ── Live quote — debounced refetch whenever price inputs change ── */
  useEffect(() => {
    if (!serviceType || !service || step < 1) return;
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);
    const t = setTimeout(async () => {
      try {
        // Include the customer phone (when known) so the admin persists a
        // price SNAPSHOT — the "same price when they come back" guarantee.
        let custPhone: string | undefined;
        try {
          const raw = localStorage.getItem("skyal_customer");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.phone) custPhone = parsed.phone;
          }
        } catch { /* ignore storage errors */ }
        const res = await fetch(`${API_URL}/api/services/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand: "SKYAL",
            serviceType,
            quantity: qty,
            sla,
            deliveryMethod: delivOption?.apiMethod,
            referralCode: referral || undefined,
            // Send the address so the server verifies it (Mapbox geocoding)
            // and prices delivery exactly instead of a hardcoded fee.
            ...(delivery !== "pickup" && address.trim().length >= 5 ? { deliveryAddress: address.trim() } : {}),
            ...(custPhone ? { customerPhone: custPhone } : {}),
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setQuote(data.data || data);
          setQuoteError(null);
        } else {
          setQuote(null);
          const errMsg = data?.error?.message;
          if (errMsg) setQuoteError(errMsg);
        }
      } catch {
        if (!cancelled) setQuote(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [serviceType, qty, sla, delivery, referral, service, step, delivOption, address]);

  /* ── Group services by category for the picker ── */
  const servicesByCategory = useMemo(() => {
    const m = new Map<string, Service[]>();
    for (const s of services) {
      if (!m.has(s.category)) m.set(s.category, []);
      m.get(s.category)!.push(s);
    }
    return Array.from(m.entries());
  }, [services]);

  /* ── Fallback estimate (used when the quote API hasn't replied yet) ── */
  const fallbackEstimate = useMemo(() => {
    if (!service) return 0;
    const base = service.basePriceNaira * qty;
    const expressMult =
      sla === "Express" && service.allowExpress ? 1 + service.expressSurchargePct : 1;
    return Math.round(base * expressMult + (delivOption?.cost ?? 0));
  }, [service, qty, sla, delivOption]);

  const quoteTotal = quote?.quoteNaira ?? fallbackEstimate;
  const deliveryFee = quote?.breakdown?.deliveryFee ?? delivOption?.cost ?? 0;
  const expressSurcharge = quote?.breakdown?.expressSurcharge ?? 0;
  const baseSubtotal =
    quote?.breakdown?.subtotal ?? (service ? service.basePriceNaira * qty : 0);

  const canNext =
    (step === 0 && (customMode || !!serviceType)) ||
    (step === 1 && (customMode ? qty > 0 && !!customDescription.trim() : qty > 0)) ||
    (step === 2 && (delivery === "pickup" || address.trim().length > 4)) ||
    (step === 3 && name.trim() && phone.trim().length >= 6) ||
    step === 4;

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Step 0: Upload design files to Cloudinary if present (best-effort, non-blocking)
      // Max 5 files, 10MB each, 25MB total (limits hoisted to module scope)
      const uploadedFiles: { url: string; publicId: string; name: string }[] = [];
      const uploadErrors: string[] = [];

      // Validate limits before upload
      if (uploadFiles.length > MAX_FILES) {
        setSubmitError(`Maximum ${MAX_FILES} files allowed. You selected ${uploadFiles.length}.`);
        setSubmitting(false);
        return;
      }
      const totalSize = uploadFiles.reduce((sum, f) => sum + f.data.length, 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        setSubmitError(`Total file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds the 25MB limit.`);
        setSubmitting(false);
        return;
      }

      for (const file of uploadFiles) {
        if (file.data.length > MAX_FILE_SIZE) {
          uploadErrors.push(`${file.name}: exceeds 10MB limit`);
          continue;
        }
        try {
          const uploadRes = await fetch(`${API_URL}/api/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: file.data, folder: 'skyal-designs' }),
          });
          const contentType = uploadRes.headers.get('content-type') || '';
          if (uploadRes.ok && contentType.includes('application/json')) {
            const uploadData = await uploadRes.json();
            if (uploadData.data?.url) {
              uploadedFiles.push({
                url: uploadData.data.url,
                publicId: uploadData.data.publicId || '',
                name: file.name,
              });
            }
          }
        } catch {
          // Individual file upload failure is non-blocking
        }
      }

      // Build designFileUrl as JSON array (backward compatible with single URL)
      const designFileUrl = uploadedFiles.length > 0
        ? JSON.stringify(uploadedFiles.map(f => ({ url: f.url, publicId: f.publicId, name: f.name })))
        : undefined;
      const designFilePublicId = uploadedFiles.length > 0
        ? uploadedFiles.map(f => f.publicId).filter(Boolean).join(',') || undefined
        : undefined;

      // Step 1: Create the order — catalog path sends serviceType; custom mode
      // sends customSpec and the ADMIN runs the rule lookup (jeans → fabric_custom
      // ₦20k, wood → engraving_wood; truly novel jobs land in QUOTING).
      const basePayload: Record<string, unknown> = {
        brand: "SKYAL",
        quantity: qty,
        sla,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || `customer@skyal.ng`,
        deliveryMethod: delivOption?.apiMethod,
      };
      if (delivery !== "pickup") basePayload.deliveryAddress = address.trim();
      if (referral) basePayload.referralCode = referral.trim();
      if (designFileUrl) {
        basePayload.designFileUrl = designFileUrl;
        basePayload.designFilePublicId = designFilePublicId;
      }
      // Customer notes contain ONLY the notes — design file names travel in
      // designFileUrl and the referral code travels as referralCode.
      if (notes.trim()) basePayload.customerNotes = notes.trim();

      const payload: Record<string, unknown> = customMode
        ? {
            ...basePayload,
            customSpec: {
              description: customDescription.trim(),
              material: customMaterial.trim() || undefined,
              dimensions: customDimensions.trim() || undefined,
              complexity: 'simple',
            },
          }
        : { ...basePayload, serviceType };

      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data?.error?.message || "Failed to create order. Please try again.");
        setSubmitting(false);
        return;
      }
      const order = (data.data || data) as CreatedOrder;
      const orderNumber = order.orderNumber || "";

      // Step 2: Success screen. Provisional QUOTING orders (unpriced custom
      // jobs) skip payment until the team confirms the price — the customer
      // pays from the dashboard.
      setCreatedOrder(order);
      if (order.state !== "QUOTING") {
        await startPayment(order);
      }
    } catch (error) {
      console.error(error);
      setSubmitError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Initialize Paystack payment and redirect to checkout. */
  const startPayment = async (order: CreatedOrder) => {
    setPaymentError(null);
    setPaymentProcessing(true);
    try {
      // Safely compute the app origin to avoid duplicate path segments in callbackUrl
      const appOrigin = (() => {
        const base = process.env.NEXT_PUBLIC_APP_URL || 'https://skyalproj.vercel.app';
        try {
          const url = new URL(base);
          return `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
        } catch {
          return base;
        }
      })();

      const paystackRes = await fetch(`${API_URL}/api/payment/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: order.totalAmount, // Send in Naira, not kobo
          email: (email.trim() || order.customerEmail || `order${order.orderNumber}@skyal.ng`),
          orderNumber: order.orderNumber,
          brand: "SKYAL",
          metadata: { orderNumber: order.orderNumber, brand: "SKYAL" },
          callbackUrl: `${appOrigin}/order/complete?order=${order.orderNumber}`,
        }),
      });

      if (!paystackRes.ok) {
        const errData = await paystackRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || 'Failed to initialize payment');
      }

      const paystackData = await paystackRes.json();
      const authUrl = paystackData.data?.authorization_url || paystackData.data?.authorizationUrl;
      const reference = paystackData.data?.reference || paystackData.data?.ref;

      if (!authUrl) {
        throw new Error('Paystack authorization URL missing');
      }

      // Store pending payment info for verification after return
      sessionStorage.setItem('skyal_pending_payment', JSON.stringify({ orderNumber: order.orderNumber, reference }));

      // Step 3: Redirect to Paystack checkout
      window.location.href = authUrl;
    } catch (payErr: any) {
      // Order is already created — surface the failure so the customer can retry
      console.warn('Payment init failed:', payErr);
      setPaymentError(payErr?.message || 'Payment could not be initialized. Use the button below to retry.');
      setPaymentProcessing(false);
    }
  };

  const reset = () => {
    setStep(0);
    setServiceType("");
    setQty(1);
    setSla("Standard");
    setDelivery("pickup");
    setAddress("");
    setNotes("");
    setUploadFiles([]);
    setReferral("");
    setQuote(null);
    setSubmitError(null);
    setCustomMode(false);
    setCustomDescription("");
    setCustomMaterial("");
    setCustomDimensions("");
  };

  // Check for pending payment to show warning
  const hasPendingPayment = !!sessionStorage.getItem('skyal_pending_payment');

  /* ──────── Success State ──────── */
  if (createdOrder) {
    const quoting = createdOrder.state === "QUOTING";
    return (
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <Coord>ORDER RECEIVED</Coord>
          <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4">
            We&apos;ve got your specs<span className="text-laser">.</span>
          </Heading>
          <p className="text-base text-thread mt-6 leading-relaxed max-w-[560px] mx-auto">
            {quoting ? (
              <>
                Your order <span className="font-mono text-ink">{createdOrder.orderNumber}</span> is
                in — we&apos;re confirming the exact price now. You&apos;ll get a notification,
                then just review and pay.
              </>
            ) : (
              <>
                Your order <span className="font-mono text-ink">{createdOrder.orderNumber}</span> is
                in. We&apos;ll confirm your design and get it on the bed shortly.
              </>
            )}
          </p>

          <div className="mt-10 bg-vellum border border-hairline p-6 text-left">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread mb-1">
                  Service
                </div>
                <div className="text-ink">
                  {createdOrder.serviceLabel || (customMode ? (customDescription || "Custom job") : service?.label) || createdOrder.serviceType || "—"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread mb-1">
                  Quantity
                </div>
                <div className="text-ink">{createdOrder.quantity ?? qty}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread mb-1">
                  Total
                </div>
                <div className="text-ink font-display font-semibold">
                  {formatNaira(createdOrder.totalAmount)}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread mb-1">
                  SLA
                </div>
                <div className="text-ink">{createdOrder.sla || sla}</div>
              </div>
            </div>
          </div>

          {quoting && (
            <div className="mt-6 bg-vellum border border-laser/30 p-4 text-left">
              <p className="text-sm text-thread leading-relaxed">
                Awaiting pricing — we&apos;ll confirm the exact price, then just pay.
                No payment is needed right now.
              </p>
            </div>
          )}

          {paymentError && (
            <div className="mt-6 bg-oxblood/10 border-l-2 border-oxblood p-4 text-left">
              <p className="text-sm text-oxblood mb-3">{paymentError}</p>
              <button
                onClick={() => startPayment(createdOrder)}
                disabled={paymentProcessing}
                className="inline-flex items-center gap-2 bg-laser text-white text-sm font-medium px-6 py-3 hover:bg-ink transition-colors disabled:opacity-50"
              >
                {paymentProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Starting payment…
                  </>
                ) : (
                  <>Retry Payment</>
                )}
              </button>
            </div>
          )}

          <div className="mt-10 flex justify-center gap-4 flex-wrap">
            <button
              onClick={() => onNavigate("track")}
              className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-6 py-3.5 hover:bg-laser hover:text-white transition-colors"
            >
              Track This Order <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate("dashboard")}
              className="inline-flex items-center gap-2 border border-ink/25 text-ink text-sm font-medium px-6 py-3.5 hover:border-ink hover:bg-ink hover:text-bone transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-20">
      {hasPendingPayment && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-3xl">
          <p className="text-sm text-yellow-800">
            ⚠️ Payment in progress: Please complete your payment on Paystack. After completion, return to this page to confirm.
          </p>
        </div>
      )}
      <Coord>START AN ORDER</Coord>
      <Heading className="text-4xl sm:text-5xl lg:text-6xl mt-4 max-w-[700px]">
        Send us your design — we&apos;ll cut it
      </Heading>

      {/* Step rail — the bed's coordinate progression */}
      <div className="mt-10 flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <button
            key={s.n}
            onClick={() => i < step && setStep(i)}
            className={`flex items-center gap-2 shrink-0 px-3 py-2 transition-colors ${
              i === step ? "text-ink" : i < step ? "text-laser cursor-pointer" : "text-thread"
            }`}
          >
            <span className={`font-mono text-xs tnum ${i === step ? "text-laser" : ""}`}>{s.n}</span>
            <span className="text-sm font-medium">{s.label}</span>
            {i < STEPS.length - 1 && <span className="text-kerf ml-1">/</span>}
          </button>
        ))}
      </div>
      <div className="h-px bg-hairline mb-10" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10">
        {/* ── Step body ── */}
        <div>
          {step === 0 && (
            <div>
              <h2 className="font-display font-semibold text-2xl text-ink mb-1">Choose a service</h2>
              <p className="text-sm text-thread mb-6">What are we cutting for you?</p>

              {servicesLoading && (
                <div className="border border-hairline bg-vellum p-8 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-laser animate-spin" />
                  <span className="text-sm text-thread">Loading services…</span>
                </div>
              )}

              {servicesError && !servicesLoading && (
                <div className="border-l-2 border-leather bg-vellum p-6">
                  <div className="flex items-start gap-2 text-leather">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="text-sm">{servicesError}</p>
                  </div>
                </div>
              )}

              {!servicesLoading && !servicesError && services.length === 0 && (
                <div className="border border-hairline bg-vellum p-8 text-center">
                  <p className="text-sm text-thread">No services available right now. Please check back shortly.</p>
                </div>
              )}

              {customMode && (
                <div className="mb-6 border border-laser/40 bg-laser/5 p-5">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-laser mb-2">
                    Custom job mode
                  </div>
                  <p className="text-sm text-thread leading-relaxed">
                    You&apos;re ordering a bespoke job (from chat or the &ldquo;Something else&rdquo; option).
                    Describe it on the next step — we&apos;ll confirm the exact price quickly.
                  </p>
                  <button
                    onClick={() => { setCustomMode(false); setStep(0); }}
                    className="text-xs text-laser hover:text-ink underline underline-offset-2 mt-3"
                  >
                    ← Browse catalog services instead
                  </button>
                </div>
              )}

              {!customMode && !servicesLoading && !servicesError && servicesByCategory.map(([cat, list]) => (
                <div key={cat} className="mb-8 last:mb-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread mb-3">
                    {CATEGORY_LABELS[cat] || cat.replace(/_/g, " ")} · {list.length}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {list.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setServiceType(s.type); setCustomMode(false); }}
                        className={`text-left p-5 border transition-colors ${
                          serviceType === s.type
                            ? "border-laser bg-vellum"
                            : "border-hairline bg-bone hover:border-ink/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-display font-semibold text-lg text-ink mt-0.5">{s.label}</div>
                            <div className="text-[13px] text-thread mt-1.5 leading-relaxed">{s.description}</div>
                          </div>
                          {serviceType === s.type && <Check className="w-5 h-5 text-laser shrink-0" />}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="font-mono text-xs text-ink tnum">
                            {formatNaira(s.basePriceNaira)} <span className="text-thread">{s.unit}</span>
                          </div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread">
                            {s.standardLeadTime}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Something else / custom job — no catalog match needed */}
              {!customMode && !servicesLoading && !servicesError && (
                <button
                  onClick={() => { setCustomMode(true); setStep(1); }}
                  className="w-full text-left p-5 border border-dashed border-ink/30 bg-bone hover:border-laser hover:bg-vellum transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display font-semibold text-lg text-ink mt-0.5">
                        Something else / custom job
                      </div>
                      <div className="text-[13px] text-thread mt-1.5 leading-relaxed">
                        Cutting jeans, engraving wood, a bespoke piece? Describe it and we&apos;ll
                        confirm the exact price fast.
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-laser shrink-0 mt-1" />
                  </div>
                </button>
              )}
            </div>
          )}

          {step === 1 && (customMode ? (
            <div>
              <h2 className="font-display font-semibold text-2xl text-ink mb-1">Describe your job</h2>
              <p className="text-sm text-thread mb-6">
                Tell us what you need — we&apos;ll confirm the exact price quickly.
              </p>
              <div className="space-y-6">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                    What do you need?
                  </label>
                  <textarea
                    rows={3}
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    placeholder="e.g. Cut my jeans into a pattern · Engrave a wooden tray · A bespoke acrylic sign…"
                    className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none resize-none"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                      Material <span className="lowercase">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={customMaterial}
                      onChange={(e) => setCustomMaterial(e.target.value)}
                      placeholder="denim, wood, acrylic…"
                      className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                      Size / notes <span className="lowercase">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={customDimensions}
                      onChange={(e) => setCustomDimensions(e.target.value)}
                      placeholder="waist 34, length 40…"
                      className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : service && (
            <div>
              <h2 className="font-display font-semibold text-2xl text-ink mb-1">Specify details</h2>
              <p className="text-sm text-thread mb-6">{service.label} — how much, how fast?</p>

              <div className="space-y-7">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                    Quantity
                  </label>
                  <div className="flex items-center gap-4 mt-2">
                    <input
                      type="range"
                      min={1}
                      max={500}
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value))}
                      className="flex-1 accent-laser"
                    />
                    <input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                      className="w-24 bg-bone border border-hairline px-3 py-2 font-mono text-sm text-ink tnum focus:border-laser outline-none"
                    />
                    <span className="text-xs text-thread">{service.unit}</span>
                  </div>
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                    Turnaround
                  </label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {SLA_OPTIONS.map((o) => {
                      const disabled = o.id === "Express" && !service.allowExpress;
                      return (
                        <button
                          key={o.id}
                          onClick={() => !disabled && setSla(o.id)}
                          disabled={disabled}
                          className={`p-4 border text-left transition-colors ${
                            sla === o.id
                              ? "border-laser bg-vellum"
                              : disabled
                                ? "border-hairline opacity-40 cursor-not-allowed"
                                : "border-hairline hover:border-ink/40"
                          }`}
                        >
                          <div className="font-display font-semibold text-ink">{o.label}</div>
                          <div className="font-mono text-xs text-thread tnum mt-0.5">
                            {o.id === "Express" && service.expressLeadTime
                              ? service.expressLeadTime
                              : service.standardLeadTime}
                          </div>
                          {disabled && (
                            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-thread mt-1">
                              not available
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                    Design files <span className="lowercase">(up to 5, max 10MB each)</span>
                  </label>
                  <label className="mt-2 flex items-center gap-3 border border-dashed border-ink/30 bg-bone p-4 cursor-pointer hover:border-laser transition-colors">
                    <Upload className="w-5 h-5 text-thread" />
                    <span className="text-sm text-ink">
                      {uploadFiles.length > 0
                        ? `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} selected`
                        : "Drop files or click to upload — any format"}
                    </span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const input = e.target;
                        const selectedFiles = Array.from(input.files || []);
                        // Picker cancelled — keep the files already selected.
                        if (selectedFiles.length === 0) return;
                        // Per-file size check at selection time.
                        const okFiles = selectedFiles.filter((f) => f.size <= MAX_FILE_SIZE);
                        const skipped = selectedFiles.length - okFiles.length;
                        if (skipped > 0) {
                          alert(`${skipped} file${skipped > 1 ? 's' : ''} skipped — max 10MB each.`);
                        }
                        if (okFiles.length === 0) return;
                        // Enforce the total cap against files ALREADY selected.
                        if (uploadFiles.length + okFiles.length > MAX_FILES) {
                          alert(`Maximum ${MAX_FILES} files allowed. Remove some before adding more.`);
                          return;
                        }
                        // Read the new batch as base64, then APPEND it to the
                        // existing selection (previously this REPLACED the list,
                        // so adding files after the first pick lost earlier ones).
                        const pending = okFiles.length;
                        let loaded = 0;
                        const newFiles: { name: string; data: string }[] = [];
                        for (const file of okFiles) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            newFiles.push({ name: file.name, data: reader.result as string });
                            loaded++;
                            if (loaded === pending) {
                              setUploadFiles((prev) => [...prev, ...newFiles]);
                              // Reset the input so the same file can be re-picked later.
                              input.value = "";
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  {uploadFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {uploadFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-thread">
                          <span className="font-mono">{f.name}</span>
                          <span className="text-thread/50">({(f.data.length / 1024).toFixed(0)}KB)</span>
                          <button
                            onClick={() => setUploadFiles(uploadFiles.filter((_, j) => j !== i))}
                            className="text-oxblood hover:text-ink ml-auto"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                    Notes <span className="lowercase">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Grain direction, finish, repeat pattern, anything we should know…"
                    className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none resize-none"
                  />
                </div>
              </div>
            </div>
          ))}

          {step === 2 && (
            <div>
              <h2 className="font-display font-semibold text-2xl text-ink mb-1">Delivery</h2>
              <p className="text-sm text-thread mb-6">How should your pieces reach you?</p>
              <div className="space-y-3">
                {DELIVERY_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setDelivery(o.id)}
                    className={`w-full flex items-center justify-between p-5 border text-left transition-colors ${
                      delivery === o.id ? "border-laser bg-vellum" : "border-hairline hover:border-ink/40"
                    }`}
                  >
                    <div>
                      <div className="font-display font-semibold text-ink">{o.label}</div>
                      <div className="text-[13px] text-thread mt-0.5">{o.detail}</div>
                    </div>
                    <div className="font-mono text-sm text-ink tnum">
                      {o.cost === 0 ? "free" : formatNaira(o.cost)}
                    </div>
                  </button>
                ))}
              </div>
              {delivery !== "pickup" && (
                <div className="mt-6">
                  {savedAddresses.length > 0 && (
                    <div className="mb-3">
                      <label htmlFor="savedAddressPick" className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                        Use saved address
                      </label>
                      <select
                        id="savedAddressPick"
                        value=""
                        onChange={(e) => {
                          const found = savedAddresses.find((a) => a.id === e.target.value);
                          if (found) setAddress(fullSavedAddress(found));
                        }}
                        className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                      >
                        <option value="">Select a saved address…</option>
                        {savedAddresses.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                            {a.isDefault ? " (default)" : ""} — {fullSavedAddress(a).slice(0, 60)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                    Delivery address <span className="lowercase">(search or click the map)</span>
                  </label>
                  <AddressPicker
                    token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""}
                    value={address}
                    onChange={setAddress}
                  />
                  {quoteError && (
                    <p className="mt-2 text-sm text-oxblood flex items-start gap-1.5" role="alert">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{quoteError}</span>
                    </p>
                  )}
                </div>
              )}
              <div className="mt-6">
                <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                  Referral code <span className="lowercase">(optional)</span>
                </label>
                <input
                  value={referral}
                  onChange={(e) => setReferral(e.target.value)}
                  placeholder="Got a code from a friend?"
                  className="mt-2 w-full bg-bone border border-hairline px-4 py-3 text-sm text-ink focus:border-laser outline-none"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="font-display font-semibold text-2xl text-ink mb-1">Your details</h2>
              <p className="text-sm text-thread mb-6">So we can send the quote and reach you.</p>
              <div className="space-y-5">
                <Field label="Name" value={name} onChange={setName} placeholder="Company or individual" />
                <Field label="Phone" value={phone} onChange={setPhone} placeholder="0803 000 0000" type="tel" />
                <Field label="Email" value={email} onChange={setEmail} placeholder="you@studio.com" type="email" />
                <p className="text-xs text-thread">
                  We verify returning customers by phone — no password. New here? We&apos;ll save your details for next time.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="font-display font-semibold text-2xl text-ink mb-1">Review &amp; confirm</h2>
              <p className="text-sm text-thread mb-6">Check everything looks right.</p>
              <dl className="divide-y divide-hairline border-y border-hairline">
                <Row k="Service" v={customMode ? (customDescription || "Custom job") : service ? `${service.label} · ${CATEGORY_LABELS[service.category] || service.category}` : "—"} />
                {customMode && (customMaterial || customDimensions) && (
                  <Row k="Material / size" v={[customMaterial, customDimensions].filter(Boolean).join(" · ")} />
                )}
                <Row k="Quantity" v={customMode ? `${qty}` : `${qty} ${service?.unit ?? ""}`} />
                <Row k="Turnaround" v={sla} />
                <Row k="Delivery" v={delivOption?.label ?? "—"} />
                {delivery !== "pickup" && address && <Row k="Address" v={address} />}
                <Row k="Name" v={name || "—"} />
                <Row k="Phone" v={phone || "—"} />
                {email && <Row k="Email" v={email} />}
                {uploadFiles.length > 0 && <Row k="Design files" v={uploadFiles.map(f => f.name).join(', ')} />}
                {notes && <Row k="Notes" v={notes} />}
              </dl>
              <div className="mt-6 flex items-baseline justify-between bg-vellum border border-hairline p-5">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-thread">
                    {quoteLoading ? "calculating…" : "estimated total"}
                  </div>
                  <div className="text-xs text-thread mt-0.5">
                    {customMode
                      ? "We'll confirm the exact price — pay once it's ready"
                      : quote
                        ? "Live quote · the price you pay is confirmed below"
                        : "Final price confirmed in your quote"}
                  </div>
                </div>
                <div className="font-display font-semibold text-3xl text-ink tnum">
                  {customMode ? "—" : formatNaira(quoteTotal)}
                </div>
              </div>
              {submitError && (
                <div className="mt-4 border-l-2 border-leather bg-vellum p-4 flex items-start gap-2 text-leather">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-sm">{submitError}</p>
                </div>
              )}
              <p className="text-xs text-thread mt-3">
                Payment is processed securely via Paystack after we confirm your order.
              </p>
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center justify-between mt-10">
            <button
              onClick={() => (step === 0 ? onNavigate("home") : setStep(step - 1))}
              className="inline-flex items-center gap-2 text-sm text-thread hover:text-ink transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> {step === 0 ? "Home" : "Back"}
            </button>
            {step < 4 ? (
              <button
                onClick={() => canNext && setStep(step + 1)}
                disabled={!canNext}
                className="inline-flex items-center gap-2 bg-ink text-bone text-sm font-medium px-7 py-3.5 hover:bg-laser hover:text-white transition-colors active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={submitting || paymentProcessing}
                className="inline-flex items-center gap-2 bg-laser text-white text-sm font-medium px-7 py-3.5 hover:bg-ink hover:text-bone transition-colors active:scale-[0.98] disabled:opacity-50"
              >
                {paymentProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing payment...
                  </>
                ) : submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating order...
                  </>
                ) : customMode ? (
                  <>
                    Place Custom Order <Check className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Pay & Submit <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ── Live quote sidebar ── */}
        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="leather-surface grain text-bone p-6 relative overflow-hidden">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone/60 mb-4">
              live quote
            </div>
            {customMode ? (
              <>
                <div className="font-display font-semibold text-xl">Custom job</div>
                <div className="text-sm text-bone/70 mt-1">
                  {customDescription || "Describe your job on the form"}
                  {customMaterial ? ` · ${customMaterial}` : ""}
                </div>
                <div className="my-5 h-px bg-bone/20" />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-bone/70">Price</span>
                  <span className="font-display font-semibold text-3xl tnum">—</span>
                </div>
                <div className="mt-3 text-[11px] text-bone/60 leading-relaxed">
                  We&apos;ll confirm the exact price right after you submit — usually within minutes.
                </div>
              </>
            ) : service ? (
              <>
                <div className="font-display font-semibold text-xl">{service.label}</div>
                <div className="text-sm text-bone/70 mt-1">
                  {qty} {service.unit} · {sla}
                </div>
                <div className="my-5 h-px bg-bone/20" />
                <Line k="Cutting" v={formatNaira(baseSubtotal)} />
                {expressSurcharge > 0 && <Line k="Express" v={`+${formatNaira(expressSurcharge)}`} />}
                <Line k="Delivery" v={deliveryFee === 0 ? "free" : formatNaira(deliveryFee)} />
                {quoteLoading && (
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-bone/60">
                    <Loader2 className="w-3 h-3 animate-spin" /> recalculating…
                  </div>
                )}
                <div className="my-4 h-px bg-bone/20" />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-bone/70">Est. total</span>
                  <span className="font-display font-semibold text-3xl tnum">{formatNaira(quoteTotal)}</span>
                </div>
                {quote?.breakdown?.leadTime && (
                  <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bone/60">
                    lead time · {quote.breakdown.leadTime}
                  </div>
                )}
                {quote?.availability && (
                  <div className="mt-4 pt-4 border-t border-bone/20">
                    <AvailabilityLine availability={quote.availability} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-bone/70 leading-relaxed">
                Pick a service to see a live estimate, or choose &ldquo;Something else / custom job&rdquo; for bespoke work.
              </p>
            )}
          </div>
          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-thread leading-relaxed px-1">
            Quotes valid 14 days · ±1mm tolerance · 5% restock on cancel before cut
          </div>
        </aside>
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
        className="mt-2 w-full bg-bone border-b border-hairline px-0 py-2.5 text-base text-ink focus:border-laser outline-none placeholder:text-thread/40"
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 py-3.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-thread pt-0.5">{k}</dt>
      <dd className="text-sm text-ink text-right max-w-[60%]">{v}</dd>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-bone/70">{k}</span>
      <span className="font-mono tnum text-bone">{v}</span>
    </div>
  );
}
