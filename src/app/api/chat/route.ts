import { NextRequest, NextResponse } from "next/server";
import {
  RateLimiter,
  retryWithBackoff,
  parseEnvInt,
  generateSessionId,
  extractQuote,
  cleanAssistantText,
  sanitizeHistory,
  isInjectionAttempt,
} from "@/lib/chat";

export const runtime = "nodejs";
// Vercel function duration — required so slow Agnes calls (20-45s) aren't
// killed as 504s. Hobby caps at 60s; on Pro you can raise to 300 and bump
// TOTAL_TIMEOUT.
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════════════════
// COMPLETE SKYAL SERVICE CATALOG — Accurate pricing for AI quotes
// ═══════════════════════════════════════════════════════════════════════

export const SKYAL_SYSTEM_PROMPT = `You are Skyal's AI Assistant — the friendly, knowledgeable voice of Skyal Laser Services, a precision laser cutting business in Ogba, Ikeja, Lagos, Nigeria.

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
{
  "service_type": "<service_type_key>",
  "service_label": "<human readable name>",
  "quantity": <number>,
  "sla": "Standard" or "Express",
  "unit_price": <base_price_per_unit_in_naira_BEFORE_surcharges>,
  "subtotal": <quantity × unit_price>,
  "express_surcharge": <0_or_surcharge_amount>,
  "add_ons_total": <0_or_total_of_add_ons>,
  "discount": <0_or_discount_amount>,
  "delivery_fee": <0_or_fee>,
  "total": <subtotal + express_surcharge + add_ons_total + delivery_fee − discount>,
  "original_price": <optional_pre_discount_price>,
  "lead_time": "<human readable>",
  "notes": "<any caveats or important info>"
}
[/QUOTE]

IMPORTANT: the [QUOTE] JSON must be plain text — NEVER wrap it in markdown code fences (triple backticks), NEVER add trailing commas, and make sure "total" matches the sum of its components exactly.

If info is missing, NEVER output [QUOTE] — ask clarifying questions instead.`;

// ════════════════════════════════════════════════════════════════
// Configuration — validated env values; invalid ones fall back to defaults
// ════════════════════════════════════════════════════════════════

const FETCH_TIMEOUT = parseEnvInt('FETCH_TIMEOUT', 20000); // per-attempt timeout in ms
const MAX_RETRIES = parseEnvInt('MAX_RETRIES', 2);
const RETRY_BASE_DELAY = parseEnvInt('RETRY_BASE_DELAY', 1000); // ms
const TOTAL_BUDGET_MS = parseEnvInt('TOTAL_TIMEOUT', 45000); // cap across all attempts (keep < maxDuration on Vercel)
const RATE_LIMIT_MAX = parseEnvInt('RATE_LIMIT_MAX', 15);
const RATE_LIMIT_WINDOW = parseEnvInt('RATE_LIMIT_WINDOW', 60000); // 1min default
const CACHE_TTL_MS = 60000;
const MAX_CACHE = 100;
const MAX_MSG_LEN = 8000;

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "https://skyalxpaberin-admin.vercel.app";

// ── Rate limiter (per client IP) ──
const rateLimiter = new RateLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW);

// ── Response cache (60s TTL) ──
const cache = new Map<string, { reply: string; ts: number }>();
function cacheKey(msgs: Array<{ role: string; content: string }>) { return msgs.filter(m => m.role !== "system").map(m => `${m.role}:${m.content}`).join("|"); }
function cacheGet(k: string): string | null { const e = cache.get(k); if (!e || Date.now() - e.ts > CACHE_TTL_MS) { cache.delete(k); return null; } return e.reply; }
function cacheSet(k: string, v: string) { if (cache.size >= MAX_CACHE) { const f = cache.keys().next(); if (!f.done) cache.delete(f.value); } cache.set(k, { reply: v, ts: Date.now() }); }

// ── Save to admin backend (fire-and-forget, best-effort) ──
async function saveToAdmin(sessionId: string, messages: Array<{ role: string; content: string }>) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${ADMIN_API_URL}/api/skyal/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messages[messages.length - 1]?.content || '', brand: "skyal", mode: "live", history: messages.slice(0, -1), sessionId }),
      signal: controller.signal,
    });
  } catch {
    // Best-effort: admin save failure must not affect the customer
    console.warn('[Skyal Chat] Admin session save failed (non-critical)');
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Statuses worth retrying — everything else is a hard failure. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Error carrying an HTTP status from the Agnes API (used to decide retries). */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) return RETRYABLE_STATUS.has(error.status);
  if (error instanceof Error) {
    // AbortError = our per-attempt timeout fired; TimeoutError = upstream timeout;
    // TypeError = network-level fetch failure (DNS, connection reset, …)
    return error.name === 'AbortError' || error.name === 'TimeoutError' || error.name === 'TypeError';
  }
  return false;
}

// ════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body', message: 'Please send a valid JSON body.', reply: 'Please send a valid JSON body.' },
        { status: 400 }
      );
    }
    const {
      message: rawMessage,
      history,
      brand = 'skyal',
      sessionId: incomingSessionId,
    } = body as Record<string, unknown>;

    // Support both input formats
    let message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    let messages = Array.isArray(body.messages) ? body.messages : [];
    if (!message && messages.length > 0) {
      const last = [...messages].reverse().find((m: any) => m.role === 'user');
      message = typeof last?.content === 'string' ? last.content : '';
    }
    if (messages.length === 0 && Array.isArray(history) && history.length > 0) messages = [...history, { role: 'user', content: message }];
    if (messages.length === 0 && message) messages = [{ role: 'user', content: message }];

    // ── Input validation ──
    if (typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'Message is required', message: 'Please type a message to chat with the assistant.', reply: 'Please type a message.' },
        { status: 400 }
      );
    }
    message = message.trim();

    // Reject excessively long messages
    if (message.length > MAX_MSG_LEN) {
      return NextResponse.json(
        { error: 'Message too long', message: `Please keep your message under ${MAX_MSG_LEN} characters. Try breaking it into smaller parts.`, reply: `Max ${MAX_MSG_LEN} characters.` },
        { status: 400 }
      );
    }

    // Sanitize history: max 50 turns, only user/assistant, strip empty/long content.
    // `history` is the canonical source; when the caller used the `messages`
    // array format, the current message is the last user entry, so the rest of
    // the array becomes the conversation context.
    const historySource = Array.isArray(history)
      ? history
      : messages.slice(0, -1).filter((m: any) => m?.role !== 'system');
    const sanitizedHistory = sanitizeHistory(historySource);

    // Reject messages that look like prompt injection / system override attempts.
    // History is fully client-controlled, so it must be scanned too — an attacker
    // can otherwise smuggle instructions in via history and bypass the check.
    const injected =
      isInjectionAttempt(message) ||
      sanitizedHistory.some((m) => m.role === 'user' && isInjectionAttempt(m.content));
    if (injected) {
      return NextResponse.json(
        { error: 'Invalid message', message: 'I can only help with questions about Skyal laser cutting services.', reply: 'I can only help with questions about Skyal laser cutting services.' },
        { status: 400 }
      );
    }

    // ── Rate limit check (per client IP) ──
    // Use the LAST x-forwarded-for entry: proxies append the client IP, so the
    // rightmost entry is the one closest to this server and the least
    // attacker-influenceable among the entries (on Vercel it is set by the
    // platform itself). Note: this limiter is a blunt per-instance instrument,
    // not a hard security boundary.
    const forwardedFor = req.headers.get('x-forwarded-for');
    const clientIp = (forwardedFor ? forwardedFor.split(',') : []).map((s) => s.trim()).filter(Boolean).pop() || 'unknown';
    if (!rateLimiter.acquire(clientIp)) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again later. Limit: ${RATE_LIMIT_MAX} per ${RATE_LIMIT_WINDOW / 1000} seconds.`,
          reply: 'Too many requests. Try again later.',
          rateLimit: true,
        },
        { status: 429 }
      );
    }

    const key = process.env.AGNES_API_KEY;
    if (!key) return NextResponse.json({ reply: 'AI not configured. Contact support.', error: 'AI not configured' }, { status: 500 });

    // Generate or reuse session ID for conversation continuity
    const sessionId =
      typeof incomingSessionId === 'string' && incomingSessionId.length <= 128
        ? incomingSessionId
        : generateSessionId();

    // Build Agnes messages (system prompt + sanitized history + current message)
    const agnesMsgs = [
      { role: 'system' as const, content: SKYAL_SYSTEM_PROMPT },
      ...sanitizedHistory,
      { role: 'user' as const, content: message },
    ];

    // ── Response cache ──
    const ck = cacheKey(agnesMsgs);
    const cached = cacheGet(ck);
    if (cached) {
      const q = extractQuote(cached);
      const reply = cleanAssistantText(cached);
      return NextResponse.json({ reply, assistant_text: reply, quote: q, render_order_now: !!q, sessionId, cached: true });
    }

    // ── Call Agnes 2.0 Flash with per-attempt timeout + retry/backoff ──
    // Each attempt gets its OWN AbortController + timeout: an aborted
    // controller stays aborted, so sharing one across retries would make
    // every retry after a timeout fail instantly (and the timeout must be
    // re-armed per attempt, not cleared after the first fetch).
    const fetchStartTime = performance.now();

    const callAgnes = async (remainingBudgetMs: number) => {
      // Shrink the per-attempt timeout to fit the remaining total budget so a
      // single attempt can't burn 30s past the 60s cap. Floor at 500ms: if the
      // budget is nearly gone, the pre-attempt check in retryWithBackoff
      // already stops us from starting.
      const attemptTimeout = Math.max(500, Math.min(FETCH_TIMEOUT, remainingBudgetMs));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), attemptTimeout);
      try {
        const response = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "agnes-2.0-flash", messages: agnesMsgs, temperature: 0.5, max_tokens: 4096 }),
          signal: controller.signal,
        });

        // ── Handle API errors ──
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          const status = response.status;

          // 401/403 and other 4xx are hard failures — never retried
          if (status === 401 || status === 403) {
            throw new Error(`Agnes API authentication error (${status}). Check AGNES_API_KEY.`);
          }
          if (RETRYABLE_STATUS.has(status)) {
            throw new HttpError(
              status,
              status === 429
                ? `Agnes API rate limit exceeded (429). Try again in a few seconds.`
                : `Agnes API server error (${status}). The model may be temporarily unavailable.`
            );
          }
          throw new Error(`Agnes API error: ${status} - ${errorText.substring(0, 200)}`);
        }

        return (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
      data = await retryWithBackoff(callAgnes, {
        maxRetries: MAX_RETRIES,
        baseDelay: RETRY_BASE_DELAY,
        budgetMs: TOTAL_BUDGET_MS,
        shouldRetry: isRetryableError,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new Error(`Agnes API request timed out after ${FETCH_TIMEOUT}ms`);
      }
      throw error;
    }

    const fetchLatency = Math.floor(performance.now() - fetchStartTime);

    // ── Parse response ──
    const rawAssistantText = data.choices?.[0]?.message?.content || '';
    const quote = extractQuote(rawAssistantText);
    const assistantText = cleanAssistantText(rawAssistantText);

    if (ck) cacheSet(ck, rawAssistantText);

    // ── Fire-and-forget: save session to admin backend for admin viewing ──
    const allMsgs = [
      ...sanitizedHistory,
      { role: 'user' as const, content: message },
      { role: 'assistant' as const, content: assistantText },
    ];
    saveToAdmin(sessionId, allMsgs).catch(() => {}); // Explicitly swallow — must not throw

    return NextResponse.json({
      reply: assistantText,
      assistant_text: assistantText,
      quote: quote || undefined,
      render_order_now: !!quote,
      sessionId,
      latency_ms: fetchLatency,
      error: undefined,
      brand: typeof brand === 'string' && brand.length <= 32 ? brand : 'skyal',
    });

  } catch (e: any) {
    // Timeout classification — keep AggregateError AbortError handling
    const isTimeout =
      (e instanceof Error && e.name === 'AbortError') ||
      (e instanceof AggregateError && e.errors.some((err: any) => err?.name === 'AbortError' || err?.name === 'TimeoutError')) ||
      (e instanceof Error && e.name === 'TimeoutError') ||
      (typeof e?.message === 'string' && e.message.includes('timed out'));

    if (isTimeout) {
      return NextResponse.json({ reply: "Taking longer than usual. Please try again.", error: true, message: "Taking longer than usual. Please try again." }, { status: 504 });
    }
    console.error('[Skyal Chat]', e?.message || e);
    return NextResponse.json({ reply: "Couldn't process that. Please try again, or call 0803 500 3068.", error: true, message: "Couldn't process that. Please try again, or call 0803 500 3068." }, { status: 500 });
  }
}
