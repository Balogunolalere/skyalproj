/**
 * Chat → Order handoff helpers (Skyal).
 *
 * The chat assistant extracts a structured [SPECS] block; the order form
 * receives it through the SPA handoff ({ specs, custom, context }). Mapping a
 * spec to a catalog service is now EXACT (service_type keys are validated
 * against the catalog server-side) — the old fuzzy/category matching
 * (`matchChatQuoteToService`) was retired because it silently mis-priced
 * bespoke jobs.
 *
 * Ported from the Paberin codebase (src/lib/chat-order.ts) with Skyal's
 * catalog service types.
 */

import type { ChatSpecs } from '@/lib/chat';

/**
 * Build the customerNotes prefill from the chat specs + the customer's own
 * words, so the order form carries the full AI conversation context.
 */
export function buildChatOrderNotes(specs: ChatSpecs | null | undefined, context?: string | null): string {
  if (!specs) return '';
  const parts: string[] = [];
  const ctx = (context || '').trim();
  if (ctx) parts.push(`Customer request: ${ctx}`);
  if (specs.custom_description) parts.push(`Custom job: ${specs.custom_description}`);
  if (specs.material) parts.push(`Material: ${specs.material}`);
  if (specs.sla === 'Express') parts.push('Express service requested');
  if (specs.delivery === 'LOCAL_DELIVERY' && specs.delivery_address) parts.push(`Delivery to: ${specs.delivery_address}`);
  return parts.join('. ').slice(0, 600);
}
