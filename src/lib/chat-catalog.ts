/**
 * Live catalog grounding for the Skyal chat assistant.
 *
 * WHY THIS EXISTS
 * The system prompt used to carry a hardcoded roster of service type keys and a
 * hardcoded list of who-we-are materials. Both are editable at runtime through
 * the admin Services page, so the prompt was a CACHE OF THE DATABASE THAT
 * NOTHING INVALIDATED. It drifts silently, and the assistant then denies
 * services the business actually sells.
 *
 * The catalog API is the single source of truth. This module fetches it and
 * renders a compact digest that is injected as a SECOND system message, so the
 * model's knowledge of what we sell can never be older than the TTL below.
 *
 * The digest deliberately carries NO prices: the pricing engine owns money
 * (discounts, express tiers, delivery, promotions). See `buildCatalogDigest`.
 */

/** The subset of GET /api/services this module needs — declared locally so the
 *  chat pipeline doesn't depend on a view component's private interface. */
export interface CatalogService {
  type: string;
  label: string;
  description?: string;
  category?: string;
  unit?: string;
  standardLeadTime?: string;
  allowExpress?: boolean;
  customerSupplied?: boolean;
  /** Legacy flat dropdown choices. */
  options?: string[];
  /** Django-style structured fields; the digest renders these as `fields:`. */
  optionFields?: Array<{
    key?: string;
    label?: string;
    type?: string;
    required?: boolean;
    choices?: unknown[];
  }> | null;
}

/** How long a fetched catalog is reused before re-reading the source of truth. */
export const CATALOG_TTL_MS = 60_000;

/**
 * Upper bound on the injected digest.
 *
 * Sized from the REAL catalog rather than guessed. The digest is sorted by type,
 * so truncation drops a deterministic tail — easy to miss, and a silently
 * incomplete catalog is the very bug this module exists to fix. The cap is
 * therefore deliberately generous (16k chars ≈ 4k tokens against DeepSeek's 64k
 * context) and descriptions are trimmed harder instead. Any remaining truncation
 * is reported through `CatalogSnapshot.dropped` and surfaced to the model.
 */
export const MAX_DIGEST_CHARS = 16000;

/** Per-line description cap — material nuance appears early; the tail is padding. */
const MAX_DESCRIPTION_CHARS = 70;

export interface CatalogSnapshot {
  /** Rendered digest lines, one per active service. */
  digest: string;
  /** Short content hash — lets us answer "which catalog did the model see?". */
  hash: string;
  /** Number of active services the API returned. */
  count: number;
  /** Services omitted because the digest hit `MAX_DIGEST_CHARS` (normally 0). */
  dropped: number;
  /**
   * Canonical type keys present in the digest. The pricing engine matches type
   * keys exactly, so the route resolves the model's answer against these rather
   * than trusting its casing. Optional so callers that only render a message
   * need not fabricate it — `fetchCatalog` always populates it.
   */
  types?: string[];
  /** When the underlying fetch succeeded. */
  fetchedAt: number;
}

/* ───────────────────────────── rendering ───────────────────────────── */

/**
 * Drop control and zero-width characters.
 *
 * The digest is a ONE-LINE-PER-SERVICE format that the model is told to trust,
 * so an unsanitised newline (or U+2028) inside any field would forge an entire
 * fake service line. Legitimate catalog values never contain control
 * characters, so this is a no-op on real data.
 */
function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2028\u2029\uFEFF]/g, ' ');
}

/** Flatten to one clean, length-capped line. */
function truncate(value: unknown, max: number): string {
  const clean = stripControlChars(String(value ?? '')).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Per-field caps — generous for real data, bounded against a runaway row. */
const MAX_TYPE_CHARS = 120;
const MAX_LABEL_CHARS = 120;
const MAX_CHOICE_CHARS = 40;
const MAX_SHORT_CHARS = 60;

/** Flatten dropdown choices to their values — images are UI-only. */
function normalizeChoices(choices: unknown): string[] {
  if (!Array.isArray(choices)) return [];
  return choices
    .map((c) => (typeof c === 'string' ? c : (c as { value?: unknown })?.value))
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map((v) => truncate(v, MAX_CHOICE_CHARS))
    .filter(Boolean);
}

/**
 * Describe a service's option fields so the model can FILL them.
 *
 * The field KEY is the load-bearing part: the engine only prices an order once
 * every required field arrives in `selectedOptions` under its exact key, and the
 * model cannot guess a key it has never been shown. Without this, every topper
 * service was unpriceable through chat.
 *
 * Format: `fields: colour=Gold|Silver|Red REQUIRED, message=text REQUIRED`
 */
function fieldSpec(service: CatalogService): string {
  const fields = (service.optionFields ?? []).filter(Boolean);
  if (fields.length === 0) return '';
  const rendered = fields.map((field) => {
    const key = truncate(field.key, MAX_CHOICE_CHARS) || 'field';
    const type = truncate(field.type, 20) || 'text';
    const values = field.type === 'dropdown' ? normalizeChoices(field.choices) : [];
    const kind = values.length > 0 ? values.join('|') : type === 'number' ? 'number' : 'text';
    return `${key}=${kind}${field.required ? ' REQUIRED' : ''}`;
  });
  return `fields: ${rendered.join(', ')}`;
}

/** Legacy flat option list, for services with no structured fields. */
function legacyChoices(service: CatalogService): string[] {
  return Array.isArray(service.options)
    ? service.options.map((v) => truncate(v, MAX_CHOICE_CHARS)).filter(Boolean)
    : [];
}

/**
 * Resolve a model-emitted service type to the catalog's canonical key.
 *
 * The engine matches type keys EXACTLY and they are owner-authored, so they are
 * not uniformly cased. Matching case-insensitively and returning the catalog's
 * own spelling keeps a correct-but-re-cased answer priceable.
 */
export function resolveServiceType(candidate: unknown, types: readonly string[]): string | null {
  if (typeof candidate !== 'string') return null;
  const wanted = candidate.trim();
  if (!wanted) return null;
  const exact = types.find((t) => t === wanted);
  if (exact) return exact;
  const lower = wanted.toLowerCase();
  return types.find((t) => t.toLowerCase() === lower) ?? null;
}

/**
 * Render one service as a single deterministic line.
 *
 * Format: `type | label | category | unit | lead time | express | fields | description`
 *
 * Every field is flattened and capped, so the result is always exactly one
 * line. No prices — see the module header. Price and surcharge fields are
 * intentionally never read here.
 */
export function formatServiceLine(service: CatalogService): string {
  const parts: string[] = [
    truncate(service.type, MAX_TYPE_CHARS),
    truncate(service.label, MAX_LABEL_CHARS),
    truncate(service.category, MAX_SHORT_CHARS).toLowerCase() || 'other',
    truncate(service.unit, MAX_SHORT_CHARS) || 'per item',
    truncate(service.standardLeadTime, MAX_SHORT_CHARS) || 'standard',
    service.allowExpress ? 'express available' : 'no express',
  ];

  if (service.customerSupplied) parts.push('customer supplies the item');

  const fields = fieldSpec(service);
  if (fields) parts.push(fields);
  else {
    const choices = legacyChoices(service);
    if (choices.length > 0) parts.push(`choices: ${choices.join(', ')}`);
  }

  const desc = truncate(service.description ?? '', MAX_DESCRIPTION_CHARS);
  if (desc) parts.push(desc);

  return `- ${parts.join(' | ')}`;
}

/** Digest rows — raw type key kept alongside the rendered line, sorted by type. */
function renderRows(services: CatalogService[]): Array<{ type: string; line: string }> {
  return [...(services ?? [])]
    .filter((s) => s && s.type && s.label)
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((s) => ({ type: s.type, line: formatServiceLine(s) }));
}

/** Digest plus how much of the catalog made it in. */
export function buildCatalogDigestWithStats(services: CatalogService[]): {
  digest: string;
  included: number;
  dropped: number;
  /** Canonical type keys present in the digest, for exact-match resolution. */
  types: string[];
} {
  const rows = renderRows(services);
  const kept: typeof rows = [];
  let used = 0;
  for (const row of rows) {
    if (used + row.line.length + 1 > MAX_DIGEST_CHARS) break;
    kept.push(row);
    used += row.line.length + 1;
  }
  return {
    digest: kept.map((r) => r.line).join('\n'),
    included: kept.length,
    dropped: rows.length - kept.length,
    types: kept.map((r) => r.type),
  };
}

/**
 * Build the digest body. Sorted by type so the output is stable across fetches
 * (a stable digest keeps the response cache from thrashing and makes the hash
 * meaningful), then capped at `MAX_DIGEST_CHARS`.
 *
 * Callers that need to know whether anything was dropped should use
 * `buildCatalogDigestWithStats` — silent truncation is what let the old roster
 * look complete while omitting services we sell.
 */
export function buildCatalogDigest(services: CatalogService[]): string {
  return buildCatalogDigestWithStats(services).digest;
}

/** Cheap, stable, non-cryptographic content fingerprint. */
export function digestHash(digest: string): string {
  let h = 5381;
  for (let i = 0; i < digest.length; i++) {
    h = ((h << 5) + h + digest.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/* ───────────────────────────── fetching ───────────────────────────── */

/**
 * Cache keyed by brand+apiUrl. Each deployment only ever asks for its own brand,
 * but a process serving both (or a test) must never be handed the wrong
 * catalogue, so the key includes the brand instead of assuming single-tenancy.
 */
const snapshotCache = new Map<string, CatalogSnapshot>();
const inFlight = new Map<string, Promise<CatalogSnapshot | null>>();

const cacheKeyFor = (brand: string, apiUrl: string) => `${brand.toUpperCase()}::${apiUrl}`;

/** Test hook — drops the module-scope cache. */
export function __resetCatalogCache(): void {
  snapshotCache.clear();
  inFlight.clear();
}

async function fetchCatalog(brand: string, apiUrl: string): Promise<CatalogSnapshot | null> {
  try {
    const res = await fetch(`${apiUrl}/api/services?brand=${brand}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const services: CatalogService[] = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body)
        ? body
        : [];
    const { digest, included, dropped, types } = buildCatalogDigestWithStats(services);
    if (!digest) return null;
    if (dropped > 0) {
      // Deliberately loud — a partially-grounded model is how we got here.
      console.warn(
        `[chat-catalog] ${brand}: ${dropped} of ${services.length} services omitted ` +
          `(digest cap ${MAX_DIGEST_CHARS}); ${included} included`,
      );
    }
    return {
      digest,
      hash: digestHash(digest),
      count: services.length,
      dropped,
      types,
      fetchedAt: Date.now(),
    };
  } catch {
    // Network/timeout/parse failure — the caller degrades gracefully.
    return null;
  }
}

/**
 * Get the catalog digest, preferring a fresh cache, then the live API, then the
 * last known good snapshot. Returns `null` only when we have never managed to
 * fetch a catalog at all.
 *
 * Concurrency: parallel chat turns share one in-flight fetch instead of each
 * hammering the admin API on a cold cache.
 */
export async function getCatalogSnapshot(
  brand = 'SKYAL',
  apiUrl = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app',
): Promise<CatalogSnapshot | null> {
  const key = cacheKeyFor(brand, apiUrl);
  const now = Date.now();
  const hit = snapshotCache.get(key);
  if (hit && now - hit.fetchedAt < CATALOG_TTL_MS) return hit;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchCatalog(brand, apiUrl).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, pending);
  }
  const fresh = await pending;

  if (fresh) {
    snapshotCache.set(key, fresh);
    return fresh;
  }
  // Fetch failed: serve the last known good snapshot rather than grounding the
  // model in nothing (which is what caused confident wrong answers before).
  return hit ?? null;
}

/* ───────────────────────────── injection ───────────────────────────── */

/**
 * Build the catalog system message.
 *
 * Three states, all explicit:
 *  - complete snapshot → the digest, plus the rule that only listed type keys may be used
 *  - partial snapshot  → as above, plus a warning that services were omitted
 *  - never fetched     → a degradation instruction that forbids denying capability
 *
 * The failure states matter most: a confident "we cannot do that" is the failure
 * this module exists to prevent, so an incomplete or missing catalog must never
 * read as a capability limit.
 */
export function buildCatalogMessage(snapshot: CatalogSnapshot | null): string {
  const header = `# LIVE SERVICE CATALOG (authoritative, refreshed from the admin database)

This list is the ONLY source of truth for what Skyal offers. Service names, type
keys, materials and lead times are edited by the owner in the admin Services
page, so anything you remember from training or from earlier in this
conversation may be out of date. If a customer asks for something on this list,
we offer it — even if you believe we don't.`;

  if (!snapshot) {
    return `${header}

The catalog could not be loaded right now. You therefore have NO current
knowledge of what we offer.

Rules:
- NEVER tell a customer that we cannot do something. Not knowing is not the
  same as being unable. Say you'll confirm the details with the team.
- Do NOT emit a [SPECS] block with a "service_type" — describe the job in
  "custom_description" instead, and we will confirm.`;
  }

  const partial =
    snapshot.dropped > 0
      ? `

NOTE: this list is PARTIAL — ${snapshot.dropped} further service(s) exist but were
omitted here for length. Treat any request you cannot find as "confirm with the
team", never as unavailable.`
      : '';

  return `${header}${partial}

${snapshot.digest}

Rules:
- Use a "service_type" value ONLY if it appears in this list, copied exactly.
- Never state or imply that Skyal cannot do something that appears here.
- If the customer's request is NOT on this list, do not say we can't do it.
  Say you'll confirm with the team, then describe it in "custom_description".
- When an entry lists "fields:", every field marked REQUIRED must be filled in a
  "selected_options" object inside the [SPECS] block, keyed EXACTLY as shown
  (e.g. "fields: colour=Gold|Silver|Red REQUIRED" → "selected_options":
  {"colour":"Gold"}). Ask the customer for any required value you are missing
  BEFORE emitting [SPECS] — without them the exact price cannot be calculated.
- When an entry says "customer supplies the item", the customer brings that
  material or item to us. Say so plainly and never imply we provide it.

(catalog ${snapshot.hash} · ${snapshot.count} active services)`;
}
