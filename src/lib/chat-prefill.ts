/**
 * Chat → Order handoff: what the assistant already knows must reach the form.
 *
 * The chat collects service, quantity, SLA, options and often the pickup time —
 * it HAS to, because the pricing engine refuses to price a service whose required
 * fields are missing. But the handoff used to carry only service_type, quantity
 * and sla, so a customer who answered every question in chat met an empty form and
 * retyped it. Once a font field became required by default, that also meant a
 * blocked order: the picker cannot be satisfied from a chat screen.
 *
 * Two halves, tested together:
 *   buildChatSpecs(quote)            — what travels (the options included)
 *   chatOptionSelection(specs, svc)  — what the form does with it
 */

import type { ChatSpecs } from '@/lib/chat';
import type { OptionField, ServiceOptionShape } from '@/lib/order';

/** The specs to hand off, built from a priced chat quote. */
export function buildChatSpecs(quote: Record<string, unknown> | null | undefined): ChatSpecs {
  const b = (quote?.breakdown || {}) as Record<string, unknown>;
  const specs: ChatSpecs = {
    service_type: typeof b.serviceType === 'string' ? b.serviceType : null,
    quantity: typeof b.quantity === 'number' && b.quantity > 0 ? b.quantity : 1,
    sla: b.sla === 'Express' ? 'Express' : 'Standard',
  };
  if (quote?.selected_options && typeof quote.selected_options === 'object') {
    specs.selected_options = quote.selected_options as Record<string, string>;
  }
  if (typeof quote?.requested_pickup_time === 'string') specs.requested_pickup_time = quote.requested_pickup_time;
  if (quote?.delivery === 'LOCAL_DELIVERY' || quote?.delivery === 'PICKUP') specs.delivery = quote.delivery;
  if (typeof quote?.delivery_address === 'string') specs.delivery_address = quote.delivery_address;
  return specs;
}

export interface ChatOptionSelection {
  /** Structured fields, normalized to the values the engine accepts. */
  selectedOptions?: Record<string, string>;
  /** Legacy single choice, for services with a flat `options` list. */
  selectedVariant?: string;
  /** Keys the model sent that this service does not offer (diagnostics, tests). */
  dropped: string[];
}

/**
 * The customer's option values as the order form should receive them.
 *
 * Keys the chosen service does not have are dropped rather than carried: a
 * service can be re-edited between the chat and the form, and the engine matches
 * field keys EXACTLY — a stale key would be a 400 the customer cannot act on.
 */
/**
 * Values the form can actually submit: trimmed, text capped at the field's limit,
 * and a number coerced to a whole one because the engine insists on integers.
 *
 * A value that does not fit its field is deliberately KEPT, not dropped — the
 * option block shows "must be one of the listed options" and the customer can fix
 * it. Silently discarding an answer they already gave is what made the chat feel
 * like it had been ignored.
 */
function normalizeSelection(fields: OptionField[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    if (!text) continue;
    if (field.type === 'number') {
      const n = Number(text);
      if (!Number.isInteger(n)) continue;
      out[field.key] = String(n);
      continue;
    }
    out[field.key] = typeof field.maxLength === 'number' ? text.slice(0, field.maxLength) : text;
  }
  return out;
}

export function chatOptionSelection(
  specs: ChatSpecs | null | undefined,
  service: ServiceOptionShape | null | undefined,
): ChatOptionSelection {
  const incoming = specs?.selected_options;
  if (!incoming || typeof incoming !== 'object') return { dropped: [] };

  const structured: OptionField[] = service?.optionFields ?? [];
  if (structured.length > 0) {
    const known = new Set(structured.map((f) => f.key));
    const kept: Record<string, string> = {};
    const dropped: string[] = [];
    for (const [key, value] of Object.entries(incoming)) {
      if (!known.has(key)) { dropped.push(key); continue; }
      if (value === undefined || value === null || String(value).trim() === '') continue;
      kept[key] = value;
    }
    const normalized = normalizeSelection(structured, kept);
    return Object.keys(normalized).length > 0 ? { selectedOptions: normalized, dropped } : { dropped };
  }

  const legacy = service?.options ?? [];
  if (legacy.length > 0) {
    const pick = incoming.option;
    if (typeof pick === 'string' && legacy.includes(pick)) return { selectedVariant: pick, dropped: [] };
    return { dropped: pick === undefined ? [] : ['option'] };
  }

  return { dropped: Object.keys(incoming) };
}
