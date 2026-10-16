/**
 * How the service list is ordered for a customer.
 *
 * The API returns services in its own order, so a 54-product catalogue arrived
 * as an ungrouped wall — "Acrylic Cake Topper", "Acrylic Cake Topper (Two
 * Layers)", "Plain Cake Topper", "Glitter Topper (Single Layer)", "Glitter
 * Acrylic Topper"… — and the same list came out in a DIFFERENT order in the
 * calculator than on the order page. A customer had to read the whole thing.
 *
 * These tests pin the two rules, and the reasons they are the two rules:
 * groups are alphabetical, services are alphabetical within, and the whole
 * list is NOT flattened A–Z (which would mix fabric cutting in with toppers).
 */
import { describe, it, expect } from 'vitest';
import { categoryLabel, compare, groupServices, sortServices } from '@/lib/service-groups';

const svc = (category: string, label: string) => ({ category, label, type: label.toLowerCase() });

describe('groupServices — categories alphabetical, services alphabetical within', () => {
  it('orders the groups alphabetically by the label a customer reads', () => {
    const groups = groupServices([
      svc('SHEET_CUTTING', 'Sheet Cutting'),
      svc('ADD_ON', 'A Topper'),
      svc('ENGRAVING', 'An Engraving'),
      svc('FABRIC_CUTTING', 'Fabric'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Add-ons', 'Engraving', 'Fabric Cutting', 'Sheet Cutting']);
  });

  it('orders the services INSIDE a group alphabetically', () => {
    const groups = groupServices([
      svc('ADD_ON', 'Plain Cake Topper'),
      svc('ADD_ON', 'Acrylic Cake Topper'),
      svc('ADD_ON', 'Glitter Topper'),
    ]);
    expect(groups[0].services.map((s) => s.label)).toEqual([
      'Acrylic Cake Topper', 'Glitter Topper', 'Plain Cake Topper',
    ]);
  });

  it('does NOT flatten everything into one A–Z list', () => {
    // The reason we group at all: a flat list mixes fabric cutting with toppers.
    const groups = groupServices([svc('FABRIC_CUTTING', 'Aardvark Cutting'), svc('ADD_ON', 'Zebra Topper')]);
    expect(groups.map((g) => g.label)).toEqual(['Add-ons', 'Fabric Cutting']);
    expect(groups[0].services[0].label).toBe('Zebra Topper');
  });

  it('keeps every service — grouping never drops one', () => {
    const input = [svc('ADD_ON', 'b'), svc('ADD_ON', 'a'), svc('ENGRAVING', 'c')];
    const total = groupServices(input).reduce((n, g) => n + g.services.length, 0);
    expect(total).toBe(input.length);
  });

  it('ignores case when sorting, so "apple" and "Banana" interleave sensibly', () => {
    const groups = groupServices([svc('ADD_ON', 'banana'), svc('ADD_ON', 'Apple')]);
    expect(groups[0].services.map((s) => s.label)).toEqual(['Apple', 'banana']);
  });

  it('sorts numbers as numbers, not as text', () => {
    // "Dozen Cupcake Toppers (10)" must not sort before "(2)".
    const groups = groupServices([
      svc('ADD_ON', 'Dozen Cupcake Toppers (10)'),
      svc('ADD_ON', 'Dozen Cupcake Toppers (2)'),
    ]);
    expect(groups[0].services.map((s) => s.label)).toEqual([
      'Dozen Cupcake Toppers (2)', 'Dozen Cupcake Toppers (10)',
    ]);
  });

  it('handles an empty or missing list', () => {
    expect(groupServices([])).toEqual([]);
    expect(groupServices(null)).toEqual([]);
    expect(groupServices(undefined)).toEqual([]);
  });

  it('shows a category it has no label for, rather than hiding the services', () => {
    const groups = groupServices([svc('NEW_CATEGORY', 'Something')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('NEW CATEGORY');
  });
});

describe('categoryLabel', () => {
  it('uses the customer-facing name', () => {
    expect(categoryLabel('ADD_ON')).toBe('Add-ons');
    expect(categoryLabel('FABRIC_CUTTING')).toBe('Fabric Cutting');
  });
  it('falls back to a readable form of an unknown category', () => {
    expect(categoryLabel('SOME_NEW_THING')).toBe('SOME NEW THING');
  });
});

describe('sortServices — for a picker with no groups', () => {
  it('sorts by label', () => {
    expect(sortServices([svc('ADD_ON', 'C'), svc('ENGRAVING', 'A'), svc('ADD_ON', 'B')]).map((s) => s.label))
      .toEqual(['A', 'B', 'C']);
  });
});

describe('compare', () => {
  it('never lets case or a leading space decide the order', () => {
    expect(compare('Apple', 'apple')).toBe(0);
    expect(compare(' Apple', 'Apple')).toBe(0);
  });
  it('is stable for identical labels', () => {
    expect(compare('Same', 'Same')).toBe(0);
  });
});
