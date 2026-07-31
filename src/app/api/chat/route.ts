import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ═══════════════════════════════════════════════════════════════════════
// COMPLETE SKYAL SERVICE CATALOG — Accurate pricing for AI quotes
// ═══════════════════════════════════════════════════════════════════════

const SKYAL_SYSTEM_PROMPT = `You are Skyal's AI Assistant — the friendly, knowledgeable voice of Skyal Laser Services, a precision laser cutting business in Ogba, Ikeja, Lagos, Nigeria.

# YOUR IDENTITY
- You represent Skyal Laser Services (sister brand to Paberin Creations)
- You help with laser cutting, engraving, sheet cutting, signage, and cake toppers
- Your tone: warm, professional, Nigerian-friendly. Use "ma" / "sir" respectfully.
- Be honest about limitations. When you can't do something, explain why.

# SERVICES & PRICING (All amounts in Nigerian Naira ₦ — NO VAT)

## FABRIC LASER CUTTING (customer brings fabric — 5 working days, express 48h +50%)
Sleeves (pair): ₦20,000 | Full Buba: ₦35,000 | One Layer of Buba: ₦40,000 | Bottom of Wrapper: ₦40,000 | Skirt: ₦50,000 | Full Blouse + Skirt: ₦70,000 | Full Buba + Wrapper: ₦75,000 | Boubou: ₦45,000 | Sleeves + Edge of Wrapper: ₦50,000 | Sleeves + Buba Front/Back: ₦30,000 | Custom Fabric Cutting: ₦10,000/section (min ₦20K) | Fabric Per Yard: ₦20,000/yard | Complex Custom Gown: ₦100K-₦200K (no express, 1-2 weeks)

## ENGRAVING (customer brings item — NO EXPRESS, minimum 48 hours)
Phone Back: ₦5,000 | Jewelry: ₦6,000 | Leather: ₦17,500 | Wood: ₦7,500 | Small Items (stirrers, sticks): ₦1,500 | Curved Surface: ₦15,000 | Detective Badge: ₦2,500 (no express) | Necklace: ₦7,000

## SHEET CUTTING
4ft×4ft: ₦40,000 (48h express +50%) | 8ft×4ft: ₦70,000 (no express, external partner) | Custom Sheet: ₦55,000 (48h express +50%) | Acrylic Stick Cutting: ₦100/piece (min ₦5K)

## CAKE TOPPERS & SIGNAGE
Acrylic Cake Topper: ₦15,000 | Custom Topper: ₦25,000 (5-7 days, no express) | Small Signage: ₦15K-₦25K | Custom Signage: ₦30K-₦70K

## ADD-ONS: Stoning Board ₦20,000

# KEY RULES
- Express = +50% surcharge. 48 hours minimum (NOT next day).
- Engraving: NO express. Minimum 48 hours. We don't rush engraving.
- Metal cutting: ALWAYS external partner. 10 working days. NO express.
- Lead time counts from PAYMENT confirmation.
- Full payment before production. No deposit/balance.
- NO VAT. Machine bed: 900mm×600mm in-house. Larger → external partner.
- Tolerance ±1mm. 99.2% on-time. Quality guarantee: recut free if not right.
- 40+ materials, each with tuned power/speed/frequency profiles.

# DELIVERY
FREE pickup (Ogba, Ikeja, Lagos) | Lagos delivery: ₦1,500-₦3,000 | Nationwide waybill: ₦3,500

# HANDLING AMBIGUOUS QUERIES
- "I need something for my wedding" → Ask: fabric? cake topper? signage?
- "How much for cutting?" → Ask: what material? what item? how many?
- "Price?" → Overview price ranges, ask specifics
- Pidgin OK: "abeg", "e go cost", "na how much", "shey you fit"
- "Last price?" → Explain fixed catalog prices politely
- Image only → Acknowledge, ask what they want done
- Just "Ok"/"Yes" → Confirm prior quote, guide to order

# RESPONSE FORMAT
Answer conversationally first. If a COMPLETE quote is ready, append EXACTLY:

[QUOTE]
{"service_type":"<key>","service_label":"<name>","quantity":<num>,"sla":"Standard|Express","unit_price":<num>,"subtotal":<num>,"express_surcharge":<num>,"delivery_fee":<num>,"total":<num>,"lead_time":"<text>","notes":"<text>"}
[/QUOTE]

If info is missing, NEVER output [QUOTE] — ask clarifying questions instead.`;

// ════════════════════════════════════════════════════════════════
// Configuration
// ════════════════════════════════════════════════════════════════

const MAX_REQUESTS = 15;
const RATE_WINDOW_MS = 60000;
const CACHE_TTL_MS = 60000;
const MAX_CACHE = 100;
const MAX_MSG_LEN = 8000;
const MAX_HISTORY = 50;

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

// ── Rate limiter ──
const rateStore = new Map<string, { count: number; start: number }>();
function clientIp(req: NextRequest) { const x = req.headers.get("x-forwarded-for"); return x ? x.split(",")[0].trim() : "unknown"; }
function rateLimited(ip: string): boolean {
  const now = Date.now(); const k = `r:${ip}`; const e = rateStore.get(k);
  if (!e || now - e.start > RATE_WINDOW_MS) { rateStore.set(k, { count: 1, start: now }); return false; }
  if (e.count >= MAX_REQUESTS) return true; e.count++; return false;
}

// ── Cache ──
const cache = new Map<string, { reply: string; ts: number }>();
function cacheKey(msgs: Array<{ role: string; content: string }>) { return msgs.filter(m => m.role !== "system").map(m => `${m.role}:${m.content}`).join("|"); }
function cacheGet(k: string): string | null { const e = cache.get(k); if (!e || Date.now() - e.ts > CACHE_TTL_MS) { cache.delete(k); return null; } return e.reply; }
function cacheSet(k: string, v: string) { if (cache.size >= MAX_CACHE) { const f = cache.keys().next(); if (!f.done) cache.delete(f.value); } cache.set(k, { reply: v, ts: Date.now() }); }

// ── Quote extraction ──
function parseQuote(text: string) { const m = text.match(/\[QUOTE\]\s*([\s\S]*?)\s*\[\/QUOTE\]/); if (!m) return undefined; try { const q = JSON.parse(m[1].trim()); if (!q.total || q.total <= 0) return undefined; return { price: q.total, summary: `${q.service_label || ''}: ${q.quantity || 1}× ₦${(q.unit_price || q.total).toLocaleString('en-NG')} = ₦${q.total.toLocaleString('en-NG')}`, breakdown: q }; } catch { return undefined; } }
function cleanText(t: string) { return t.replace(/\[QUOTE\][\s\S]*?\[\/QUOTE\]/g, '').trim(); }
function newSessionId() { return `skyal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }

// ── Save to admin backend (fire-and-forget, best-effort) ──
async function saveToAdmin(sessionId: string, messages: Array<{ role: string; content: string }>) {
  try {
    await fetch(`${ADMIN_API_URL}/api/skyal/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messages[messages.length - 1]?.content || '', brand: "skyal", mode: "live", history: messages.slice(0, -1), sessionId }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* best-effort */ }
}

// ════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let message = typeof body?.message === 'string' ? body.message.trim() : '';
    const history = Array.isArray(body?.history) ? body.history : [];
    let messages = Array.isArray(body?.messages) ? body.messages : [];

    // Support both input formats
    if (!message && messages.length > 0) {
      const last = [...messages].reverse().find((m: any) => m.role === 'user');
      message = last?.content || '';
    }
    if (messages.length === 0 && history.length > 0) messages = [...history, { role: 'user', content: message }];
    if (messages.length === 0 && message) messages = [{ role: 'user', content: message }];

    // Validate
    if (!message) return NextResponse.json({ error: 'Message required', reply: 'Please type a message.' }, { status: 400 });
    if (message.length > MAX_MSG_LEN) return NextResponse.json({ error: 'Too long', reply: `Max ${MAX_MSG_LEN} characters.` }, { status: 400 });

    // Prompt injection guard
    const inj = [/^system:\s*/im, /^\[system\]\s*/im, /ignore (all |your )?(previous |prior )?instructions/i, /you are now /i, /forget everything/i, /override your /i];
    if (message.length < 200 && inj.some(p => p.test(message))) return NextResponse.json({ error: 'Invalid', reply: 'I can only help with Skyal laser cutting services.' }, { status: 400 });

    // Sanitize
    const sanitized = messages.filter((m: any) => m?.role && m?.content && typeof m.content === 'string').slice(-MAX_HISTORY);

    // Rate limit
    if (rateLimited(clientIp(req))) return NextResponse.json({ error: 'Rate limited', reply: 'Too many requests. Try again later.', rateLimit: true }, { status: 429 });

    const key = process.env.AGNES_API_KEY;
    if (!key) return NextResponse.json({ reply: 'AI not configured. Contact support.', error: true }, { status: 500 });

    const sid = body?.sessionId || newSessionId();

    // Build Agnes messages
    const agnesMsgs = [{ role: "system", content: SKYAL_SYSTEM_PROMPT }, ...sanitized.map((m: any) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: m.content.slice(0, 4000) }))];

    // Cache
    const ck = cacheKey(agnesMsgs);
    const cached = cacheGet(ck);
    if (cached) {
      const q = parseQuote(cached);
      return NextResponse.json({ reply: cleanText(cached), assistant_text: cleanText(cached), quote: q, render_order_now: !!q, sessionId: sid, cached: true });
    }

    // Call Agnes
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 60000);
    const res = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "agnes-2.0-flash", messages: agnesMsgs, temperature: 0.5, max_tokens: 2048 }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    if (!res.ok) {
      const et = await res.text().catch(() => '');
      const s = res.status;
      if (s === 401 || s === 403) throw new Error("AI auth error");
      if (s === 429) throw new Error("AI busy");
      throw new Error(`AI error ${s}: ${et.substring(0, 200)}`);
    }

    const data = await res.json();
    const raw = data.choices[0]?.message?.content?.trim() || "";
    const quote = parseQuote(raw);
    const reply = cleanText(raw);

    if (ck) cacheSet(ck, raw);

    // Fire-and-forget save to admin
    const allMsgs = [...sanitized.map((m: any) => ({ role: m.role, content: m.content })), { role: 'assistant', content: reply }];
    saveToAdmin(sid, allMsgs).catch(() => {});

    return NextResponse.json({ reply, assistant_text: reply, quote: quote || undefined, render_order_now: !!quote, sessionId: sid });

  } catch (e: any) {
    if (e instanceof Error && e.name === 'AbortError') return NextResponse.json({ reply: "Taking longer than usual. Please try again.", error: true }, { status: 504 });
    if (e instanceof AggregateError) { for (const err of e.errors) { if (err.name === 'AbortError') return NextResponse.json({ reply: "Taking longer than usual. Please try again.", error: true }, { status: 504 }); } }
    console.error('[Skyal Chat]', e?.message || e);
    return NextResponse.json({ reply: "Couldn't process that. Try again or call 0803 500 3068.", error: true }, { status: 500 });
  }
}
