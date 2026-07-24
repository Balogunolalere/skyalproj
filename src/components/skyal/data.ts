/* ─────────────────────────────────────────────────────────────
   Skyal — shared content (real copy preserved from the original
   skyalproj, tightened where it read as filler).
   ───────────────────────────────────────────────────────────── */

export type ViewId =
  | "home"
  | "order"
  | "track"
  | "dashboard"
  | "chat"
  | "login"
  | "contact"
  | "privacy"
  | "terms"
  | "delivery"
  | "refund"
  | "cancellation"
  | "calculator"
  | "faq"
  | "addresses"
  | "designs"
  | "notfound";

export const NAV_ITEMS: { id: ViewId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "order", label: "Order" },
  { id: "calculator", label: "Calculator" },
  { id: "track", label: "Track" },
  { id: "faq", label: "FAQ" },
  { id: "dashboard", label: "Dashboard" },
  { id: "chat", label: "Support" },
  { id: "contact", label: "Contact" },
];

export const MATERIALS = [
  { name: "Fabrics", items: "cotton · silk · denim · linen · ankara · aso-oke · lace" },
  { name: "Leather", items: "genuine · faux · suede" },
  { name: "Wood", items: "plywood · MDF · hardwood" },
  { name: "Acrylic", items: "clear · coloured · mirror · glitter" },
  { name: "Paper & Card", items: "card · kraft · fine art paper" },
  { name: "Foam Board", items: "foam-core · PVC foam · gatorboard" },
];

export const SERVICES = [
  {
    title: "Laser Cutting",
    desc: "Fabrics, leather, wood, acrylic — clean, precise cuts on any material. Consistent edges, no fraying, no scorch marks.",
  },
  {
    title: "Order Tracking",
    desc: "Know exactly where your order is — from cutting bed to doorstep. No guesswork, no chasing us up.",
  },
  {
    title: "Smart Scheduling",
    desc: "Your order gets the earliest open slot on the bed. We tell you when to expect your pieces — and keep the date.",
  },
  {
    title: "Quality Check",
    desc: "Every piece is checked against your design before it ships. If it's not right, we recut it. No questions asked.",
  },
];

export const CRAFT = [
  {
    title: "Laser Optics",
    desc: "Industrial CO₂ and fibre lasers calibrated to ±0.05mm. Clean edges, zero scorching — even on delicate silks and technical fabrics.",
  },
  {
    title: "Material Mastery",
    desc: "Cotton, silk, denim, leather, acrylic, plywood, felt. A library of 40+ materials, each with tuned power, speed, and frequency profiles.",
  },
  {
    title: "Nesting Intelligence",
    desc: "Our algorithms nest your patterns for minimal waste. Typical material yield: 92–97% — more of your budget becomes product, not scrap.",
  },
  {
    title: "Machine-Vision QA",
    desc: "Every piece passes machine-vision inspection. Tolerances verified, edge quality scored, defects flagged — before it leaves the bed.",
  },
  {
    title: "Climate Control",
    desc: "Temperature and humidity held at ±1.5°C and ±5% RH across the floor. Your pattern from January cuts the same in July.",
  },
  {
    title: "Batch Consistency",
    desc: "Same file, same material, same settings — identical results. From 5 units to 5,000. Statistical process control tracks every parameter.",
  },
];

export const PROCESS_STEPS = [
  {
    title: "Submit",
    time: "~2 min",
    desc: "Send your design however you have it — screenshot, sketch, or CAD file. Tell us the material and how many. You get a quote back fast.",
  },
  {
    title: "Laser Cut",
    time: "~4 hrs",
    desc: "Your order enters the queue. We find the best slot on the bed, the machines cut your pieces, and you get live updates the whole way.",
  },
  {
    title: "Track & Receive",
    time: "~72 hrs",
    desc: "Quality check. Packaging. Shipping. Track every step. Your pieces arrive when we said they would.",
  },
];

export const PLATFORM_FEATURES = [
  {
    title: "Live order tracking",
    desc: "See exactly where your order is — received, in queue, cutting, quality check, shipped. No more 'when will it be ready?' messages.",
  },
  {
    title: "Instant quotes & scheduling",
    desc: "Send your design, get a quote. We check fabric, complexity, and the current queue to give you a price and delivery window fast.",
  },
  {
    title: "Your own dashboard",
    desc: "Every client gets a dashboard. Order history, active jobs, delivery tracking. Everything you need, in one place.",
  },
];

export const DIFFERENTIATORS = [
  { title: "Always-on support", desc: "Message us any time, day or night — a real person responds fast." },
  { title: "99.2% on-time", desc: "Delivered when promised. When we commit to a date, we keep it." },
  { title: "Quality guarantee", desc: "Not right? We recut, free. Every piece is inspected before it ships." },
  { title: "Real-time tracking", desc: "From queue to cutting to your doorstep — live status, always." },
];

export const STATS = [
  { value: 12000, decimals: 0, unit: "+", label: "Orders processed", sub: "since 2022" },
  { value: 72, decimals: 0, unit: "hrs", label: "Average turnaround", sub: "design to ship" },
  { value: 40, decimals: 0, unit: "+", label: "Materials", sub: "cotton, silk, denim, leather & more" },
  { value: 99.2, decimals: 1, unit: "%", label: "On-time rate", sub: "delivered when promised" },
];

export const TESTIMONIALS = [
  {
    name: "Priya Mehta",
    role: "Founder, Mehta Atelier",
    quote:
      "Skyal took our cutting from a constant headache to a solved problem. I send a sketch on Monday, pieces arrive by Thursday. The tracking alone has saved us so much time.",
  },
  {
    name: "James Okafor",
    role: "Creative Director, Okafor Streetwear",
    quote:
      "The instant quoting is a game changer. What used to take a day of back-and-forth with local cutters now happens in minutes. My team loves the dashboard — they can see exactly where each batch is.",
  },
  {
    name: "Lena Vogel",
    role: "Product Designer, Vogel Leather Goods",
    quote:
      "We tried three shops before Skyal. Everyone else struggled with leather — burn marks, warped edges, inconsistent depth. Skyal nailed it on the first run. The finish is flawless every time.",
  },
  {
    name: "Marcus Chen",
    role: "Owner, Form & Grain Studio",
    quote:
      "I cut mostly plywood and acrylic for furniture panels. Skyal is one of the few places that does both fabrics and rigid materials at this quality. The scheduling means I can plan builds around real delivery dates.",
  },
  {
    name: "Amina Yusuf",
    role: "Head of Production, Studio Amina",
    quote:
      "The tracking alone is worth it. I run collections for four brands and being able to see exactly where each order is in the queue — without a single email — has changed how I schedule my calendar.",
  },
];

export const FAQS = [
  {
    q: "How do I place an order?",
    a: "Send us your design through the Order page. Pick your material, tell us how many, and we send a quote within 4 hours.",
  },
  {
    q: "How long does it take?",
    a: "Standard orders ship within 72 hours. Express is 48 hours. Complex projects may take 1–2 weeks.",
  },
  {
    q: "What file formats do you accept?",
    a: "Any format works — photos, sketches, screenshots, or CAD files. Our team reviews every submission.",
  },
  {
    q: "Can I track my order?",
    a: "Yes. Every order gets a tracking number. Open the Track page to see real-time status updates.",
  },
  {
    q: "Do you offer delivery?",
    a: "Yes — Lagos delivery (same-day/next-day) or free store pickup at our Ogba, Ikeja facility. Choose your option at checkout.",
  },
  {
    q: "What if I'm not satisfied?",
    a: "Every piece is quality-checked before shipping. If something's not right, we'll recut it. No questions asked.",
  },
];

export const ORDER_SERVICES = [
  { id: "fabric", label: "Fabric Cutting", cat: "Textiles", base: 1500, unit: "per metre", desc: "Cotton, silk, denim, ankara, lace — clean edges, no fraying." },
  { id: "leather", label: "Leather Cutting", cat: "Textiles", base: 4500, unit: "per sq ft", desc: "Genuine, faux, suede. No scorch, consistent depth." },
  { id: "wood", label: "Wood Cutting", cat: "Rigid", base: 2000, unit: "per sheet", desc: "Plywood, MDF, hardwood. Smooth finish." },
  { id: "acrylic", label: "Acrylic Cutting", cat: "Rigid", base: 3500, unit: "per sheet", desc: "Clear, coloured, mirror. Flame-polished edges." },
  { id: "paper", label: "Paper & Card", cat: "Rigid", base: 800, unit: "per pack", desc: "Card, kraft, fine art paper. Crisp lines." },
  { id: "foam", label: "Foam Board", cat: "Rigid", base: 1200, unit: "per sheet", desc: "Foam-core, PVC foam, gatorboard." },
];

export const TRACK_STATES = [
  { key: "PAYMENT_SUCCESS", label: "Payment received", desc: "Your order is confirmed and entering the queue." },
  { key: "IN_QUEUE", label: "In queue", desc: "Scheduled on the cutting bed. We'll start cutting soon." },
  { key: "IN_PRODUCTION", label: "On the bed", desc: "The laser is cutting your pieces right now." },
  { key: "READY", label: "Quality checked", desc: "Cut and inspected. Ready for packing and dispatch." },
  { key: "DISPATCHED", label: "Dispatched", desc: "On its way to you. Track the courier for the last mile." },
  { key: "DELIVERED", label: "Delivered", desc: "Your pieces have arrived. We hope you love them." },
];

export const PRIVACY_SECTIONS = [
  { id: "1.0", title: "Information we collect", content: "When you submit an order, we collect your name, email, design files, material specifications, and any notes you provide.\n\nWe also keep order history — what you've had cut, when, and in what quantity. If you contact support, we retain those communications.\n\nOur platform logs standard technical data: IP address, browser type, pages visited, and time on each page. This helps us improve the service and detect abuse." },
  { id: "2.0", title: "How we use your data", content: "Your design files and specifications are used solely to fulfil your orders — quoting, scheduling, cutting, quality checking, and shipping.\n\nYour email is used for order confirmations, tracking updates, and occasional service announcements. We never sell, rent, or share your personal data with third parties for their marketing.\n\nAnonymised, aggregated operational data (cut volumes, material popularity, queue patterns) may be used internally to improve scheduling and capacity." },
  { id: "3.0", title: "Data storage & security", content: "All customer data is stored on encrypted servers with access limited to Skyal personnel who need it to fulfil orders.\n\nDesign files are stored for the duration of your order plus 90 days, then permanently deleted unless you request earlier removal. We use TLS encryption in transit and AES-256 at rest.\n\nPayment information is processed by our payment partners and is never stored on Skyal servers." },
  { id: "4.0", title: "Cookies & tracking", content: "Skyal uses essential cookies for session management and order tracking.\n\nWe use analytics cookies to understand how visitors use the site — which pages, how long, where from. You can disable non-essential cookies in your browser without affecting your ability to place or track orders.\n\nWe do not use third-party advertising cookies or tracking pixels." },
  { id: "5.0", title: "Your rights", content: "You can access, correct, or delete your personal data at any time. You can request a copy of all data we hold about you, and we'll provide it within 14 days.\n\nTo exercise any of these rights, contact privacy@skyal.com.\n\nIf you're in the EU or UK, you have additional rights under GDPR, including data portability and the right to object to processing. We comply with all applicable data protection regulations." },
  { id: "6.0", title: "Changes to this policy", content: "We may update this policy from time to time. When we do, we'll notify active customers by email and update the date at the top of this page.\n\nContinued use of Skyal after changes take effect means you accept the revised policy. We recommend reviewing this page periodically if you're a regular customer." },
];

export const TERMS_SECTIONS = [
  { id: "1.0", title: "General terms", content: "By using the Skyal platform and submitting orders for laser cutting, you agree to these conditions.\n\nSkyal provides precision cutting services for fabrics, leather, wood, acrylic and more, powered by smart scheduling. All orders are subject to material availability and queue scheduling." },
  { id: "2.0", title: "Orders & payment", content: "Quotes are valid for 14 days. Payment is due on order confirmation unless otherwise agreed.\n\nSkyal reserves the right to adjust pricing based on material cost fluctuations. All prices are in NGN unless specified otherwise.\n\nCancellations made before cutting begins are refunded in full minus a 5% processing fee." },
  { id: "3.0", title: "Quality & delivery", content: "Every piece is measured against your specifications before shipping. Our standard tolerance is ±1mm unless specified in the order.\n\nDelivery timelines are estimates based on current queue depth and material availability. Skyal is not liable for delays caused by shipping carriers or force majeure events." },
  { id: "4.0", title: "Data & privacy", content: "Client designs, files, and specifications are stored securely and never shared with third parties.\n\nOrder history, customer data, and communication records are retained for the duration of the business relationship and deleted on written request. Anonymised operational data may be used to improve scheduling and quoting." },
];

export const CONTACT_DETAILS = [
  { label: "Email", value: "skyalservices@gmail.com", href: "mailto:skyalservices@gmail.com" },
  { label: "Phone", value: "0803 500 3068  ·  0806 058 0419", href: "tel:+2348035003068" },
  { label: "Address", value: "Wempco Rd, Ogba — Ikeja, Lagos, Nigeria", href: "https://maps.google.com/?q=Wempco+Rd,+Ogba,+Ikeja,+Lagos,+Nigeria" },
  { label: "Socials", value: "Facebook: Skyal Laser Services  ·  Instagram: @skyal_laser_services", href: "https://instagram.com/skyal_laser_services" },
];

export const HOURS = [
  { day: "Monday – Friday", time: "08:00 – 18:00" },
  { day: "Saturday", time: "Closed" },
  { day: "Sunday", time: "Closed" },
];

export function formatNaira(n: number): string {
  return "₦" + Math.round(n).toLocaleString("en-NG");
}

/* ─────────────────────────────────────────────────────────────
   Delivery Policy — Paystack requirement
   ───────────────────────────────────────────────────────────── */
export const DELIVERY_SECTIONS = [
  { id: "1.0", title: "Delivery Methods", content: "Skyal currently delivers to Lagos only. We offer two delivery options:\n\n1. **Local Delivery (Lagos):** Same-day or next-day delivery depending on your location within Lagos. Orders placed before 12 PM on business days are eligible for same-day delivery. A flat fee applies based on your area within Lagos.\n\n2. **Store Pickup:** You may collect your order directly from our facility at Wempco Rd, Ogba — Ikeja, Lagos. We will notify you via email and SMS when your order is ready for pickup. Please bring a valid ID and your order confirmation." },
  { id: "2.0", title: "Processing Times", content: "Standard turnaround time is 72 hours from payment confirmation to dispatch. Express orders (48 hours) are available at checkout for an additional fee. Complex or large-volume orders may require 1–2 weeks — you will be informed of the estimated timeline during the quoting process.\n\nProcessing times begin once payment is confirmed and do not include weekends or public holidays in Nigeria." },
  { id: "3.0", title: "Delivery Fees", content: "Delivery fees are calculated based on your location within Lagos at checkout. There is no flat rate — the exact cost is shown to you before you pay.\n\nStore pickup is always free.\n\nAll prices are in Nigerian Naira (NGN)." },
  { id: "4.0", title: "Order Tracking", content: "Every order receives a unique tracking number upon dispatch. You can monitor your order status in real-time through the Track page on our platform. Updates include: payment confirmed, in queue, on the cutting bed, quality checked, dispatched, and delivered.\n\nFor local deliveries, you will receive a direct call from our courier when your order is en route." },
  { id: "5.0", title: "Lost or Damaged Shipments", content: "In the rare event that your order is lost in transit or arrives damaged, please contact us within 48 hours of the expected delivery date. We will file a claim with our courier partner and either replace your order at no cost or issue a full refund.\n\nSkyal packages all orders securely to minimise transit risk. We accept responsibility for your order until it is delivered to the address you provided or collected at our facility." },
];

/* ─────────────────────────────────────────────────────────────
   Refund Policy — Paystack requirement
   ───────────────────────────────────────────────────────────── */
export const REFUND_SECTIONS = [
  { id: "1.0", title: "Eligibility for Refunds", content: "You are eligible for a refund under the following circumstances:\n\n1. **Order Cancelled Before Production:** If you cancel your order before it has begun cutting (before the IN_PRODUCTION status), you will receive a full refund minus a 5% processing fee.\n\n2. **Defective or Incorrect Order:** If the pieces delivered do not match your specifications, material choice, or quantity — or if they fail our quality inspection — you are entitled to a full refund or a free recut, at your discretion.\n\n3. **Non-Delivery:** If your order does not arrive within the estimated delivery window plus 7 business days, and we are unable to provide a valid tracking update, you may request a full refund.\n\n4. **Payment Errors:** In cases where you were charged twice for the same order or charged an incorrect amount, refunds will be processed immediately upon verification." },
  { id: "2.0", title: "How to Request a Refund", content: "To request a refund, contact us at skyalservices@gmail.com or through the Support chat on our platform. Include your order number, a description of the issue, and any supporting photos or documentation.\n\nWe will acknowledge your refund request within 24 hours and process eligible refunds within 3–5 business days. Refunds are issued to the original payment method used during checkout." },
  { id: "3.0", title: "Non-Refundable Cases", content: "The following situations are not eligible for refunds:\n\n- Orders that have already entered the production phase (cutting has begun), unless the error is Skyal's fault.\n- Changes of mind after the order has been completed and shipped.\n- Delays caused by the customer providing incorrect delivery information or being unavailable for delivery/pickup.\n- Custom designs where the customer approved the final proof before production began.\n\nIf you believe your situation qualifies for an exception, please contact us and we will review on a case-by-case basis." },
  { id: "4.0", title: "Refund Processing Time", content: "Once a refund is approved, it typically takes 3–5 business days to reflect in your account. For bank transfers, this may take up to 7 business days depending on your financial institution. For card payments, refunds follow the card network processing timelines.\n\nIf you do not receive your refund within the stated timeframe, please reach out to us with your refund reference number." },
];

/* ─────────────────────────────────────────────────────────────
   Cancellation Policy — Paystack requirement
   ───────────────────────────────────────────────────────────── */
export const CANCELLATION_SECTIONS = [
  { id: "1.0", title: "How to Cancel an Order", content: "You may cancel your order at any time before it enters production by:\n\n1. Logging into your dashboard and clicking 'Cancel Order' on the relevant job.\n2. Contacting us via email at skyalservices@gmail.com.\n3. Using the Support chat on our platform.\n\nPlease include your order number and reason for cancellation in your request. Our support team will confirm receipt of your cancellation within 1 hour during business hours." },
  { id: "2.0", title: "Cancellation Before Production", content: "Orders cancelled before cutting begins are eligible for a full refund minus a 5% processing fee to cover administrative costs. The refund will be processed to your original payment method within 3–5 business days.\n\nExample: For an order of ₦20,000, the processing fee would be ₦1,000, and your refund would be ₦19,000." },
  { id: "3.0", title: "Cancellation During or After Production", content: "Once your order has entered the production phase (status shows IN_PRODUCTION or READY), it cannot be cancelled through the platform. However, you may still contact our support team to discuss your situation.\n\n- If the order is in production, a partial refund may be issued at our discretion, less the cost of materials already consumed and labour invested.\n- If the order has been completed and shipped, standard return and refund policies apply instead.\n- If the order is ready but not yet dispatched, we can hold it for you at no extra charge while you decide." },
  { id: "4.0", title: "Skyal's Right to Cancel", content: "Skyal reserves the right to cancel any order under the following conditions:\n\n- Material is unavailable or defective and cannot be sourced in a timely manner.\n- The design submitted raises safety, legal, or intellectual property concerns.\n- Payment verification fails or fraud is suspected.\n- Force majeure events (natural disasters, infrastructure failures, etc.) prevent fulfilment.\n\nIf Skyal cancels your order, you will receive a full refund with no processing fee deducted. We will notify you as soon as possible and, where feasible, suggest alternative solutions." },
  { id: "5.0", title: "Changes to Cancellations", content: "If your circumstances change and you wish to reinstate a cancelled order, contact us immediately. Subject to queue availability and material stock, we will do our best to accommodate your request. Reinstated orders will be prioritised based on the original order date." },
];
