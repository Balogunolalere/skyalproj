/**
 * How the service lists are ordered for a customer.
 *
 * The API returns services in its own order (roughly by price within a brand),
 * which meant a 54-product catalogue arrived as an ungrouped wall: "Acrylic Cake
 * Topper", "Acrylic Cake Topper (Two Layers)", "Plain Cake Topper", "Glitter
 * Topper (Single Layer)", "Glitter Acrylic Topper"… A customer looking for a
 * topper had to read the whole list, and the same list appeared in a different
 * order in the calculator than on the order page.
 *
 * Two rules, applied in one place so every list agrees:
 *   1. Group by category, categories in alphabetical order.
 *   2. Services alphabetical WITHIN each group.
 *
 * Deliberately NOT sorting the whole list alphabetically: a flat A–Z list mixes
 * fabric cutting in with cake toppers, which is worse than the problem.
 */

/** What a customer reads for each category. */
export const CATEGORY_LABELS: Record<string, string> = {
  FABRIC_CUTTING: 'Fabric Cutting',
  ENGRAVING: 'Engraving',
  SHEET_CUTTING: 'Sheet Cutting',
  ADD_ON: 'Add-ons',
};

export interface ServiceGroup<T> {
  category: string;
  /** The label a customer reads, falling back to the raw category. */
  label: string;
  services: T[];
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.replace(/_/g, ' ');
}

/**
 * Group and order the services a customer chooses between.
 *
 * Comparison is `localeCompare` with numeric collation, so "Dozen … (2)" sorts
 * next to "Dozen … (1)" rather than after "(10)", and case never decides order.
 */
export function groupServices<T extends { category: string; label: string }>(
  services: T[] | null | undefined,
): ServiceGroup<T>[] {
  const byCategory = new Map<string, T[]>();

  for (const service of services ?? []) {
    const key = service.category || '';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(service);
  }

  return Array.from(byCategory.entries())
    .map(([category, list]) => ({
      category,
      label: categoryLabel(category),
      services: [...list].sort((a, b) => compare(a.label, b.label)),
    }))
    .sort((a, b) => compare(a.label, b.label));
}

/**
 * One comparison for every list, so ordering cannot drift between screens.
 *
 * Trimmed first: a label typed into the admin form can carry a stray leading
 * space, and `sensitivity: 'base'` ignores case but NOT whitespace — so
 * " Apple" would sort away from "Apple" and a service would appear to have
 * vanished from where the customer expects it.
 *
 * `numeric` so "Dozen Cupcake Toppers (2)" sorts before "(10)" rather than
 * after it, which is what text comparison would do.
 */
export function compare(a: string, b: string): number {
  return String(a ?? '').trim().localeCompare(String(b ?? '').trim(), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/** Services alphabetical, ignoring category — for a flat picker that has no groups. */
export function sortServices<T extends { label: string }>(services: T[] | null | undefined): T[] {
  return [...(services ?? [])].sort((a, b) => compare(a.label, b.label));
}
