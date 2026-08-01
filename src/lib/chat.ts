/**
 * Skyal Chat — shared pure logic for the /api/chat route.
 *
 * Ported from the Paberin codebase (src/lib/chat.ts) with Skyal branding and
 * Skyal-specific types. Extracted from the route handler so the exact same
 * code that runs in production is what the unit tests exercise.
 */

/* ───────────────────────────── Types ───────────────────────────── */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface QuoteBreakdown {
  serviceLabel?: string;
  serviceType?: string;
  sla?: string;
  leadTime?: string;
  notes?: string;
  basePrice?: number;
  expressSurcharge?: number;
  addOnsTotal?: number;
  discount?: number;
  deliveryFee?: number;
  finalPriceNaira?: number;
  quantity?: number;
  [k: string]: unknown;
}

export interface ChatQuote {
  price: number;
  original_price?: number;
  bulk_discount?: number;
  breakdown?: QuoteBreakdown;
  summary?: string;
}

export interface ChatResponse {
  assistant_text: string;
  latency_ms?: number;
  quote?: ChatQuote;
  render_order_now?: boolean;
  sessionId?: string;
  error?: string;
}

/* ───────────────────────────── Env helpers ───────────────────────────── */

/**
 * Parse a positive-integer env var with a validated fallback.
 * Garbage values (NaN, <= 0, empty) fall back to `fallback` instead of
 * silently producing `NaN` timeouts/delays at runtime.
 */
export function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    console.warn(`[Skyal Chat] Invalid ${name}="${raw}" — using default ${fallback}`);
    return fallback;
  }
  const n = Number.parseInt(trimmed, 10);
  if (n <= 0) {
    console.warn(`[Skyal Chat] Invalid ${name}="${raw}" — using default ${fallback}`);
    return fallback;
  }
  return n;
}

/* ───────────────────────────── Rate limiter ───────────────────────────── */

/**
 * In-memory fixed-window rate limiter, keyed per client so one abusive IP
 * can't exhaust the shared quota. Note the fixed-window caveat: a burst
 * straddling a window boundary can pass up to 2×max. For multi-instance
 * deployments (Vercel edge, multiple isolates) replace with a Redis-based
 * limiter — this is a blunt instrument, not a hard security boundary.
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max = 100,
    private readonly windowMs = 60_000
  ) {}

  acquire(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= this.max) return false;
    bucket.count++;
    // Opportunistically prune expired buckets so the map can't grow unbounded.
    if (this.buckets.size > 1000) {
      this.buckets.forEach((bucket, key) => {
        if (now >= bucket.resetAt) this.buckets.delete(key);
      });
    }
    return true;
  }

  /** Reset one key (or everything when no key given) — used by tests. */
  reset(key?: string): void {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }
}

/* ───────────────────────────── Retry helper ───────────────────────────── */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  /** Hard cap on total wall-clock time across all attempts. */
  budgetMs?: number;
  /** Return false to abort retrying for a given error. */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Retry an async operation with exponential backoff + jitter.
 *
 * Hard cap on total wall-clock time (budgetMs):
 *  - no attempt is started once the budget is exhausted, and
 *  - `fn` receives the remaining budget so callers can shrink per-attempt
 *    timeouts (e.g. an LLM fetch) — without this, a single attempt could
 *    burn the full per-attempt timeout past the budget.
 *
 * The caller is responsible for creating a FRESH abort controller per
 * attempt (see the route handler) — a controller aborted by a timeout stays
 * aborted and would poison every subsequent attempt.
 */
export async function retryWithBackoff<T>(
  fn: (remainingBudgetMs: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, budgetMs = 60_000, shouldRetry } = options;
  const start = Date.now();
  let lastError: unknown = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const elapsed = Date.now() - start;
    if (elapsed >= budgetMs) throw lastError;

    try {
      return await fn(budgetMs - elapsed);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      if (shouldRetry && !shouldRetry(error)) throw error;

      const elapsedAfter = Date.now() - start;
      if (elapsedAfter >= budgetMs) throw error;

      // 1s → 2s → 4s + jitter, never overshooting the remaining budget
      const jittered = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      const delay = Math.min(jittered, budgetMs - elapsedAfter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/* ───────────────────────────── Session IDs ───────────────────────────── */

/**
 * Generate a session ID for conversation tracking.
 * Uses crypto.randomUUID (cryptographically random) instead of Math.random.
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `skyal_${timestamp}_${random}`;
}

/* ───────────────────────────── Quote parsing ───────────────────────────── */

const QUOTE_REGEX = /\[QUOTE\]\s*([\s\S]*?)\s*\[\/QUOTE\]/;

/** Coerce a model-provided value to a finite number (accepts "35,000", "₦35000"). */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/[,₦\s]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Lenient JSON parse for model output: strips markdown code fences
 * (```json ... ```), extracts the first {...} object, and removes trailing
 * commas — the two most common ways LLM JSON output fails strict JSON.parse.
 */
function parseLenientJson(raw: string): Record<string, unknown> | undefined {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  text = text.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse the structured [QUOTE] block from the assistant text.
 * PRIMARY extraction method — deterministic JSON parsing.
 *
 * The model's arithmetic is cross-checked: when unit_price × quantity and the
 * surcharge components are present and disagree with `total` by more than 10%,
 * the total is recomputed from the components (guards against hallucinated
 * totals). One exception: when `total` ≈ subtotal and the only difference vs
 * the recomputed value is the express/add-on surcharges, the model is treated
 * as having already folded them into the unit price, and `total` is trusted.
 */
export function parseQuoteBlock(text: string): ChatQuote | undefined {
  const match = text.match(QUOTE_REGEX);
  if (!match) return undefined;

  const q = parseLenientJson(match[1]);
  if (!q) return undefined;

  const total = toNumber(q.total);
  if (total === undefined || total <= 0) return undefined;

  const quantity = toNumber(q.quantity) ?? 1;
  const unitPrice = toNumber(q.unit_price);
  const expressSurcharge = toNumber(q.express_surcharge) ?? 0;
  const addOnsTotal = toNumber(q.add_ons_total) ?? 0;
  const deliveryFee = toNumber(q.delivery_fee) ?? 0;
  const discount = toNumber(q.discount) ?? 0;

  const subtotal = unitPrice !== undefined ? unitPrice * quantity : undefined;
  const computedTotal =
    subtotal !== undefined ? subtotal + expressSurcharge + addOnsTotal + deliveryFee - discount : undefined;

  let finalPrice = total;
  if (computedTotal !== undefined && computedTotal > 0) {
    const relativeDiff = Math.abs(computedTotal - total) / Math.max(computedTotal, total);
    // Exception: the model sometimes quotes unit_price ALREADY including the
    // express surcharge and still lists express_surcharge separately — in that
    // case total ≈ subtotal while computedTotal = subtotal + surcharges. Trust
    // the total then, instead of double-counting the surcharge.
    // (If the model instead FORGOT the surcharge, subtotal and total diverge
    // by the surcharge amount and the recompute below correctly kicks in.)
    const expressAlreadyInUnit =
      subtotal !== undefined &&
      Math.abs(subtotal - total) <= Math.max(1, subtotal * 0.02) &&
      Math.abs(computedTotal - total - expressSurcharge - addOnsTotal) <= Math.max(1, subtotal * 0.02);
    if (relativeDiff > 0.1 && !expressAlreadyInUnit) {
      finalPrice = computedTotal;
    }
  }
  finalPrice = Math.max(0, Math.round(finalPrice));
  if (finalPrice <= 0) return undefined;

  return {
    price: finalPrice,
    original_price: toNumber(q.original_price),
    bulk_discount: toNumber(q.bulk_discount),
    breakdown: {
      serviceLabel: typeof q.service_label === 'string' ? q.service_label : undefined,
      serviceType: typeof q.service_type === 'string' ? q.service_type : undefined,
      sla: typeof q.sla === 'string' ? q.sla : undefined,
      leadTime: typeof q.lead_time === 'string' ? q.lead_time : undefined,
      notes: typeof q.notes === 'string' ? q.notes : undefined,
      basePrice: unitPrice,
      expressSurcharge,
      addOnsTotal,
      discount,
      deliveryFee,
      finalPriceNaira: finalPrice,
      quantity,
    },
    summary: `${q.service_label || 'Service'}: ${quantity}× ₦${(unitPrice ?? finalPrice).toLocaleString('en-NG')} = ₦${finalPrice.toLocaleString('en-NG')}. ${q.lead_time || ''}`.trim(),
  };
}

/**
 * FALLBACK: extract a price from free text, used only when no valid
 * [QUOTE] block is present.
 *
 * Requires explicit naira context — a ₦/NGN/N prefix or a "naira"/"NGN"
 * suffix — so phone numbers, dates, and stray digits are never misread as
 * prices ("0803 500 3068" must never become ₦3,068).
 */
export function extractPriceFromText(text: string): ChatQuote | undefined {
  const prices = new Set<number>();

  const collect = (regex: RegExp, valueGroup: number, thousandGroup?: number) => {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const raw = m[valueGroup];
      if (raw) {
        const n = parseFloat(raw.replace(/,/g, ''));
        if (Number.isFinite(n) && n > 0) prices.add(thousandGroup && m[thousandGroup] ? n * 1000 : n);
      }
      if (m.index === regex.lastIndex) regex.lastIndex++;
    }
  };

  // Prefix form: ₦15,000 / N15,000 / NGN 15,000 / ₦20K
  // NOTE: no case-insensitive flag — a lowercase "n" prefix ("n15000") is
  // not naira notation and would cause false positives.
  collect(/(?<![A-Za-z0-9₦])(?:₦|NGN|N)\s*(\d[\d,]*(?:\.\d+)?)\s*([kK])?/g, 1, 2);
  // Suffix form: 15,000 naira / 15000naira / 20K naira
  collect(/(\d[\d,]*(?:\.\d+)?)\s*([kK])?\s*(?:naira|NGN)\b/gi, 1, 2);

  if (prices.size === 0) return undefined;

  let bestPrice = 0;
  prices.forEach((price) => {
    if (price > bestPrice) bestPrice = price;
  });
  return {
    price: bestPrice,
    original_price: undefined,
    bulk_discount: undefined,
    breakdown: undefined,
    summary: `Estimated price: ₦${bestPrice.toLocaleString('en-NG')}`,
  };
}

/** Full extraction pipeline: structured [QUOTE] first, regex fallback. */
export function extractQuote(text: string): ChatQuote | undefined {
  return parseQuoteBlock(text) ?? extractPriceFromText(text);
}

/**
 * Strip [QUOTE] blocks (and any markdown-fenced JSON leftovers) from the
 * assistant text for clean display.
 */
export function cleanAssistantText(text: string): string {
  return text
    .replace(/\[QUOTE\][\s\S]*?\[\/QUOTE\]/g, '')
    .replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, '')
    .trim();
}

/* ───────────────────────────── Input sanitization ───────────────────────────── */

const HARD_INJECTION_PATTERNS = [
  /^system:\s*/im,
  /^\[system\]\s*/im,
  /ignore (all |your )?(previous |prior )?instructions/i,
  /override your /i,
];

// Conversational phrases that are also attack-shaped — only flagged for
// short messages to avoid blocking genuine long customer messages like
// "please forget everything I said earlier about wood".
const SOFT_INJECTION_PATTERNS = [/you are now /i, /forget everything/i];

/**
 * Heuristic prompt-injection detector.
 *
 * Hard patterns ("system:", "ignore … instructions", "override your …") are
 * flagged regardless of length — padding a message past 200 chars must not
 * bypass the check. Soft conversational patterns are only flagged for short
 * messages to avoid false positives on genuine long ones.
 *
 * This is defense-in-depth, not a security boundary: the system prompt is the
 * real defense. Applied to BOTH the current message and the client-supplied
 * history (which is fully attacker-controlled).
 */
export function isInjectionAttempt(text: unknown): boolean {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (HARD_INJECTION_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return text.length < 200 && SOFT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitize client-supplied conversation history: keep only user/assistant
 * messages with non-empty content, cap the turn count and per-message length.
 */
export function sanitizeHistory(history: unknown, maxTurns = 50, maxLen = 4000): ChatMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m: any) =>
        m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .slice(-maxTurns)
    .map((m: any) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content.trim().slice(0, maxLen),
    }));
}
