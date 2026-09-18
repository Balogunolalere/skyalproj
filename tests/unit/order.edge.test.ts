/**
 * Edge cases for the customer site's pure logic — the parts that decide what a
 * customer is promised: pickup validation, the express ladder, phone identity,
 * option fields and the request payloads sent to the admin API.
 *
 * The ladder and the calendar exist in THREE places (this app, the Paberin app
 * and the admin backend). These cases mirror the backend's
 * tests/unit/working-deadline.test.ts so that a divergence fails here, in the
 * repo that diverged, instead of silently mispricing a customer.
 *
 * All times are Lagos wall clock (UTC+1): a fixture at T16:00Z is 17:00 Lagos.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_BUSINESS_CALENDAR,
  isWorkingDayCal,
  snapToBusinessOpening,
  parseClockTime,
  parseHolidays,
  parseBusinessCalendar,
} from '@/lib/business-calendar';
import {
  isValidNigerianPhone,
  stripPhoneFormatting,
  normalizeChoices,
  missingRequiredOptionFields,
  isValidPickupISO,
  pickupISOFromParts,
  pickupDateBounds,
  defaultPickupISO,
  pickupTierPct,
  formatPickupISO,
  buildQuotePayload,
  buildOrderPayload,
} from '@/lib/order';
import { apiFetch, ApiError } from '@/lib/api';

/* Fri 18 Sep 2026 17:00 Lagos (at close) — the weekend follows. */
const FRI_CLOSE = Date.parse('2026-09-18T16:00:00.000Z');
/* Fri 18 Sep 18:30 Lagos — after close. */
const FRI_LATE = Date.parse('2026-09-18T17:30:00.000Z');
/* Sat 19 Sep 13:00 Lagos. */
const SAT = Date.parse('2026-09-19T12:00:00.000Z');
/* Mon 21 Sep 10:00 Lagos. */
const MON = Date.parse('2026-09-21T09:00:00.000Z');
const at = (iso: string) => Date.parse(iso);
const cal = DEFAULT_BUSINESS_CALENDAR;

describe('business calendar', () => {
  it.each([
    ['2026-09-18T10:00:00Z', true, 'Friday'],
    ['2026-09-19T10:00:00Z', false, 'Saturday'],
    ['2026-09-20T10:00:00Z', false, 'Sunday'],
    ['2026-09-21T10:00:00Z', true, 'Monday'],
  ])('isWorkingDayCal(%s) is %s (%s)', (iso, expected) => {
    expect(isWorkingDayCal(at(iso), cal)).toBe(expected);
  });

  it('treats an observed holiday as closed', () => {
    const withHoliday = { ...cal, holidays: new Set(['2026-09-21']) };
    expect(isWorkingDayCal(MON, withHoliday)).toBe(false);
    expect(isWorkingDayCal(MON, cal)).toBe(true);
  });

  it.each([
    [FRI_LATE, '2026-09-21T07:00:00.000Z', 'Friday 18:30 → Monday 08:00'],
    [SAT, '2026-09-21T07:00:00.000Z', 'Saturday → Monday 08:00'],
    [MON, '2026-09-21T09:00:00.000Z', 'during hours → unchanged'],
    [FRI_CLOSE, '2026-09-21T07:00:00.000Z', 'exactly at close → Monday'],
    [at('2026-09-18T05:00:00Z'), '2026-09-18T07:00:00.000Z', 'before opening → today 08:00'],
  ])('snapToBusinessOpening(%i) = %s — %s', (input, expected) => {
    expect(snapToBusinessOpening(input, cal).valueOf()).toBe(at(expected));
  });

  it('skips a holiday when snapping', () => {
    const withHoliday = { ...cal, holidays: new Set(['2026-09-21']) };
    expect(snapToBusinessOpening(SAT, withHoliday).valueOf()).toBe(at('2026-09-22T07:00:00.000Z'));
  });

  it.each([
    ['08:00', 480],
    ['8:00', 480],
    ['17:00', 1020],
    ['00:00', 0],
  ])('parses clock %s', (raw, minutes) => {
    expect(parseClockTime(raw, -1)).toBe(minutes);
  });

  it.each([null, undefined, '', 'soon', '25:99', 'aa:bb'])('rejects clock %s → fallback', (raw) => {
    expect(parseClockTime(raw, 480)).toBe(480);
  });

  it('parses holiday lists defensively', () => {
    expect([...parseHolidays('["2026-01-01"]')]).toEqual(['2026-01-01']);
    expect(parseHolidays('not json').size).toBe(0);
    expect(parseHolidays(null).size).toBe(0);
    expect(parseHolidays('{"a":1}').size).toBe(0); // object, not a list
    expect([...parseHolidays('["2026-01-01","bad","2026-02-30"]')].length).toBe(1);
  });

  it('falls back to the default schedule for junk settings, and keeps valid ones', () => {
    expect(parseBusinessCalendar(null).openMinute).toBe(480);
    expect(parseBusinessCalendar({ working_day_open: 'nonsense' }).openMinute).toBe(480);
    // open >= close would reject every pickup — refuse and keep the default.
    const inverted = parseBusinessCalendar({ working_day_open: '17:00', working_day_close: '08:00' });
    expect(inverted.openMinute).toBe(480);
    expect(inverted.closeMinute).toBe(1020);
    const custom = parseBusinessCalendar({ working_day_open: '09:00', working_day_close: '18:00' });
    expect([custom.openMinute, custom.closeMinute]).toEqual([540, 1080]);
  });
});

describe('phone identity', () => {
  it.each([
    ['08033503068', true],
    ['0803 350 3068', true],
    ['0803-350-3068', true],
    ['(0803) 350 3068', true], // separators are stripped before matching…
    ['+2348033503068', true],
    ['2348033503068', true],
    ['08155556666', true],
    ['09155556666', true],
    ['07012345678', true],
    ['02033503068', false], // landline
    ['1234567', false],
    ['0803350306', false], // too short
    ['08033503068999', false], // too long
    ['+18005550123', false],
    ['hello', false],
    ['', false],
  ])('isValidNigerianPhone(%s) is %s', (phone, expected) => {
    expect(isValidNigerianPhone(phone)).toBe(expected);
  });

  it.each([
    ['0803 350 3068', '08033503068'],
    ['0803-350-3068', '08033503068'],
  ])('strips formatting from %s', (input, expected) => {
    expect(stripPhoneFormatting(input)).toBe(expected);
  });
});

describe('pickup validation', () => {
  it.each([
    ['2026-09-21T09:00:00.000Z', true, 'Monday inside hours'],
    ['2026-09-21T07:00:00.000Z', true, 'Monday at opening'],
    ['2026-09-21T06:59:00.000Z', false, 'one minute before opening'],
    ['2026-09-21T16:00:00.000Z', false, 'exactly at close (exclusive)'],
    ['2026-09-21T15:59:00.000Z', true, 'one minute before close'],
    ['2026-09-19T10:00:00.000Z', false, 'Saturday'],
    ['2026-09-20T10:00:00.000Z', false, 'Sunday'],
    ['2026-09-17T10:00:00.000Z', false, 'in the past'],
    ['not-a-date', false, 'garbage'],
    ['', false, 'empty'],
  ])('isValidPickupISO(%s) is %s — %s', (iso, expected) => {
    expect(isValidPickupISO(iso, FRI_CLOSE, cal)).toBe(expected);
  });

  it('rejects a holiday and a date beyond the 30-day cap', () => {
    const withHoliday = { ...cal, holidays: new Set(['2026-09-21']) };
    expect(isValidPickupISO('2026-09-21T09:00:00.000Z', FRI_CLOSE, withHoliday)).toBe(false);
    expect(isValidPickupISO('2026-10-18T09:00:00.000Z', FRI_CLOSE, cal)).toBe(false); // 30 days out
  });

  describe('pickupISOFromParts', () => {
    it.each([
      ['2026-09-21', '10:00', true],
      ['2026-09-21', '09:5', false],
      ['2026-02-30', '10:00', false], // rolls over — refuse to guess
      ['2026-13-01', '10:00', false],
      ['21-09-2026', '10:00', false],
      ['2026-09-21', '24:00', false],
      ['2026-09-21', '23:59', false], // outside working hours, not a parser concern only
    ])('parts %s %s → ok=%s', (date, time, ok) => {
      const iso = pickupISOFromParts(date, time);
      expect(Boolean(iso)).toBe(ok);
      if (ok) expect(new Date(iso!).toISOString()).toContain('2026-09-21');
    });
  });

  it('bounds the picker to working days only', () => {
    const { minDate, maxDate } = pickupDateBounds(FRI_CLOSE, cal);
    // Fri at close → Monday is the earliest selectable day.
    expect([minDate.getFullYear(), minDate.getMonth() + 1, minDate.getDate()]).toEqual([2026, 9, 21]);
    expect(minDate.getDay()).toBe(1);
    // The cap is "no more than 30 days from NOW" (the backend's rule), not
    // "30 days from the first selectable day".
    const maxLag = Math.round((maxDate.getTime() - new Date(2026, 8, 18).getTime()) / 86400000);
    expect(maxLag).toBe(30);
  });

  it('makes today selectable while the studio is still open', () => {
    const { minDate } = pickupDateBounds(MON, cal);
    expect([minDate.getFullYear(), minDate.getMonth() + 1, minDate.getDate()]).toEqual([2026, 9, 21]);
  });

  it.each([
    [FRI_CLOSE, '2026-09-22T15:00:00.000Z', 'Fri at close +2 working days → Tue 16:00'],
    [SAT, '2026-09-22T15:00:00.000Z', 'Sat +2 working days → Tue 16:00'],
    [MON, '2026-09-23T15:00:00.000Z', 'Mon +2 working days → Wed 16:00'],
  ])('defaultPickupISO(%i) = %s — %s', (now, expected) => {
    expect(defaultPickupISO(now, cal)).toBe(expected);
  });

  it('never defaults to a weekend, even before a holiday', () => {
    const withHoliday = { ...cal, holidays: new Set(['2026-09-22', '2026-09-23']) };
    const iso = defaultPickupISO(MON, withHoliday);
    const day = new Date(iso).getUTCDay();
    expect([0, 6]).not.toContain(day);
    expect(iso.startsWith('2026-09-25')).toBe(true); // Fri: Tue+Wed are holidays, so 2 working days lands on Friday
  });
});

describe('express ladder (mirrors the backend)', () => {
  // Fri 18:30 Lagos → effective start Mon 08:00, so a Monday-morning pickup is
  // URGENT, not RUSH: the weekend must not create hours that never existed.
  it.each([
    ['2026-09-21T08:00:00.000Z', 1.0, 'Mon 09:00 — 1h after the snapped start'],
    ['2026-09-21T09:59:00.000Z', 1.0, 'Mon 10:59 — under 4h'],
    ['2026-09-21T11:00:00.000Z', 0.5, 'Mon 12:00 — exactly 4h since the 08:00 start is NOT urgent'],
    ['2026-09-21T15:00:00.000Z', 0.5, 'Mon 16:00 — same working day'],
    ['2026-09-22T09:00:00.000Z', 0.25, 'Tue — 1 working day ahead'],
    ['2026-09-23T09:00:00.000Z', 0, 'Wed — 2 working days ahead ends rush'],
  ])('from Fri 18:30, pickup %s → %sx (%s)', (pickup, expected) => {
    expect(pickupTierPct(pickup, FRI_LATE, cal)).toBe(expected);
  });

  it.each([
    ['2026-09-21T11:59:00.000Z', 1.0, '2h59 ahead'],
    ['2026-09-21T13:00:00.000Z', 0.5, 'exactly 4h ahead'],
  ])('from Mon 10:00, pickup %s → %sx (%s)', (pickup, expected) => {
    expect(pickupTierPct(pickup, MON, cal)).toBe(expected);
  });

  it('charges rush across a weekend that is only one working day away', () => {
    // Fri 09:00 → pickup Monday 10:00 is 1 working day ahead, so RUSH, even
    // though it is three calendar days away.
    expect(pickupTierPct('2026-09-21T09:00:00.000Z', at('2026-09-18T08:00:00Z'), cal)).toBe(0.25);
  });

  it('is standard when the pickup is far out, and 0 for garbage input', () => {
    expect(pickupTierPct('2026-10-01T09:00:00.000Z', MON, cal)).toBe(0);
    expect(pickupTierPct('nonsense', MON, cal)).toBe(0);
    expect(pickupTierPct('', MON, cal)).toBe(0);
  });

  it('honours a holiday when counting days ahead', () => {
    const withHoliday = { ...cal, holidays: new Set(['2026-09-22']) };
    // Tue is closed, so Wed is only one working day ahead of Mon → RUSH.
    expect(pickupTierPct('2026-09-23T09:00:00.000Z', MON, withHoliday)).toBe(0.25);
    expect(pickupTierPct('2026-09-23T09:00:00.000Z', MON, cal)).toBe(0);
  });

  it('formats a pickup for display in Lagos time', () => {
    expect(formatPickupISO('2026-09-21T09:00:00.000Z')).toBe('Mon 21 Sep 2026 · 10:00 WAT');
    expect(formatPickupISO('nonsense')).toBe('');
  });
});

describe('option fields', () => {
  it.each([
    [[], 0],
    [undefined, 0],
    [[{ value: 'Gold' }], 1],
    [[{ value: 'Gold', image: 'https://x/y.png' }], 1],
    [['Gold'], 1],
    [['Gold', 'Gold'], 2], // de-duplication is not this helper's job
    [[null, undefined, 'Gold'], 1],
  ])('normalizeChoices(%j) length %i', (choices, len) => {
    expect(normalizeChoices(choices as never).length).toBe(len);
  });

  it('reports only required fields that are still blank', () => {
    const fields = [
      { key: 'colour', label: 'Colour', type: 'dropdown' as const, required: true },
      { key: 'note', label: 'Note', type: 'text' as const },
      { key: 'size', label: 'Size', type: 'number' as const, required: true },
    ];
    expect(missingRequiredOptionFields(fields, {})).toEqual(['Colour', 'Size']);
    expect(missingRequiredOptionFields(fields, { colour: 'Gold' })).toEqual(['Size']);
    expect(missingRequiredOptionFields(fields, { colour: 'Gold', size: '2' })).toEqual([]);
    expect(missingRequiredOptionFields(fields, { colour: '   ', size: '2' })).toEqual(['Colour']);
    expect(missingRequiredOptionFields(null, {})).toEqual([]);
    expect(missingRequiredOptionFields(undefined, {})).toEqual([]);
  });
});

describe('request payloads', () => {
  const base = {
    serviceType: 'plain_topper',
    quantity: 2,
    sla: 'Standard',
    requestedPickupTime: '2026-09-21T09:00:00.000Z',
  };

  it('sends brand and the required pickup time', () => {
    expect(buildQuotePayload(base)).toMatchObject({
      brand: 'SKYAL',
      serviceType: 'plain_topper',
      quantity: 2,
      requestedPickupTime: base.requestedPickupTime,
    });
  });

  it('never sends both a variant and structured options', () => {
    expect(buildQuotePayload({ ...base, selectedVariant: 'Gold' })).toMatchObject({ selectedVariant: 'Gold' });
    expect(buildQuotePayload({ ...base, selectedVariant: 'Gold' }).selectedOptions).toBeUndefined();
    expect(buildQuotePayload({ ...base, selectedOptions: { colour: 'Gold' } }).selectedVariant).toBeUndefined();
  });

  it('builds an order body with an empty email rather than dropping the key', () => {
    const payload = buildOrderPayload({
      quantity: 1,
      sla: 'Standard',
      customerName: 'Ada',
      customerPhone: '08033503068',
      customerEmail: '',
      requestedPickupTime: base.requestedPickupTime,
      serviceType: 'plain_topper',
    });
    expect(payload).toMatchObject({ brand: 'SKYAL', customerEmail: '', customerName: 'Ada' });
  });

  it('carries the custom-job path without a serviceType', () => {
    const payload = buildOrderPayload({
      quantity: 1,
      sla: 'Standard',
      customerName: 'Ada',
      customerPhone: '08033503068',
      customerEmail: 'a@b.co',
      requestedPickupTime: base.requestedPickupTime,
      customSpec: { description: 'odd shape' },
    });
    expect(payload.customSpec).toEqual({ description: 'odd shape' });
    expect(payload.serviceType).toBeUndefined();
  });
});

describe('apiFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  const jsonOnce = (body: unknown, status = 200) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body }) as never));

  it('unwraps the { data } envelope', async () => {
    jsonOnce({ data: { orders: [1] } });
    await expect(apiFetch('/api/x')).resolves.toEqual({ orders: [1] });
  });

  it('tolerates a bare payload with no envelope', async () => {
    jsonOnce([1, 2, 3]);
    await expect(apiFetch('/api/x')).resolves.toEqual([1, 2, 3]);
  });

  it('throws a typed 404 with the server’s code', async () => {
    jsonOnce({ error: { code: 'NOT_FOUND', message: 'No orders found' } }, 404);
    const err = (await apiFetch('/api/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.isNotFound).toBe(true);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('No orders found');
  });

  it('marks a 429 as rate limited — the login path must not read it as "no orders"', async () => {
    jsonOnce({ error: { code: 'RATE_LIMITED', message: 'Too many lookups' } }, 429);
    const err = (await apiFetch('/api/x').catch((e) => e)) as ApiError;
    expect(err.isRateLimited).toBe(true);
    expect(err.isNotFound).toBe(false);
  });

  it('survives a non-JSON body instead of crashing the view', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }) as never));
    const err = (await apiFetch('/api/x').catch((e) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.message).toContain('502');
  });

  it('reports a transport failure as status 0, keeping the cause', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch'); }));
    const err = (await apiFetch('/api/x').catch((e) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.message).toContain('Failed to fetch');
  });
});
