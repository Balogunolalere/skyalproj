import { NextRequest, NextResponse } from "next/server";
import {
  RateLimiter,
  retryWithBackoff,
  parseEnvInt,
  generateSessionId,
  parseSpecsBlock,
  cleanAssistantText,
  sanitizeHistory,
  isInjectionAttempt,
  SKYAL_SYSTEM_PROMPT,
  type ChatSpecs,
  type ChatResponse,
} from "@/lib/chat";

export const runtime = "nodejs";
// Vercel function duration — required so slow Agnes calls (20-45s) aren't
// killed as 504s. Hobby caps at 60s; on Pro you can raise to 300 and bump
// TOTAL_TIMEOUT.
export const maxDuration = 60;

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
async function saveToAdmin(sessionId: string, messages: Array<{ role: string; content: string }>, customerPhone?: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${ADMIN_API_URL}/api/skyal/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messages[messages.length - 1]?.content || '', brand: "skyal", mode: "live", history: messages.slice(0, -1), sessionId, persist_only: true, customerPhone }),
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
// ENGINE PRICING (spec: the AI never prices)
// ════════════════════════════════════════════════════════════════

/**
 * Ask the admin pricing engine for the exact price of an extracted spec.
 * Same endpoint the order form uses — one number everywhere.
 */
async function callAdminQuote(specs: ChatSpecs, customerPhone?: string): Promise<{ quote: NonNullable<ChatResponse['quote']>; availability: unknown }> {
  const payload = {
    brand: 'SKYAL',
    serviceType: specs.service_type,
    quantity: specs.quantity,
    sla: specs.sla || 'Standard',
    deliveryMethod: specs.delivery,
    deliveryAddress: specs.delivery === 'LOCAL_DELIVERY' ? specs.delivery_address : undefined,
    ...(customerPhone ? { customerPhone } : {}),
  };
  const res = await retryWithBackoff(
    async (remaining) => {
      // Each attempt gets a FRESH AbortController — an aborted controller
      // stays aborted and would poison every subsequent attempt.
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        Math.max(500, Math.min(15000, remaining))
      );
      try {
        return await fetch(`${ADMIN_API_URL}/api/services/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
          cache: "no-store",
        });
      } finally {
        clearTimeout(timeoutId);
      }
    },
    { maxRetries: 2, baseDelay: 500, budgetMs: 20000, shouldRetry: isRetryableError }
  );

  if (!res.ok) {
    throw new Error(`Pricing engine error (${res.status})`);
  }
  const json = await res.json().catch(() => null);
  const data = json?.data;
  if (!data || typeof data.quoteNaira !== 'number') {
    throw new Error('Pricing engine returned no quote');
  }
  const breakdown = data.breakdown || {};
  const quote: NonNullable<ChatResponse['quote']> = {
    price: data.quoteNaira,
    breakdown,
    summary: `${breakdown.serviceLabel || specs.service_type}: ${data.quoteNaira.toLocaleString('en-NG')} naira${breakdown.leadTime ? ` · ${breakdown.leadTime}` : ''}`,
  };
  return { quote, availability: data.availability ?? null };
}

/** Human-readable one-liner appended to the assistant text (ENGINE price). */
function priceLine(quote: NonNullable<ChatResponse['quote']>): string {
  const b = quote.breakdown || {};
  const parts: string[] = [`₦${quote.price.toLocaleString('en-NG')}`];
  if (b.quantity && b.serviceLabel) parts.unshift(`${b.quantity} × ${b.serviceLabel}`);
  if (b.deliveryFee) parts.push(`delivery ₦${(b.deliveryFee as number).toLocaleString('en-NG')}`);
  if (b.discount) parts.push(`discount −₦${(b.discount as number).toLocaleString('en-NG')}`);
  if (b.leadTime) parts.push(b.leadTime as string);
  return `\n\n💰 Your price: ${parts.join(' · ')}. Review and pay to confirm your order.`;
}

/** Best-effort: open saved quote snapshots for the phone (first turn only).
 *  The phone is validated defensively (the admin enforces 7–15 digits) and
 *  rows are mapped to a minimal safe shape — `requestJson` (which can embed
 *  customer PII) is never passed through to the client. */
async function fetchOpenQuotes(customerPhone: string): Promise<ChatResponse['openQuotes']> {
  const digits = customerPhone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return undefined;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${ADMIN_API_URL}/api/quotes?phone=${encodeURIComponent(customerPhone)}`, {
      signal: controller.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) return undefined;
    const json = await res.json().catch(() => null);
    if (!Array.isArray(json?.data)) return undefined;
    return json.data.map((q: any) => ({
      id: q?.id,
      quoteNumber: q?.quoteNumber,
      totalAmount: q?.totalAmount,
      discount: q?.discount,
      deliveryFee: q?.deliveryFee,
      serviceType: q?.serviceType,
      status: q?.status,
      expiresAt: q?.expiresAt,
      createdAt: q?.createdAt,
    }));
  } catch {
    return undefined;
  }
}

/**
 * Resolve the assistant's raw text into the response extras: engine quote for
 * catalog jobs, custom handoff for bespoke jobs, open saved quotes on the
 * first turn. Shared by the fresh path and the cached path.
 */
async function resolveExtras(
  rawAssistantText: string,
  customerPhone: string | undefined,
  isFirstTurn: boolean
): Promise<{ assistantText: string; quote: ChatResponse['quote']; custom: ChatResponse['custom']; openQuotes: ChatResponse['openQuotes']; renderOrderNow: boolean }> {
  const specs = parseSpecsBlock(rawAssistantText);
  const baseText = cleanAssistantText(rawAssistantText);

  let assistantText = baseText;
  let quote: ChatResponse['quote'] | undefined;
  let custom: ChatResponse['custom'] | undefined;

  if (specs?.service_type) {
    // Tier 1 — catalog job: the ENGINE sets the price, never the model.
    try {
      const engine = await callAdminQuote(specs, customerPhone);
      quote = engine.quote;
      assistantText = `${baseText}${priceLine(engine.quote)}`;
    } catch (err: any) {
      console.warn('[Skyal Chat] Engine quote failed:', err?.message);
      assistantText = `${baseText}\n\nI couldn't confirm the exact price just now — please try again, or place your order and we'll confirm pricing.`;
    }
  } else if (specs?.custom_description) {
    // Tier 2 — custom job: hand off to the provisional-order flow.
    custom = {
      description: specs.custom_description,
      material: specs.material,
      quantity: specs.quantity,
      sla: specs.sla,
    };
    assistantText = `${baseText}\n\nI've noted your custom job. Tap "Place custom order" to send it to our team — we'll confirm the price right away.`;
  }

  let openQuotes: ChatResponse['openQuotes'];
  if (isFirstTurn && typeof customerPhone === 'string' && customerPhone.trim()) {
    openQuotes = await fetchOpenQuotes(customerPhone.trim());
  }

  return { assistantText, quote, custom, openQuotes, renderOrderNow: quote !== undefined };
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
      customerPhone,
    } = body as Record<string, unknown>;

    // ── Normalize the two input formats into (message, contextTurns) ──
    // The current user turn: an explicit `message` wins; otherwise the last
    // user entry in the `messages` array is treated as the current turn.
    const providedMessages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : [];
    const providedHistory = Array.isArray(history) ? (history as Array<Record<string, unknown>>) : [];
    let message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    let currentUserIdx = -1;
    if (!message) {
      for (let idx = providedMessages.length - 1; idx >= 0; idx--) {
        const m = providedMessages[idx] as any;
        if (m?.role === 'user' && typeof m?.content === 'string' && m.content.trim()) {
          message = m.content.trim();
          currentUserIdx = idx;
          break;
        }
      }
    }

    // Conversation context: explicit `history` is canonical; otherwise every
    // `messages` entry before the current user turn becomes the context.
    // Follow-up messages ALWAYS thread the prior user+assistant turns here —
    // sessionId is only echoed for the admin save, never used to reconstruct
    // conversation context.
    let contextTurns: unknown[] = [];
    if (providedHistory.length > 0) {
      contextTurns = providedHistory;
    } else if (providedMessages.length > 0) {
      contextTurns = currentUserIdx >= 0 ? providedMessages.slice(0, currentUserIdx) : providedMessages;
    }

    // Clients sometimes append the current message to the context by mistake
    // — drop a trailing user turn that duplicates it so the turn is not sent
    // to the model twice.
    if (message && contextTurns.length > 0) {
      const last = contextTurns[contextTurns.length - 1] as any;
      if (last?.role === 'user' && typeof last.content === 'string' && last.content.trim() === message) {
        contextTurns = contextTurns.slice(0, -1);
      }
    }

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

    // Sanitize the threaded context: max 50 turns, only user/assistant,
    // strip empty/long content. Follow-up messages always carry the prior
    // user+assistant turns — never rely on sessionId alone for context.
    const sanitizedHistory = sanitizeHistory(contextTurns);

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
      const custPhoneVal =
        typeof customerPhone === 'string' && customerPhone.replace(/\D/g, '').length >= 7
          ? customerPhone
          : undefined;
      const extras = await resolveExtras(cached, custPhoneVal, sanitizedHistory.length === 0);
      return NextResponse.json({
        reply: extras.assistantText,
        assistant_text: extras.assistantText,
        quote: extras.quote,
        custom: extras.custom,
        openQuotes: extras.openQuotes,
        render_order_now: extras.renderOrderNow,
        sessionId,
        cached: true,
        error: undefined,
      });
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

    if (ck && rawAssistantText) cacheSet(ck, rawAssistantText);

    const customerPhoneVal = (() => {
      if (typeof customerPhone !== 'string') return undefined;
      const digits = customerPhone.replace(/\D/g, '');
      // Defensive: only phones that look real (7–15 digits) may be sent to
      // the admin engine / quotes endpoints — never arbitrary strings.
      return digits.length >= 7 && digits.length <= 15 ? customerPhone : undefined;
    })();
    const extras = await resolveExtras(rawAssistantText, customerPhoneVal, sanitizedHistory.length === 0);

    // ── Fire-and-forget: save session to admin backend for admin viewing ──
    const allMsgs = [
      ...sanitizedHistory,
      { role: 'user' as const, content: message },
      { role: 'assistant' as const, content: extras.assistantText },
    ];
    saveToAdmin(sessionId, allMsgs, customerPhoneVal).catch(() => {}); // Explicitly swallow — must not throw

    return NextResponse.json({
      reply: extras.assistantText,
      assistant_text: extras.assistantText,
      quote: extras.quote,
      custom: extras.custom,
      openQuotes: extras.openQuotes,
      render_order_now: extras.renderOrderNow,
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
