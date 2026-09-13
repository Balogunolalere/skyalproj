/**
 * Regression tests for live catalog grounding (Skyal chat).
 *
 * The bug these exist to prevent: the chat prompt carried a hardcoded roster of
 * service type keys and a hardcoded "what we do" material list. Services are
 * editable at runtime through the admin Services page, so the prompt was a cache
 * of the database that nothing invalidated — once it drifted, the assistant
 * confidently denied services the business actually sells.
 *
 * The load-bearing assertion is therefore: EVERY active service must be visible
 * to the model.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildCatalogDigest,
  buildCatalogDigestWithStats,
  buildCatalogMessage,
  digestHash,
  formatServiceLine,
  getCatalogSnapshot,
  __resetCatalogCache,
  MAX_DIGEST_CHARS,
  CATALOG_TTL_MS,
  type CatalogService,
} from '@/lib/chat-catalog';
import { SKYAL_SYSTEM_PROMPT } from '@/lib/chat';

/* ───────────────────────────── fixtures ───────────────────────────── */

function svc(partial: Partial<CatalogService> & Pick<CatalogService, 'type' | 'label'>): CatalogService {
  return {
    description: '',
    category: 'ADD_ON',
    unit: 'per piece',
    standardLeadTime: '2 working days',
    allowExpress: false,
    customerSupplied: false,
    options: [],
    optionFields: null,
    ...partial,
  };
}

/** A service the prompt roster never mentioned — exactly the drift that broke. */
const ACRYLIC_TOPPER = svc({
  type: 'skyal_topper_acrylic',
  label: 'Acrylic Cake Topper',
  unit: 'per piece',
  allowExpress: true,
  optionFields: [
    {
      key: 'colour',
      label: 'Colour',
      type: 'dropdown',
      choices: ['Gold', { value: 'Silver', image: 'https://cdn.example/silver.png' }],
    },
  ],
});

const ENGRAVING = svc({
  type: 'engraving_jewelry',
  label: 'Jewelry Engraving',
  category: 'ENGRAVING',
  description: 'Engrave name or text on jewelry you bring.',
  standardLeadTime: '48 hours minimum',
  customerSupplied: true,
});

/** Simulates a service added in the admin UI after this code was written. */
const NEW_SERVICE = svc({
  type: 'a_brand_new_admin_service',
  label: 'Brand New Admin Service',
  description: 'Created through the admin Services page at runtime.',
  unit: 'per sheet',
});

const CATALOG = [ACRYLIC_TOPPER, ENGRAVING, NEW_SERVICE];

/* ───────────────────────────── digest content ───────────────────────────── */

describe('buildCatalogDigest — catalog completeness', () => {
  it('includes EVERY active service type key and label', () => {
    const digest = buildCatalogDigest(CATALOG);
    for (const service of CATALOG) {
      expect(digest).toContain(service.type);
      expect(digest).toContain(service.label);
    }
  });

  it('includes a service added at runtime through the admin UI', () => {
    // The prompt roster could never see this; the digest must.
    expect(buildCatalogDigest(CATALOG)).toContain('a_brand_new_admin_service');
  });

  it('surfaces the description, which is where material nuance lives', () => {
    expect(buildCatalogDigest([NEW_SERVICE])).toContain('admin Services page at runtime');
  });

  it('is deterministic and order-independent (stable hash, stable cache key)', () => {
    const a = buildCatalogDigest(CATALOG);
    const b = buildCatalogDigest([...CATALOG].reverse());
    expect(a).toBe(b);
    expect(digestHash(a)).toBe(digestHash(b));
  });

  it('distinguishes different catalogs by hash', () => {
    expect(digestHash(buildCatalogDigest(CATALOG))).not.toBe(
      digestHash(buildCatalogDigest([ACRYLIC_TOPPER])),
    );
  });

  it('skips malformed rows instead of emitting undefined fields', () => {
    const digest = buildCatalogDigest([
      ACRYLIC_TOPPER,
      { type: '', label: '' } as CatalogService,
      null as unknown as CatalogService,
    ]);
    expect(digest).toContain(ACRYLIC_TOPPER.type);
    expect(digest).not.toContain('undefined');
    expect(digest.split('\n')).toHaveLength(1);
  });

  it('caps total size so a large catalog cannot flood the context', () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      svc({ type: `bulk_${i}`, label: `Bulk Service ${i}`, description: 'x'.repeat(300) }),
    );
    expect(buildCatalogDigest(many).length).toBeLessThanOrEqual(MAX_DIGEST_CHARS);
  });
});

/* ───────────────────────────── money safety ───────────────────────────── */

describe('buildCatalogDigest — the engine stays the only pricing authority', () => {
  it('never emits a price, even if one is present on the service payload', () => {
    // The API returns prices; the digest must ignore them.
    const withPrices = {
      ...ACRYLIC_TOPPER,
      basePriceNaira: 15000,
      minPriceNaira: 15000,
      expressSurchargePct: 0.5,
    } as CatalogService;
    const digest = buildCatalogDigest([withPrices]);
    expect(digest).not.toContain('₦');
    expect(digest).not.toMatch(/naira/i);
    expect(digest).not.toContain('15000');
    expect(digest).not.toContain('0.5');
    expect(digest).not.toMatch(/\d{1,3},\d{3}/);
    expect(digest).not.toMatch(/\d+\s*%/);
  });
});

/* ───────────────────────────── line format ───────────────────────────── */

describe('formatServiceLine', () => {
  it('encodes the operational facts the model needs', () => {
    const line = formatServiceLine(ACRYLIC_TOPPER);
    expect(line).toContain('skyal_topper_acrylic');
    expect(line).toContain('Acrylic Cake Topper');
    expect(line).toContain('express available');
    expect(line).toContain('2 working days');
  });

  it('flattens object choices (including image choices) to plain values', () => {
    const line = formatServiceLine(ACRYLIC_TOPPER);
    expect(line).toContain('choices: Gold, Silver');
    expect(line).not.toContain('cdn.example');
  });

  it('falls back to the legacy flat options array', () => {
    const legacy = svc({ type: 'legacy_cut', label: 'Legacy', options: ['Red', 'Blue'] });
    expect(formatServiceLine(legacy)).toContain('choices: Red, Blue');
  });

  it('flags customer-supplied items', () => {
    expect(formatServiceLine(ENGRAVING)).toContain('customer supplies the item');
    expect(formatServiceLine(ACRYLIC_TOPPER)).not.toContain('customer supplies the item');
  });
});

/* ───────────────────────────── prompt hygiene ───────────────────────────── */

describe('SKYAL_SYSTEM_PROMPT no longer restates the catalog', () => {
  it('contains no hardcoded service type key roster', () => {
    // Names that only ever existed as a hardcoded roster line.
    expect(SKYAL_SYSTEM_PROMPT).not.toMatch(
      /fabric_sleeves|fabric_buba|engraving_phone|sheet_cutting_inhouse|acrylic_stick_cutting|skyal_topper_acrylic/,
    );
  });

  it('drops the "type keys EXACTLY as listed" instruction', () => {
    expect(SKYAL_SYSTEM_PROMPT).not.toMatch(/type keys EXACTLY as listed/);
  });

  it('points the model at the injected catalog instead', () => {
    expect(SKYAL_SYSTEM_PROMPT).toContain('LIVE SERVICE CATALOG');
  });

  it('forbids denying capability outright', () => {
    expect(SKYAL_SYSTEM_PROMPT).toMatch(/NEVER tell a customer that we cannot do something/i);
  });

  it('no longer enumerates category materials (the drift that causes denials)', () => {
    expect(SKYAL_SYSTEM_PROMPT).not.toMatch(/CAKE TOPPERS — acrylic/i);
    expect(SKYAL_SYSTEM_PROMPT).not.toMatch(/WHAT WE DO \(categories\)/);
  });
});

/* ───────────────────────────── degradation ───────────────────────────── */

describe('buildCatalogMessage — failure mode is safe', () => {
  /** Prompt prose is wrapped for readability; assertions must not depend on line breaks. */
  const flat = (text: string) => text.replace(/\s+/g, ' ');

  it('forbids denying capability when no catalog could be loaded', () => {
    const msg = flat(buildCatalogMessage(null));
    expect(msg).toMatch(/NEVER tell a customer that we cannot do something/i);
    expect(msg).toMatch(/not knowing is not the same as being unable/i);
  });

  it('tells the model to avoid a service_type it cannot verify', () => {
    const msg = flat(buildCatalogMessage(null));
    expect(msg).toMatch(/do NOT emit a \[SPECS\] block with a "service_type"/i);
  });

  it('never falls back to a hardcoded roster when unavailable', () => {
    const msg = buildCatalogMessage(null);
    expect(msg).not.toMatch(/fabric_sleeves|engraving_phone|sheet_cutting_inhouse/);
  });

  it('embeds the digest and hash when a snapshot exists', () => {
    const digest = buildCatalogDigest(CATALOG);
    const msg = buildCatalogMessage({
      digest,
      hash: digestHash(digest),
      count: CATALOG.length,
      dropped: 0,
      fetchedAt: Date.now(),
    });
    expect(msg).toContain('a_brand_new_admin_service');
    expect(msg).toContain('3 active services');
    expect(msg).toMatch(/authoritative/i);
  });

  it('warns the model when the digest had to omit services', () => {
    // Truncation must never be silent. An incomplete catalog that LOOKS complete
    // is precisely how the assistant ended up denying a service we sell — the
    // digest is sorted by type, so the dropped tail is easy to miss.
    const digest = buildCatalogDigest(CATALOG);
    const msg = buildCatalogMessage({
      digest,
      hash: digestHash(digest),
      count: CATALOG.length + 4,
      dropped: 4,
      fetchedAt: Date.now(),
    });
    expect(msg).toMatch(/this list is PARTIAL/i);
    expect(msg).toContain('4 further service(s)');
    expect(msg).toMatch(/never as unavailable/i);
  });

  it('says nothing about omissions when the catalog was complete', () => {
    const digest = buildCatalogDigest(CATALOG);
    const msg = buildCatalogMessage({
      digest,
      hash: digestHash(digest),
      count: CATALOG.length,
      dropped: 0,
      fetchedAt: Date.now(),
    });
    expect(msg).not.toMatch(/PARTIAL/i);
  });

  it('reports how much of the catalog it dropped', () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      svc({ type: `bulk_${i}`, label: `Bulk ${i}`, description: 'x'.repeat(300) }),
    );
    const { included, dropped, digest } = buildCatalogDigestWithStats(many);
    expect(included + dropped).toBe(400);
    expect(dropped).toBeGreaterThan(0);
    expect(included).toBeGreaterThan(0);
    expect(digest.length).toBeLessThanOrEqual(MAX_DIGEST_CHARS);
  });
});

/* ───────────────────────────── fetch + cache ───────────────────────────── */

describe('getCatalogSnapshot — freshness with a safe fallback', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    __resetCatalogCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = realFetch;
    __resetCatalogCache();
  });

  function mockOk(services: CatalogService[]) {
    const fn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: services }),
    })) as unknown as typeof fetch;
    globalThis.fetch = fn;
    return fn as unknown as ReturnType<typeof vi.fn>;
  }

  function mockFail() {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
  }

  it('fetches the live catalog for the requested brand', async () => {
    const fn = mockOk(CATALOG);
    const snapshot = await getCatalogSnapshot('SKYAL', 'https://admin.test');
    expect(String(fn.mock.calls[0][0])).toContain('/api/services?brand=SKYAL');
    expect(snapshot?.count).toBe(3);
    expect(snapshot?.digest).toContain('a_brand_new_admin_service');
  });

  it('serves from cache within the TTL without re-fetching', async () => {
    const fn = mockOk(CATALOG);
    await getCatalogSnapshot('SKYAL', 'https://admin.test');
    await getCatalogSnapshot('SKYAL', 'https://admin.test');
    expect(fn.mock.calls).toHaveLength(1);
    expect(CATALOG_TTL_MS).toBeGreaterThan(0);
  });

  it('coalesces concurrent cold-cache callers into ONE fetch', async () => {
    const fn = mockOk(CATALOG);
    await Promise.all([
      getCatalogSnapshot('SKYAL', 'https://admin.test'),
      getCatalogSnapshot('SKYAL', 'https://admin.test'),
      getCatalogSnapshot('SKYAL', 'https://admin.test'),
    ]);
    expect(fn.mock.calls).toHaveLength(1);
  });

  it('serves the last known good catalog when a refresh fails', async () => {
    vi.useFakeTimers();
    try {
      mockOk(CATALOG);
      const first = await getCatalogSnapshot('SKYAL', 'https://admin.test');

      // Age the cache past its TTL, then break the network. The snapshot must be
      // RETAINED and served — grounding the model in nothing is exactly what let
      // it deny capability in the first place.
      vi.advanceTimersByTime(CATALOG_TTL_MS + 1000);
      mockFail();

      const stale = await getCatalogSnapshot('SKYAL', 'https://admin.test');
      expect(stale?.digest).toBe(first?.digest);
      expect(stale?.digest).toContain('a_brand_new_admin_service');
      expect(buildCatalogMessage(stale)).toMatch(/authoritative/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null (and the caller degrades) when it has never succeeded', async () => {
    mockFail();
    expect(await getCatalogSnapshot('SKYAL', 'https://admin.test')).toBeNull();
  });

  it('treats an empty catalog as unavailable rather than grounding in nothing', async () => {
    mockOk([]);
    expect(await getCatalogSnapshot('SKYAL', 'https://admin.test')).toBeNull();
  });

  it('treats a non-array payload as unavailable', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { nope: true } }),
    })) as unknown as typeof fetch;
    expect(await getCatalogSnapshot('SKYAL', 'https://admin.test')).toBeNull();
  });
});
