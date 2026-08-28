import { describe, expect, test } from 'vitest'
import {
  NIGERIAN_PHONE_REGEX,
  stripPhoneFormatting,
  isValidNigerianPhone,
  isValidPickupISO,
  pickupISOFromParts,
  defaultPickupISO,
  pickupTierPct,
  pickupDateBounds,
  missingRequiredOptionFields,
  normalizeChoices,
  buildQuotePayload,
  buildOrderPayload,
  MAX_PICKUP_DAYS,
  type OptionField,
} from '@/lib/order'
import { DEFAULT_BUSINESS_CALENDAR } from '@/lib/business-calendar'

/* ── Nigerian phone validation (backend `isValidPhone`) ─────────────────── */

describe('Nigerian phone validation', () => {
  test.each([
    // 11-digit local formats
    '08035003068',
    '07012345678',
    '09012345678',
    '08123456789',
    '08053503068', // 0805 MTN range — [01] constrains the third digit, not the fourth
    '0803 350 3068',
    '0803-350-3068',
    '(0803) 350 3068',
    // 13-digit international formats
    '2348033503068',
    '+2348033503068',
    '+234 803 350 3068',
    '+234-803-350-3068',
  ])('accepts %s', (phone) => {
    expect(isValidNigerianPhone(phone)).toBe(true)
    expect(NIGERIAN_PHONE_REGEX.test(stripPhoneFormatting(phone.trim()))).toBe(true)
  })

  test.each([
    '',
    '12345',
    '0803500306', // 10 digits — too short
    '080350030688', // 12 digits — too long
    '08233503068', // third digit 2 not in [01]
    '12345678901', // wrong prefix
    '234803350306', // 12-digit international
    'hello there',
    '0701 234 567',
  ])('rejects %s', (phone) => {
    expect(isValidNigerianPhone(phone)).toBe(false)
  })

  test('strips spaces, dashes and parens before matching', () => {
    expect(stripPhoneFormatting('+234 (803) 350-3068')).toBe('+2348033503068')
    expect(isValidNigerianPhone('+234 (803) 350-3068')).toBe(true)
  })
})

/* ── requestedPickupTime contract (future, working day, configured hours, ≤30d) ── */

// Base instant: Mon 10 Aug 2026, 08:00 Africa/Lagos (= 07:00 UTC).
const NOW_MS = Date.UTC(2026, 7, 10, 7, 0);
const iso = (y: number, mo: number, d: number, hLagos: number, min = 0) =>
  new Date(Date.UTC(y, mo - 1, d, hLagos - 1, min)).toISOString();

describe('isValidPickupISO', () => {
  test('accepts a future weekday within 08:00–17:00 Lagos', () => {
    expect(isValidPickupISO(iso(2026, 8, 11, 10), NOW_MS)).toBe(true) // Tue 10:00
    expect(isValidPickupISO(iso(2026, 8, 10, 9), NOW_MS)).toBe(true) // today 09:00
    expect(isValidPickupISO(iso(2026, 8, 11, 8), NOW_MS)).toBe(true) // Tue 08:00 = opening, valid
    expect(isValidPickupISO(iso(2026, 8, 11, 16), NOW_MS)).toBe(true) // 16:00 — one hour before close
  })

  test('rejects weekends and observed public holidays', () => {
    expect(isValidPickupISO(iso(2026, 8, 15, 10), NOW_MS)).toBe(false) // Sat
    expect(isValidPickupISO(iso(2026, 8, 16, 10), NOW_MS)).toBe(false) // Sun
    // Wed 12 Aug is set as an observed public holiday → rejected.
    const holidayCal = { ...DEFAULT_BUSINESS_CALENDAR, holidays: new Set(['2026-08-12']) };
    expect(isValidPickupISO(iso(2026, 8, 12, 10), NOW_MS, holidayCal)).toBe(false)
    expect(isValidPickupISO(iso(2026, 8, 13, 10), NOW_MS, holidayCal)).toBe(true)
  })

  test('rejects times outside studio hours (closing is exclusive)', () => {
    expect(isValidPickupISO(iso(2026, 8, 11, 7, 59), NOW_MS)).toBe(false) // before 08:00
    expect(isValidPickupISO(iso(2026, 8, 11, 17), NOW_MS)).toBe(false) // 17:00 = closing, rejected
    expect(isValidPickupISO(iso(2026, 8, 11, 17, 30), NOW_MS)).toBe(false) // after close
    expect(isValidPickupISO(iso(2026, 8, 11, 18), NOW_MS)).toBe(false) // after close
  })

  test('rejects past and far-future instants', () => {
    expect(isValidPickupISO(iso(2026, 8, 10, 7), NOW_MS)).toBe(false) // past
    expect(isValidPickupISO(iso(2026, 9, 11, 10), NOW_MS)).toBe(false) // >30 days
  })

  test('rejects garbage input', () => {
    expect(isValidPickupISO('')).toBe(false)
    expect(isValidPickupISO('next friday')).toBe(false)
    expect(isValidPickupISO(iso(2026, 8, 11, 10), Number.NaN)).toBe(false)
  })
})

describe('pickupISOFromParts', () => {
  test('composes Lagos wall-clock date+time into a valid ISO string', () => {
    expect(pickupISOFromParts('2026-08-11', '10:00', NOW_MS)).toBe(iso(2026, 8, 11, 10))
    expect(pickupISOFromParts('2026-08-11', '08:00', NOW_MS)).toBe(iso(2026, 8, 11, 8)) // opening
  })

  test('returns null for weekends, bad hours, past times', () => {
    expect(pickupISOFromParts('2026-08-15', '10:00', NOW_MS)).toBeNull() // Sat
    expect(pickupISOFromParts('2026-08-11', '07:00', NOW_MS)).toBeNull() // before open
    expect(pickupISOFromParts('2026-08-11', '17:00', NOW_MS)).toBeNull() // closing — exclusive
    expect(pickupISOFromParts('2026-08-11', '18:30', NOW_MS)).toBeNull()
    expect(pickupISOFromParts('2026-08-10', '08:00', NOW_MS)).toBeNull() // not future
  })
})

describe('defaultPickupISO', () => {
  test('is now + 2 working days at 16:00 Lagos (one hour before close)', () => {
    // Fri 14 Aug 2026, 10:00 Lagos → Sat/Sun skipped → Tue 18 Aug 16:00 Lagos.
    const friMs = Date.UTC(2026, 7, 14, 9, 0);
    expect(defaultPickupISO(friMs)).toBe(iso(2026, 8, 18, 16));
    // The default must satisfy the exact same rules the backend enforces.
    expect(isValidPickupISO(defaultPickupISO(friMs), friMs)).toBe(true);
  })

  test('is always a valid future pickup', () => {
    const now = Date.now();
    const d = defaultPickupISO(now);
    expect(isValidPickupISO(d, now)).toBe(true);
  })

  test('skips observed public holidays', () => {
    const holidayCal = { ...DEFAULT_BUSINESS_CALENDAR, holidays: new Set(['2026-08-18']) }; // Tue holiday
    const friMs = Date.UTC(2026, 7, 14, 9, 0);
    // Fri + 2 working days: Mon 17 (1), Tue 18 holiday skipped → Wed 19 (2).
    expect(defaultPickupISO(friMs, holidayCal)).toBe(iso(2026, 8, 19, 16));
    expect(isValidPickupISO(defaultPickupISO(friMs, holidayCal), friMs, holidayCal)).toBe(true);
  })

  test('respects customized hours (never lands on the exclusive close)', () => {
    const cal = { ...DEFAULT_BUSINESS_CALENDAR, openMinute: 10 * 60, closeMinute: 16 * 60 };
    const friMs = Date.UTC(2026, 7, 14, 9, 0);
    const d = defaultPickupISO(friMs, cal);
    expect(d).toBe(iso(2026, 8, 18, 15)); // close - 1h = 15:00, inside [10:00, 16:00)
    expect(isValidPickupISO(d, friMs, cal)).toBe(true);
  })
})

/* ── Tiered express ladder (mirrors the engine) ──────────────────────────── */

describe('pickupTierPct — the 4-tier express ladder', () => {
  test('SAME_DAY_URGENT <4h ahead → +100%', () => {
    expect(pickupTierPct(iso(2026, 8, 10, 11), NOW_MS)).toBe(1.0) // +3h
  })

  test('SAME_DAY ≥4h ahead, same Lagos day → +50%', () => {
    expect(pickupTierPct(iso(2026, 8, 10, 13), NOW_MS)).toBe(0.5) // +5h
  })

  test('RUSH <2 working days ahead → +25%', () => {
    expect(pickupTierPct(iso(2026, 8, 11, 10), NOW_MS)).toBe(0.25) // tomorrow
    // Fri 14 Aug pickup from Thu 13 Aug = 1 working day → RUSH
    const thuMs = Date.UTC(2026, 7, 13, 7, 0);
    expect(pickupTierPct(iso(2026, 8, 14, 10), thuMs)).toBe(0.25)
    // Mon 17 Aug pickup from Fri 14 Aug = 1 working day (weekend skipped) → RUSH
    const friMs = Date.UTC(2026, 7, 14, 7, 0);
    expect(pickupTierPct(iso(2026, 8, 17, 10), friMs)).toBe(0.25)
  })

  test('STANDARD ≥2 working days ahead → 0%', () => {
    // Mon 17 Aug pickup from Thu 13 Aug = Fri + Mon = 2 working days → STANDARD
    const thuMs = Date.UTC(2026, 7, 13, 7, 0);
    expect(pickupTierPct(iso(2026, 8, 17, 10), thuMs)).toBe(0)
  })

  test('after-close order snaps to the next opening (Fri 18:30 → Mon 08:00, pickup 09:00 = URGENT)', () => {
    // Fri 14 Aug 2026, 18:30 Lagos = 17:30 UTC. Pickup Mon 17 Aug 09:00 Lagos.
    const friEvening = Date.UTC(2026, 7, 14, 17, 30);
    expect(pickupTierPct(iso(2026, 8, 17, 9), friEvening)).toBe(1.0) // 1h of production
  })

  test('weekend order with a Monday pickup is SAME_DAY (5h from opening)', () => {
    // Sat 15 Aug 12:00 Lagos; pickup Mon 17 Aug 13:00 Lagos = 5h after the
    // Monday 08:00 opening → +50%, not RUSH.
    const satNoon = Date.UTC(2026, 7, 15, 11, 0);
    expect(pickupTierPct(iso(2026, 8, 17, 13), satNoon)).toBe(0.5)
  })

  test('observed holidays count as non-working days (Wed pickup = RUSH)', () => {
    const holidayCal = { ...DEFAULT_BUSINESS_CALENDAR, holidays: new Set(['2026-08-11']) }; // Tue holiday
    expect(pickupTierPct(iso(2026, 8, 12, 10), NOW_MS, holidayCal)).toBe(0.25) // Wed = 1 working day
    expect(pickupTierPct(iso(2026, 8, 13, 10), NOW_MS, holidayCal)).toBe(0) // Thu = 2 working days
  })
})

describe('pickupDateBounds', () => {
  test('opens today (Lagos) when before closing and rolls past weekends', () => {
    const monOpening = Date.UTC(2026, 7, 10, 7, 0); // Mon 08:00 Lagos = opening
    const b = pickupDateBounds(monOpening);
    expect(b.minDate.getFullYear()).toBe(2026);
    expect(b.minDate.getMonth()).toBe(7); // Aug
    expect(b.minDate.getDate()).toBe(10);
    // 08:00 exactly = opening; next 30-min slot is 08:30.
    expect(b.minTime).toBe('08:30');
    const max = b.maxDate.getTime() - b.minDate.getTime();
    expect(max).toBeLessThanOrEqual((MAX_PICKUP_DAYS + 2) * 86400000);
  })

  test('moves to Monday from a Friday evening', () => {
    const friEvening = Date.UTC(2026, 7, 14, 17, 30); // Fri 18:30 Lagos — after 17:00 close
    const b = pickupDateBounds(friEvening);
    // Sat 15 → Sun 16 → Mon 17 Aug
    expect(b.minDate.getDate()).toBe(17);
    expect(b.minTime).toBeUndefined();
  })

  test('rolls past an observed public holiday', () => {
    const holidayCal = { ...DEFAULT_BUSINESS_CALENDAR, holidays: new Set(['2026-08-10']) }; // Mon holiday
    const b = pickupDateBounds(Date.UTC(2026, 7, 10, 7, 0), holidayCal); // Mon 08:00 Lagos
    expect(b.minDate.getDate()).toBe(11); // Tue 11 Aug — the next working day
    expect(b.minTime).toBeUndefined();
  })
})

/* ── Option-choice normalization (string | { value, image? }) ────────────── */

describe('normalizeChoices', () => {
  test('normalizes plain strings and image objects to { value, image? }', () => {
    expect(
      normalizeChoices(['Gold', { value: 'Silver', image: 'https://x/s.png' }]),
    ).toEqual([
      { value: 'Gold' },
      { value: 'Silver', image: 'https://x/s.png' },
    ]);
  })

  test('keeps objects without an image as { value }', () => {
    expect(normalizeChoices([{ value: 'Oak' }])).toEqual([{ value: 'Oak' }]);
  })

  test('tolerates missing/garbage choice lists', () => {
    expect(normalizeChoices(undefined)).toEqual([]);
    expect(normalizeChoices(null)).toEqual([]);
    expect(normalizeChoices([])).toEqual([]);
  })
})

/* ── Required option validation ──────────────────────────────────────────── */

describe('missingRequiredOptionFields', () => {
  const fields: OptionField[] = [
    { key: 'colour', label: 'Colour', type: 'dropdown', choices: ['Gold'], required: true },
    { key: 'message', label: 'Topper message', type: 'text', required: true },
    { key: 'age', label: 'Age', type: 'number', min: 1, max: 100 },
  ];

  test('reports required fields with blank values', () => {
    expect(missingRequiredOptionFields(fields, { colour: 'Gold' })).toEqual(['Topper message']);
    expect(missingRequiredOptionFields(fields, {})).toEqual(['Colour', 'Topper message']);
  })

  test('ignores whitespace-only values', () => {
    expect(missingRequiredOptionFields(fields, { colour: 'Gold', message: '   ' })).toEqual([
      'Topper message',
    ]);
  })

  test('returns [] when everything required is filled or no fields exist', () => {
    expect(missingRequiredOptionFields(fields, { colour: 'Gold', message: 'Happy 30th' })).toEqual([]);
    expect(missingRequiredOptionFields(null, {})).toEqual([]);
    expect(missingRequiredOptionFields([], {})).toEqual([]);
  })
})

/* ── Payload builders — requestedPickupTime + selectedOptions always present ── */

const PICKUP = '2026-08-17T15:00:00.000Z';

describe('buildQuotePayload', () => {
  test('includes requestedPickupTime, brand and the catalog fields', () => {
    const payload = buildQuotePayload({
      serviceType: 'skyal_topper_acrylic',
      quantity: 1,
      sla: 'Standard',
      requestedPickupTime: PICKUP,
      deliveryMethod: 'PICKUP',
    });
    expect(payload).toMatchObject({
      brand: 'SKYAL',
      serviceType: 'skyal_topper_acrylic',
      quantity: 1,
      sla: 'Standard',
      requestedPickupTime: PICKUP,
    });
  })

  test('sends selectedOptions as key→string values', () => {
    const payload = buildQuotePayload({
      serviceType: 'skyal_topper_acrylic',
      quantity: 2,
      sla: 'Standard',
      requestedPickupTime: PICKUP,
      selectedOptions: { colour: 'Gold', message: 'Happy 30th', age: '30' },
    });
    expect(payload.selectedOptions).toEqual({ colour: 'Gold', message: 'Happy 30th', age: '30' });
  })

  test('never sends both selectedOptions and selectedVariant — structured wins', () => {
    const payload = buildQuotePayload({
      serviceType: 'skyal_topper_acrylic',
      quantity: 1,
      sla: 'Standard',
      requestedPickupTime: PICKUP,
      selectedOptions: { colour: 'Gold' },
      selectedVariant: 'Gold',
    });
    expect(payload.selectedOptions).toBeDefined();
    expect('selectedVariant' in payload).toBe(false);
  })

  test('sends selectedVariant for legacy flat options when no structured values exist', () => {
    const payload = buildQuotePayload({
      serviceType: 'fabric_buba',
      quantity: 1,
      sla: 'Standard',
      requestedPickupTime: PICKUP,
      selectedVariant: 'Full Buba',
      selectedOptions: {},
    });
    expect(payload.selectedVariant).toBe('Full Buba');
    expect('selectedOptions' in payload).toBe(false);
  })
})

describe('buildOrderPayload', () => {
  test('catalog path: requestedPickupTime + selectedOptions in the order payload', () => {
    const payload = buildOrderPayload({
      quantity: 2,
      sla: 'Express',
      customerName: 'Ada',
      customerPhone: '08035003068',
      customerEmail: 'ada@example.com',
      requestedPickupTime: PICKUP,
      deliveryMethod: 'PICKUP',
      serviceType: 'skyal_topper_acrylic',
      selectedOptions: { colour: 'Gold', message: 'Happy 30th', age: '30' },
    });
    expect(payload).toMatchObject({
      brand: 'SKYAL',
      serviceType: 'skyal_topper_acrylic',
      quantity: 2,
      requestedPickupTime: PICKUP,
      selectedOptions: { colour: 'Gold', message: 'Happy 30th', age: '30' },
    });
    expect('selectedVariant' in payload).toBe(false);
  })

  test('custom path: requestedPickupTime + customSpec, no serviceType', () => {
    const payload = buildOrderPayload({
      quantity: 1,
      sla: 'Standard',
      customerName: 'Ada',
      customerPhone: '08035003068',
      customerEmail: '',
      requestedPickupTime: PICKUP,
      customSpec: { description: 'Cut my jeans', material: 'denim', complexity: 'simple' },
    });
    expect(payload.requestedPickupTime).toBe(PICKUP);
    expect(payload.customSpec).toEqual({ description: 'Cut my jeans', material: 'denim', complexity: 'simple' });
    expect('serviceType' in payload).toBe(false);
  })

  test('never fabricates a customer email — empty string when absent', () => {
    const payload = buildOrderPayload({
      quantity: 1,
      sla: 'Standard',
      customerName: 'Ada',
      customerPhone: '08035003068',
      customerEmail: '',
      requestedPickupTime: PICKUP,
      serviceType: 'fabric_buba',
    });
    expect(payload.customerEmail).toBe('');
    expect('customerEmail' in payload).toBe(true); // key present: backend currently requires it
    expect(payload.customerEmail).not.toContain('@skyal');
  })
})
