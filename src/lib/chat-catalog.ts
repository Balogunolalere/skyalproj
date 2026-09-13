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
  /** Django-style structured fields; only dropdown choices feed the digest. */
  optionFields?: Array<{ key?: string; label?: string; type?: string; choices?: unknown[] }> | null;
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
  /** When the underlying fetch succeeded. */
  fetchedAt: number;
}

/* ───────────────────────────── rendering ───────────────────────────── */

function truncate(text: string, max: number): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Flatten dropdown choices to their values — images are UI-only. */
function choiceValues(service: CatalogService): string[] {
  const fields = service.optionFields ?? [];
  for (const field of fields) {
    if (field?.type === 'dropdown' && Array.isArray(field.choices) && field.choices.length > 0) {
      return field.choices
        .map((c) => (typeof c === 'string' ? c : (c as { value?: unknown })?.value))
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
    }
  }
  // Legacy flat options string array.
  return Array.isArray(service.options) ? service.options.filter(Boolean) : [];
}

/**
 * Render one service as a single deterministic line.
 *
 * Format: `type | label | category | unit | lead time | express | options | description`
 *
 * No prices — see the module header. Price and surcharge fields are
 * intentionally never read here.
 */
export function formatServiceLine(service: CatalogService): string {
  const parts: string[] = [
    service.type,
    service.label,
    String(service.category ?? 'other').toLowerCase(),
    service.unit ?? 'per item',
    service.standardLeadTime ?? 'standard',
    service.allowExpress ? 'express available' : 'no express',
  ];

  if (service.customerSupplied) parts.push('customer supplies the item');

  const choices = choiceValues(service);
  if (choices.length > 0) parts.push(`choices: ${choices.join(', ')}`);

  const desc = truncate(service.description ?? '', MAX_DESCRIPTION_CHARS);
  if (desc) parts.push(desc);

  return `- ${parts.join(' | ')}`;
}

/** Valid, renderable rows only, stably ordered. */
function renderLines(services: CatalogService[]): string[] {
  return [...(services ?? [])]
    .filter((s) => s && s.type && s.label)
    .sort((a, b) => a.type.localeCompare(b.type))
    .map(formatServiceLine);
}

/** Digest plus how much of the catalog made it in. */
export function buildCatalogDigestWithStats(services: CatalogService[]): {
  digest: string;
  included: number;
  dropped: number;
} {
  const lines = renderLines(services);
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > MAX_DIGEST_CHARS) break;
    kept.push(line);
    used += line.length + 1;
  }
  return { digest: kept.join('\n'), included: kept.length, dropped: lines.length - kept.length };
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

let cached: CatalogSnapshot | null = null;
let inFlight: Promise<CatalogSnapshot | null> | null = null;

/** Test hook — drops the module-scope cache. */
export function __resetCatalogCache(): void {
  cached = null;
  inFlight = null;
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
    const { digest, included, dropped } = buildCatalogDigestWithStats(services);
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
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CATALOG_TTL_MS) return cached;

  if (!inFlight) {
    inFlight = fetchCatalog(brand, apiUrl).finally(() => {
      inFlight = null;
    });
  }
  const fresh = await inFlight;

  if (fresh) {
    cached = fresh;
    return cached;
  }
  // Fetch failed: serve the last known good snapshot rather than grounding the
  // model in nothing (which is what caused confident wrong answers before).
  return cached;
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

(catalog ${snapshot.hash} · ${snapshot.count} active services)`;
}
