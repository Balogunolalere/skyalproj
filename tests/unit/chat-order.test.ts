import { describe, expect, test, beforeAll } from 'vitest'
import { matchChatQuoteToService, buildChatOrderNotes } from '@/lib/chat-order'
import type { Service } from '@/lib/chat-order'
import type { ChatQuote } from '@/lib/chat'
import servicesFixture from './fixtures/skyal-services.json'

/**
 * Fixture mirroring the LIVE admin catalog — fetched once from
 * https://skyalxpaberin-admin.vercel.app/api/services?brand=SKYAL and
 * snapshotted into tests/unit/fixtures/skyal-services.json (31 services:
 * fabric_sleeves, fabric_buba, fabric_wrapper, engraving_phone,
 * acrylic_stick_cutting, skyal_topper_acrylic, skyal_topper_custom,
 * sheet_cutting_inhouse, sheet_cutting_8x4, metal_cutting_external, …).
 * The AI prompt's item vocabulary ("Full Buba", "Acrylic Cake Topper", …)
 * does NOT always match these type keys — that mismatch is exactly what
 * this module resolves.
 */
const SERVICES: Service[] = servicesFixture as Service[]

function quote(overrides: Partial<ChatQuote> = {}): ChatQuote {
  const base: ChatQuote = {
    price: 105000,
    original_price: undefined,
    bulk_discount: undefined,
    breakdown: {
      serviceLabel: 'Full Buba',
      serviceType: 'fabric_buba',
      sla: 'Standard',
      leadTime: '5 working days',
      basePrice: 35000,
      expressSurcharge: 0,
      addOnsTotal: 0,
      discount: 0,
      deliveryFee: 0,
      finalPriceNaira: 105000,
      quantity: 3,
    },
    summary: 'Full Buba: 3× ₦35,000 = ₦105,000. 5 working days',
  }
  return {
    ...base,
    ...overrides,
    breakdown: { ...base.breakdown, ...(overrides.breakdown ?? {}) },
  }
}

describe('matchChatQuoteToService', () => {
  test('matches an exact service type (fabric_buba → fabric_buba)', () => {
    const q = quote({ breakdown: { serviceType: 'fabric_buba', serviceLabel: 'Full Buba' } })
    const { service, mapped, reason } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('fabric_buba')
    expect(mapped).toBe(false)
    expect(reason).toBe('exact service type match')
  })

  test('matches an exact catalog label (Acrylic Cake Topper (Skyal))', () => {
    const q = quote({ breakdown: { serviceLabel: 'Acrylic Cake Topper (Skyal)', serviceType: 'cake_topper' } })
    const { service, mapped } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('skyal_topper_acrylic')
    expect(mapped).toBe(false)
  })

  test('matches Custom Cake Topper via category keyword refinement', () => {
    const q = quote({ breakdown: { serviceLabel: 'Custom Cake Topper', serviceType: 'cake_topper_custom' } })
    const { service, mapped } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('skyal_topper_custom')
    expect(mapped).toBe(true)
  })

  test('maps garment items (sleeves, wrapper, boubou) to their fabric services', () => {
    const cases: Array<[string, string, string]> = [
      ['Sleeves (pair)', 'fabric_cutting', 'fabric_sleeves'],
      ['Bottom of Wrapper', 'fabric_cutting', 'fabric_wrapper'],
      ['Boubou', 'fabric_cutting', 'fabric_boubou'],
      ['Full Buba + Full Wrapper', 'fabric_set', 'fabric_buba_wrapper'],
      ['Wedding skirt for aso-ebi', 'fabric_cutting', 'fabric_skirt'],
    ]
    for (const [label, type, expected] of cases) {
      const q = quote({ breakdown: { serviceLabel: label, serviceType: type } })
      const { service } = matchChatQuoteToService(q, SERVICES)
      expect(service?.type).toBe(expected)
    }
  })

  test('maps Phone Back Engraving to engraving_phone', () => {
    const q = quote({ breakdown: { serviceLabel: 'Phone Back Engraving', serviceType: 'phone_engraving' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('engraving_phone')
  })

  test('maps Leather Engraving to engraving_leather', () => {
    const q = quote({ breakdown: { serviceLabel: 'Leather Engraving', serviceType: 'leather_engraving' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('engraving_leather')
  })

  test('maps Acrylic Stick Cutting to acrylic_stick_cutting', () => {
    const q = quote({ breakdown: { serviceLabel: 'Acrylic Stick Cutting', serviceType: 'acrylic_stick_cutting' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('acrylic_stick_cutting')
  })

  test('maps sheet/signage to a sheet cutting service', () => {
    const q = quote({ breakdown: { serviceLabel: 'Acrylic Signage 4x4', serviceType: 'sheet_cutting' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(['sheet_cutting_inhouse', 'sheet_cutting_custom', 'sheet_cutting_8x4']).toContain(service?.type)
  })

  test('maps metal cutting to the external metal partner service', () => {
    const q = quote({ breakdown: { serviceLabel: 'Metal Cutting', serviceType: 'metal_cutting' } })
    const { service } = matchChatQuoteToService(q, SERVICES)
    expect(service?.type).toBe('metal_cutting_external')
  })

  test('returns null when nothing matches', () => {
    const q = quote({ breakdown: { serviceLabel: 'Quantum Laser Sculpture', serviceType: 'quantum' } })
    const { service, mapped } = matchChatQuoteToService(q, SERVICES)
    expect(service).toBeNull()
    expect(mapped).toBe(false)
  })

  test('returns null for empty quote/catalog', () => {
    expect(matchChatQuoteToService(null, SERVICES).service).toBeNull()
    expect(matchChatQuoteToService(quote(), []).service).toBeNull()
  })
})

describe('buildChatOrderNotes', () => {
  test('includes the customer request, summary, SLA and lead time', () => {
    const q = quote({
      breakdown: {
        sla: 'Express',
        leadTime: '48 hours minimum',
        notes: 'Customer brings fabric',
      },
    })
    const notes = buildChatOrderNotes(q, 'I need 3 full bubas for my wedding, express please')
    expect(notes).toContain('Customer request: I need 3 full bubas')
    expect(notes).toContain('₦105,000')
    expect(notes).toContain('Express service requested (+50%)')
    expect(notes).toContain('Lead time: 48 hours minimum')
    expect(notes).toContain('Customer brings fabric')
  })

  test('handles missing context', () => {
    const notes = buildChatOrderNotes(quote(), null)
    expect(notes).toContain('Full Buba: 3×')
    expect(notes).not.toContain('Customer request')
  })

  test('returns empty for no quote', () => {
    expect(buildChatOrderNotes(null, 'x')).toBe('')
  })
})
