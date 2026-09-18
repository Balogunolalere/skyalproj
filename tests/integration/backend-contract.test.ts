/**
 * Backend contract check for the ORDERING flow — run against the REAL admin API.
 *
 * Unit tests prove the pure logic; this proves the thing that actually breaks in
 * production: that the payloads this app builds are accepted by the backend, and
 * that the responses contain the fields the views read. It uses the app's own
 * builders (`buildQuotePayload`, `buildOrderPayload`, `defaultPickupISO`), so a
 * drift on either side fails here rather than in front of a customer.
 *
 * SKIPPED BY DEFAULT (CI must not create orders). Run explicitly:
 *
 *   BACKEND_CONTRACT=1 npx vitest run tests/integration/backend-contract.test.ts
 *
 * It creates ONE unpaid order, exercises payment initialization, then CANCELS it
 * through the customer path (the state machine, so the timeline records it), and
 * checks a few rejections. Nothing is left behind but a cancelled test order.
 */
import { describe, it, expect } from 'vitest';
import {
  buildQuotePayload,
  buildOrderPayload,
  defaultPickupISO,
  pickupTierPct,
  isValidNigerianPhone,
} from '@/lib/order';
import { DEFAULT_BUSINESS_CALENDAR } from '@/lib/business-calendar';

const API = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';
/** A number that is valid but obviously synthetic, so the test order is findable. */
const TEST_PHONE = '08099999999';
const TEST_NAME = 'CONTRACT TEST — safe to cancel';

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: any; data: T | undefined }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, data: body?.data };
}

const run = describe.skipIf(!process.env.BACKEND_CONTRACT);

run('backend contract — ordering', () => {
  let orderNumber = '';
  let serviceType = '';
  let totalAmount = 0;

  it('serves the service catalog in the shape the order form reads', async () => {
    const { status, data } = await call<any[]>('/api/services?brand=SKYAL');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect((data || []).length).toBeGreaterThan(0);

    const priced = (data || []).filter((s) => s.isActive !== false && s.basePriceNaira > 0);
    expect(priced.length).toBeGreaterThan(0);
    // The form needs these to render a priced row.
    const sample = priced[0];
    expect(sample).toHaveProperty('type');
    expect(sample).toHaveProperty('label');
    expect(typeof sample.basePriceNaira).toBe('number');
    // Options may be the legacy array or the structured fields — but if fields
    // exist, each needs the keys the option renderer uses.
    for (const field of sample.optionFields || []) {
      expect(field).toHaveProperty('key');
      expect(field).toHaveProperty('label');
      expect(['dropdown', 'text', 'textarea', 'number']).toContain(field.type);
    }
    serviceType = sample.type;
  });

  it('prices a quote from the payload this app builds', async () => {
    const requestedPickupTime = defaultPickupISO(Date.now(), DEFAULT_BUSINESS_CALENDAR);
    const payload = buildQuotePayload({
      serviceType,
      quantity: 1,
      sla: 'Standard',
      requestedPickupTime,
    });
    const { status, data } = await call<any>('/api/services/quote', { method: 'POST', body: JSON.stringify(payload) });

    expect(status, JSON.stringify(data)).toBe(200);

    // The exact shape the views read: `quoteNaira` for the headline price and
    // `breakdown` for the detail rows (OrderView reads breakdown.leadTime,
    // AvailabilityLine reads availability).
    expect(typeof data.quoteNaira).toBe('number');
    expect(data.quoteNaira).toBeGreaterThan(0);
    expect(data.breakdown).toBeTruthy();
    expect(data.breakdown.finalPriceNaira).toBe(data.quoteNaira); // the two must agree
    expect(data.breakdown.serviceLabel).toBeTruthy();
    expect(data.breakdown.expressTier).toBeTruthy();
    expect(typeof data.breakdown.deliveryFee).toBe('number');
    expect(data.breakdown.discount).toBeGreaterThanOrEqual(0);
    // The discount can never exceed the pre-discount total (the money floor).
    expect(data.breakdown.discount).toBeLessThanOrEqual(
      data.breakdown.subtotal + data.breakdown.expressSurcharge + data.breakdown.addOnsTotal,
    );
    // A saved snapshot is what lets the dashboard offer "accept this quote at
    // this price" — the id and number must be present when it was saved.
    if (data.quoteId) expect(data.quoteNumber).toBeTruthy();

    // The tier this app predicts must be the tier the backend charged.
    const predicted = pickupTierPct(requestedPickupTime, Date.now(), DEFAULT_BUSINESS_CALENDAR);
    const expectedTier = predicted === 1 ? 'SAME_DAY_URGENT' : predicted === 0.5 ? 'SAME_DAY' : predicted === 0.25 ? 'RUSH' : 'STANDARD';
    expect(data.breakdown.expressTier).toBe(expectedTier);
  });

  it('rejects a weekend pickup with the code the form expects', async () => {
    // The next Saturday, inside working hours, so the weekday is the only reason.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
    const saturday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 0, 0)).toISOString();
    const { status, body } = await call('/api/services/quote', {
      method: 'POST',
      body: JSON.stringify(buildQuotePayload({ serviceType, quantity: 1, sla: 'Standard', requestedPickupTime: saturday })),
    });
    expect(status).toBe(400);
    expect(['INVALID_PICKUP_TIME', 'REQUESTED_PICKUP_REQUIRED']).toContain(body?.error?.code);
  });

  it('rejects a missing pickup time rather than guessing one', async () => {
    const { status, body } = await call('/api/services/quote', {
      method: 'POST',
      body: JSON.stringify({ brand: 'SKYAL', serviceType, quantity: 1, sla: 'Standard' }),
    });
    expect(status).toBe(400);
    expect(body?.error?.code).toBe('REQUESTED_PICKUP_REQUIRED');
  });

  it('rejects an invalid phone with INVALID_PHONE (the bug the payload fix addressed)', async () => {
    const { status, body } = await call('/api/orders', {
      method: 'POST',
      body: JSON.stringify(
        buildOrderPayload({
          quantity: 1,
          sla: 'Standard',
          customerName: TEST_NAME,
          customerPhone: '1234567',
          customerEmail: '',
          requestedPickupTime: defaultPickupISO(),
          serviceType,
        }),
      ),
    });
    expect(status).toBe(400);
    expect(body?.error?.code).toBe('INVALID_PHONE');
  });

  it('accepts the phone format a customer actually types, after normalisation', () => {
    // The client strips separators before validating; the payload must send the
    // normalised value or the backend refuses a leading paren.
    expect(isValidNigerianPhone('(0803) 350 3068')).toBe(true);
    const payload = buildOrderPayload({
      quantity: 1,
      sla: 'Standard',
      customerName: TEST_NAME,
      customerPhone: '(0803) 350 3068',
      customerEmail: '',
      requestedPickupTime: defaultPickupISO(),
      serviceType,
    });
    expect(payload.customerPhone).toBe('08033503068');
  });

  it('creates an order from the payload this app builds', async () => {
    const requestedPickupTime = defaultPickupISO();
    const payload = buildOrderPayload({
      quantity: 1,
      sla: 'Standard',
      customerName: TEST_NAME,
      customerPhone: TEST_PHONE,
      customerEmail: '',
      requestedPickupTime,
      serviceType,
      deliveryMethod: 'PICKUP',
    });
    const { status, data, body } = await call<any>('/api/orders', { method: 'POST', body: JSON.stringify(payload) });

    expect(status, JSON.stringify(body)).toBe(201);
    expect(data.orderNumber).toMatch(/^SKY-/);
    expect(data.state).toBe('PAYMENT_PENDING');
    expect(typeof data.totalAmount).toBe('number');
    expect(data.totalAmount).toBeGreaterThan(0);
    // The pickup time the customer chose must survive the round trip.
    expect(new Date(data.requestedPickupTime).toISOString()).toBe(requestedPickupTime);

    orderNumber = data.orderNumber;
    totalAmount = data.totalAmount;
  });

  it('returns it from the public tracker by order id', async () => {
    const { status, data } = await call<any>(`/api/orders?id=${encodeURIComponent(orderNumber)}&brand=SKYAL`);
    expect(status).toBe(200);
    expect(data.orderNumber).toBe(orderNumber);
    expect(data.state).toBe('PAYMENT_PENDING');
  });

  it('finds it through the customer login (magic-link) for that phone', async () => {
    const { status, data } = await call<any>('/api/magic-link', {
      method: 'POST',
      body: JSON.stringify({ phone: TEST_PHONE, brand: 'SKYAL' }),
    });
    expect(status).toBe(200);
    const numbers = (data.orders || []).map((o: any) => o.orderNumber);
    expect(numbers).toContain(orderNumber);
  });

  it('initializes a Paystack checkout for it', async () => {
    const { status, data, body } = await call<any>('/api/payment/initialize', {
      method: 'POST',
      body: JSON.stringify({
        amount: totalAmount, // the frontend sends Naira; the server charges its own total
        email: 'contract-test@example.com',
        orderNumber,
        brand: 'SKYAL',
      }),
    });
    expect(status, JSON.stringify(body)).toBe(200);
    expect(typeof data.authorizationUrl).toBe('string');
    expect(data.authorizationUrl).toMatch(/^https:\/\//);
    expect(typeof data.reference).toBe('string');
  });

  it('cancels the test order through the customer path so nothing is left behind', async () => {
    const { status, body } = await call(`/api/orders/${encodeURIComponent(orderNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel', customerPhone: TEST_PHONE, reason: 'Automated contract test' }),
    });
    expect(status, JSON.stringify(body)).toBe(200);

    const after = await call<any>(`/api/orders?id=${encodeURIComponent(orderNumber)}&brand=SKYAL`);
    expect(after.data.state).toBe('CANCELLED');
  });

  it('refuses a cancel on an order that is not ours', async () => {
    const { status } = await call(`/api/orders/${encodeURIComponent(orderNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'cancel', customerPhone: '08011111111' }),
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
