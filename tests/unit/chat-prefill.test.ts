/**
 * Chat → Order: the customer's answers must survive the handoff.
 *
 * The reported bug, verbatim: "after chatting first i didnt see the font, also
 * the fields are not atomatically filled". The chat had collected every answer —
 * it has to, because the engine refuses to price a service with required fields
 * missing — and the handoff then dropped them: only service_type, quantity and
 * sla travelled. The customer met an empty form and retyped what they had just
 * said. With a font field now required by default, that also blocked the order
 * outright, because a chat screen cannot show the picker.
 *
 * Both halves are pinned here: what `buildChatSpecs` carries, and what
 * `chatOptionSelection` hands to the form.
 *
 * Run: pnpm test tests/unit/chat-prefill.test.ts
 */
import { describe, it, expect } from 'vitest';
import { buildChatSpecs, chatOptionSelection } from '@/lib/chat-prefill';
import type { ServiceOptionShape } from '@/lib/order';

const FONTS = [
  { key: 'fonts', label: 'Font', type: 'font' as const, choices: [{ value: 'Clarendon' }, { value: 'Amarillo' }] },
  { key: 'message', label: 'Message', type: 'text' as const, maxLength: 60 },
];

const STRUCTURED: ServiceOptionShape = { optionFields: FONTS };
const LEGACY: ServiceOptionShape = { options: ['Gold', 'Silver', 'Black'] };

const specs = (over: Record<string, unknown> = {}) => ({
  service_type: 'topper',
  quantity: 1,
  sla: 'Standard' as const,
  ...over,
});

describe('buildChatSpecs — what the handoff carries', () => {
  it('carries the options the assistant collected', () => {
    const s = buildChatSpecs({
      breakdown: { serviceType: 'topper', quantity: 2, sla: 'Express' },
      selected_options: { fonts: 'Clarendon', message: 'Ada & Tunde' },
    });
    expect(s).toMatchObject({
      service_type: 'topper',
      quantity: 2,
      sla: 'Express',
      selected_options: { fonts: 'Clarendon', message: 'Ada & Tunde' },
    });
  });

  it('carries the pickup time, delivery choice and address when the quote has them', () => {
    const s = buildChatSpecs({
      breakdown: { serviceType: 'topper' },
      requested_pickup_time: '2026-12-31T09:00:00.000Z',
      delivery: 'LOCAL_DELIVERY',
      delivery_address: '12 Marina, Lagos',
    });
    expect(s.requested_pickup_time).toBe('2026-12-31T09:00:00.000Z');
    expect(s.delivery).toBe('LOCAL_DELIVERY');
    expect(s.delivery_address).toBe('12 Marina, Lagos');
  });

  it('omits what the quote does not have, rather than inventing it', () => {
    const s = buildChatSpecs({ breakdown: { serviceType: 'topper' } });
    expect(s.selected_options).toBeUndefined();
    expect(s.requested_pickup_time).toBeUndefined();
    expect(s.delivery).toBeUndefined();
    expect(s.delivery_address).toBeUndefined();
    expect(s.quantity).toBe(1);
  });

  it('survives a missing or malformed quote', () => {
    expect(buildChatSpecs(null).service_type).toBeNull();
    expect(buildChatSpecs({}).service_type).toBeNull();
    expect(buildChatSpecs({ breakdown: {} }).sla).toBe('Standard');
    expect(buildChatSpecs({ breakdown: { quantity: 0 } }).quantity).toBe(1);
    expect(buildChatSpecs({ breakdown: { quantity: -3 } }).quantity).toBe(1);
  });

  it('ignores a delivery value it does not recognise', () => {
    expect(buildChatSpecs({ breakdown: {}, delivery: 'DRONE' }).delivery).toBeUndefined();
  });
});

describe('chatOptionSelection — what the form receives', () => {
  it('hands the font and the message to a structured service', () => {
    const r = chatOptionSelection(specs({ selected_options: { fonts: 'Clarendon', message: 'Ada' } }), STRUCTURED);
    expect(r.selectedOptions).toEqual({ fonts: 'Clarendon', message: 'Ada' });
    expect(r.dropped).toEqual([]);
  });

  it('drops keys this service does not have, keeping the rest', () => {
    // A service can be edited between the chat and the form; a stale key would be
    // a 400 the customer cannot act on.
    const r = chatOptionSelection(
      specs({ selected_options: { fonts: 'Clarendon', colour: 'Gold', message: 'Ada' } }),
      STRUCTURED,
    );
    expect(r.selectedOptions).toEqual({ fonts: 'Clarendon', message: 'Ada' });
    expect(r.dropped).toEqual(['colour']);
  });

  it('trims text and caps it at the field limit', () => {
    const r = chatOptionSelection(
      specs({ selected_options: { message: `  ${'x'.repeat(80)}  ` } }),
      STRUCTURED,
    );
    expect(r.selectedOptions?.message).toHaveLength(60);
  });

  it('keeps a whole number as a number the engine accepts', () => {
    const service: ServiceOptionShape = {
      optionFields: [{ key: 'age', label: 'Age', type: 'number', min: 1, max: 100 }],
    };
    expect(chatOptionSelection(specs({ selected_options: { age: '7' } }), service).selectedOptions).toEqual({ age: '7' });
    // A decimal is not a whole number: dropped here, so the form asks for it.
    expect(chatOptionSelection(specs({ selected_options: { age: '7.5' } }), service).selectedOptions).toBeUndefined();
  });

  it('ignores blank values instead of prefilling empty fields', () => {
    const r = chatOptionSelection(specs({ selected_options: { fonts: '   ', message: '' } }), STRUCTURED);
    expect(r.selectedOptions).toBeUndefined();
  });

  it('maps a legacy single choice to the variant the form uses', () => {
    const r = chatOptionSelection(specs({ selected_options: { option: 'Silver' } }), LEGACY);
    expect(r.selectedVariant).toBe('Silver');
    expect(r.selectedOptions).toBeUndefined();
  });

  it('refuses a legacy value the service does not offer', () => {
    const r = chatOptionSelection(specs({ selected_options: { option: 'Chartreuse' } }), LEGACY);
    expect(r.selectedVariant).toBeUndefined();
    expect(r.dropped).toEqual(['option']);
  });

  it('returns nothing to apply when there was nothing to carry', () => {
    expect(chatOptionSelection(specs(), STRUCTURED).selectedOptions).toBeUndefined();
    expect(chatOptionSelection(null, STRUCTURED).dropped).toEqual([]);
    expect(chatOptionSelection(specs({ selected_options: null }), STRUCTURED).dropped).toEqual([]);
    expect(chatOptionSelection(specs({ selected_options: 'nonsense' }), STRUCTURED).dropped).toEqual([]);
  });

  it('does not prefill a service that has no options at all', () => {
    const r = chatOptionSelection(specs({ selected_options: { fonts: 'Clarendon' } }), {});
    expect(r.selectedOptions).toBeUndefined();
    expect(r.selectedVariant).toBeUndefined();
    expect(r.dropped).toEqual(['fonts']);
  });

  it('works when the service itself is unknown (no catalog match)', () => {
    const r = chatOptionSelection(specs({ selected_options: { fonts: 'Clarendon' } }), null);
    expect(r.selectedOptions).toBeUndefined();
    expect(r.dropped).toEqual(['fonts']);
  });
});
