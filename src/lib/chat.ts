/**
 * Skyal Chat — shared pure logic for the /api/chat route.
 *
 * Ported from the Paberin codebase (src/lib/chat.ts) with Skyal branding and
 * Skyal-specific types. Extracted from the route handler so the exact same
 * code that runs in production is what the unit tests exercise.
 *
 * Pricing design (spec): the AI NEVER prices. It extracts a structured
 * [SPECS] block; the route resolves it against the admin pricing engine and
 * shows the ENGINE's price. The model has no price tables.
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

/** Structured request extracted by the assistant — NEVER contains a price. */
export interface ChatSpecs {
  service_type: string | null;
  custom_description?: string;
  material?: string;
  quantity: number;
  sla?: 'Standard' | 'Express';
  delivery?: 'PICKUP' | 'LOCAL_DELIVERY';
  delivery_address?: string;
  needs_design_upload?: boolean;
}

/** Material availability surfaced by the admin pricing engine. */
export interface Availability {
  status: 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK';
  remaining: number;
  etaDays?: number;
}

/** Saved quote snapshot (mirror of the admin GET /api/quotes?phone= row). */
export interface SavedQuote {
  id: string;
  quoteNumber: string;
  totalAmount: number;
  discount?: number;
  deliveryFee?: number;
  serviceType?: string | null;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
  requestJson?: string;
}

export interface ChatResponse {
  assistant_text: string;
  latency_ms?: number;
  quote?: ChatQuote;
  render_order_now?: boolean;
  /** Engine-extracted specs when no catalog match — UI offers a custom order. */
  custom?: {
    description: string;
    material?: string;
    quantity: number;
    sla?: string;
  };
  /** Saved quote snapshots for this phone (shown as a banner). */
  openQuotes?: SavedQuote[];
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

/* ───────────────────────────── Specs parsing ───────────────────────────── */

const SPECS_REGEX = /\[SPECS\]\s*([\s\S]*?)\s*\[\/SPECS\]/i;

/**
 * Normalize loosely-formatted model JSON so strict JSON.parse can handle the
 * common LLM deviations beyond trailing commas:
 *   - single-quoted strings          ('service_type': 'fabric_buba')
 *   - unquoted object keys           (service_type: ...)
 *   - unquoted bare-word values      (service_type: fabric_buba)
 *
 * Single left-to-right scan, string-aware (never rewrites text inside quoted
 * strings), and safe by construction — it cannot throw.
 */
function normalizeLooseJson(text: string): string {
  const out: string[] = [];
  const n = text.length;
  let i = 0;

  const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const isIdentStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
  const isIdentChar = (c: string) => isIdentStart(c) || (c >= '0' && c <= '9');
  // JSON literals must stay unquoted — quoting them would turn true/false/null
  // into strings and corrupt booleans like "needs_design_upload": true.
  const isLiteral = (word: string) => word === 'true' || word === 'false' || word === 'null' || word === 'undefined';

  while (i < n) {
    const ch = text[i];

    // 1) Strings: double-quoted pass through; single-quoted become double-quoted.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out.push('"');
      i++;
      while (i < n) {
        const c = text[i];
        if (c === '\\' && i + 1 < n) {
          const next = text[i + 1];
          // \' is not a valid JSON escape once we switch to double quotes.
          out.push(quote === "'" && next === "'" ? "'" : c + next);
          i += 2;
          continue;
        }
        if (c === quote) {
          i++;
          break;
        }
        // An inner double quote inside a single-quoted string must be escaped.
        out.push(quote === "'" && c === '"' ? '\\"' : c);
        i++;
      }
      out.push('"'); // unterminated string — close it defensively
      continue;
    }

    // 2) `{` or `,`: may start an unquoted key; `,` may be a trailing comma.
    if (ch === '{' || ch === ',') {
      if (ch === ',') {
        // Trailing comma: `,` followed only by whitespace then `}`/`]` is dropped.
        let j = i + 1;
        while (j < n && isWs(text[j])) j++;
        if (j < n && (text[j] === '}' || text[j] === ']')) {
          i++;
          continue;
        }
      }
      out.push(ch);
      i++;
      let j = i;
      while (j < n && isWs(text[j])) j++;
      if (j < n && isIdentStart(text[j])) {
        let k = j;
        while (k < n && isIdentChar(text[k])) k++;
        let l = k;
        while (l < n && isWs(text[l])) l++;
        if (l < n && text[l] === ':') {
          out.push(text.slice(i, j), '"', text.slice(j, k), '"');
          i = k;
        }
      }
      continue;
    }

    // 3) `:`: may be followed by an unquoted bare-word value (identifiers /
    //    plain words, including multi-word phrases like `restore my box`).
    //    JSON literals (true/false/null) stay unquoted.
    if (ch === ':') {
      out.push(ch);
      i++;
      let j = i;
      while (j < n && isWs(text[j])) j++;
      if (j < n && isIdentStart(text[j])) {
        let k = j;
        while (k < n && isIdentChar(text[k])) k++;
        // Keep consuming whitespace-separated words until a structural
        // character ({ } [ ] , : " ') — the model often emits phrases.
        while (k < n && isWs(text[k]) && k + 1 < n && isIdentStart(text[k + 1])) {
          k++;
          while (k < n && isIdentChar(text[k])) k++;
        }
        let l = k;
        while (l < n && isWs(text[l])) l++;
        if (l < n && (text[l] === ',' || text[l] === '}') && !isLiteral(text.slice(j, k))) {
          out.push(text.slice(i, j), '"', text.slice(j, k), '"');
          i = k;
        }
      }
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join('');
}

/**
 * Lenient JSON parse for model output: strips markdown code fences
 * (```json ... ```), extracts the first {...} object, and tolerates the
 * common LLM deviations from strict JSON — trailing commas, unquoted object
 * keys, unquoted bare-word string values, and single-quoted strings.
 * Never throws: anything unparseable returns undefined.
 */
export function parseLenientJson(raw: string): Record<string, unknown> | undefined {
  if (typeof raw !== 'string') return undefined;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  text = normalizeLooseJson(text.slice(start, end + 1));
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Coerce a model-provided value to a positive integer (defaults to 1). */
function toQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/[,₦\s]/g, ''));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return 1;
}

/**
 * Parse the structured [SPECS] block from the assistant text.
 * The model extracts WHAT the customer wants; the pricing engine decides
 * WHAT IT COSTS. Returns undefined when no valid [SPECS] block is present.
 */
export function parseSpecsBlock(text: string): ChatSpecs | undefined {
  const match = text.match(SPECS_REGEX);
  if (!match) return undefined;

  const q = parseLenientJson(match[1]);
  if (!q) return undefined;

  const serviceType =
    typeof q.service_type === 'string' && q.service_type.trim()
      ? q.service_type.trim().toLowerCase()
      : null;

  const deliveryRaw = typeof q.delivery === 'string' ? q.delivery.trim().toUpperCase() : '';
  const delivery = deliveryRaw === 'LOCAL_DELIVERY' || deliveryRaw === 'PICKUP' ? (deliveryRaw as ChatSpecs['delivery']) : undefined;
  const slaRaw = typeof q.sla === 'string' ? q.sla.trim().toLowerCase() : '';
  const sla = slaRaw === 'express' ? ('Express' as const) : slaRaw === 'standard' ? ('Standard' as const) : undefined;

  return {
    service_type: serviceType,
    custom_description: typeof q.custom_description === 'string' ? q.custom_description.trim().slice(0, 1000) : undefined,
    material: typeof q.material === 'string' ? q.material.trim().slice(0, 200) : undefined,
    quantity: toQuantity(q.quantity),
    sla,
    delivery,
    delivery_address: typeof q.delivery_address === 'string' ? q.delivery_address.trim().slice(0, 500) : undefined,
    needs_design_upload: q.needs_design_upload === true,
  };
}

/**
 * Strip [SPECS] blocks (and any markdown-fenced JSON leftovers) from the
 * assistant text for clean display.
 */
export function cleanAssistantText(text: string): string {
  return text
    .replace(/\[SPECS\][\s\S]*?\[\/SPECS\]/gi, '')
    .replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, '')
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

/* ───────────────────────────── System prompt ───────────────────────────── */

/**
 * The full system prompt for the assistant. Kept here (not in the route) so
 * tests can assert the prompt contract directly and the dataset generator
 * can load it live from src/lib/chat.ts.
 *
 * PRICING CONTRACT: the model never states a price and never receives a price
 * list. It extracts [SPECS]; the route computes the exact price with the
 * admin pricing engine and appends it to the reply.
 */
export const SKYAL_SYSTEM_PROMPT = `You are Skyal's AI Assistant — the friendly, knowledgeable voice of Skyal Laser Services, a precision laser cutting business in Ogba, Ikeja, Lagos, Nigeria.

# YOUR IDENTITY
- You represent Skyal Laser Services (sister brand to Paberin Creations)
- You help customers with laser cutting, engraving, sheet cutting, metal cutting, and cake toppers
- Your tone: warm, professional, Nigerian-friendly. Use "ma" / "sir" respectfully.
- Be honest about limitations. When you can't do something, explain why.

# WHAT YOU DO
You turn a customer's request into a structured order. You NEVER quote prices —
the system computes the exact price and shows it to the customer automatically.

# WHAT WE DO (categories)
- FABRIC LASER CUTTING — customer brings the fabric (aso-ebi, buba, wrapper, skirt, gown, sleeves, boubou, jeans, ankara, lace, per-yard, custom sections)
- ENGRAVING — customer brings the item (phone backs, jewelry, leather, wood items, necklaces, badges, small items, curved surfaces, in-house metal engraving)
- SHEET CUTTING — acrylic / wood / mirror (in-house 900×600mm bed; 8ft×4ft sheets via external partner, 10 working days, no express)
- METAL CUTTING — always via external partner, 10 working days, no express
- CAKE TOPPERS — acrylic, custom (5–7 days)
- ACRYLIC STICKS — sticks/straws for toppers, signage, floral
- ADD-ONS — stoning board

# KEY RULES
- Express = faster turnaround with a surcharge. NOT available for: engraving, complex custom gowns, external-partner sheet/metal work. Minimum 48 hours.
- Lead time counts from PAYMENT confirmation, not from order placement.
- Full payment before production starts. No deposit/balance system.
- NO VAT on any service.
- LANGUAGE: Always respond in the customer's language — Nigerian English or Pidgin English — never in any other language. Even when conversation context is lost or unclear, keep responding in Nigerian English/Pidgin — never switch to another language (never Chinese, never any other language).
- Machine bed: 900mm × 600mm in-house. Larger items → external partner.

# DELIVERY
- FREE pickup from Ogba, Ikeja, Lagos
- Local Lagos delivery (fee applies)
- Nationwide waybill (fee applies)

# WHAT YOU SHOULD DO
1. Understand what the customer wants (garment, engraving, sheet, topper, sticks, metal).
2. Extract the exact spec: the item/garment, the MATERIAL, the QUANTITY, SLA preference (Standard/Express) if they mention a rush, and the DELIVERY method (pickup or local delivery + address).
3. If details are missing, ask clarifying questions — do NOT guess material, quantity, or delivery.
4. When the spec is complete, END your response with a [SPECS] block (see below).
5. If the job clearly matches a catalog category (fabric garment, engraving item, topper, sheet, sticks, metal), set "service_type" to the closest catalog type key. Use the type keys EXACTLY as listed:
   - Fabric: fabric_sleeves, fabric_buba, fabric_buba_layer, fabric_wrapper, fabric_skirt, fabric_blouse_skirt, fabric_buba_wrapper, fabric_boubou, fabric_sleeves_wrapper, fabric_sleeves_buba, fabric_per_yard, fabric_custom (custom fabric job), fabric_complex_gown
   - Engraving: engraving_phone, engraving_jewelry, engraving_leather, engraving_wood, engraving_small_item, engraving_curved, engraving_detective_badge, engraving_necklace, metal_engraving_inhouse
   - Sheets: sheet_cutting_inhouse, sheet_cutting_oversize, sheet_cutting_8x4, sheet_cutting_custom
   - Sticks: acrylic_stick_cutting
   - Metal cutting: metal_cutting_external
   - Toppers: skyal_topper_acrylic, skyal_topper_custom
   - Add-on: stoning_board
6. If the job does NOT clearly match any of those types (e.g. "cut my jeans into a pattern" — that's custom fabric work, so fabric_custom), set "service_type" to null and describe it in "custom_description" instead. Never force a wrong type.
7. If the customer asks for a price, answer: "Let me confirm the exact price for you" and emit the [SPECS] block — the system shows the exact price.

# HANDLING AMBIGUOUS / VAGUE QUERIES
- **"I need something for my wedding/event"** → Ask: What type of item? Fabric cutting for aso-ebi? Cake topper? Signage? Then narrow down.
- **"How much for cutting?"** → Ask: What material? Fabric, leather, wood, or acrylic? What garment/item? How many?
- **"What can you do for me?"** → List the categories briefly and ask which interests them.
- **"Price?" / "How much?"** → Ask what they want; then extract specs and let the system show the exact price.
- **Pidgin / mixed language** → Understand and respond naturally. Be conversational but professional.
- **"Is it cheaper than [competitor]?"** → Don't compare prices. Say: "I'll confirm our exact price for your job." then extract specs.
- **"Last price?" / "Can you do better?"** → Prices are fixed and computed automatically; you cannot discount.
- **Multiple items at once** → Ask which item to quote first, or extract the primary one.
- **Just "Ok" / "Yes" / "Proceed"** → If specs were just extracted, confirm and guide them to place the order. If no specs yet, ask what they're confirming.
- **Off-topic / unrelated** → Politely redirect to laser cutting/engraving services.

# NIGERIAN CONTEXT
- Understand local terms: aso-ebi, buba, wrapper, iro, gele, boubou, agbada
- Understand pidgin: "abeg", "how far", "e go cost", "na how much", "shey you fit"
- Understand local measurements: inches, feet, yards (not cm/metres for fabric)
- Understand local events: weddings, owambe, burials, birthdays, naming ceremonies

# RESPONSE FORMAT
Always respond conversationally first, then if you've extracted the full spec, add this EXACT block at the END:

[SPECS]
{
  "service_type": "<catalog type key> or null",
  "custom_description": "<the customer's job in their own words, only when service_type is null>",
  "material": "<material if known>",
  "quantity": <number>,
  "sla": "Standard" or "Express" (omit if not discussed),
  "delivery": "PICKUP" or "LOCAL_DELIVERY" (omit if not discussed),
  "delivery_address": "<address, only when delivery is LOCAL_DELIVERY>",
  "needs_design_upload": true or false
}
[/SPECS]

IMPORTANT: the [SPECS] JSON must be plain text — NEVER wrap it in markdown code fences (triple backticks), NEVER add trailing commas, and NEVER include any price or amount anywhere in the block.

If the spec is NOT complete yet (missing info), NEVER output a [SPECS] block — instead ask clarifying questions.`;
