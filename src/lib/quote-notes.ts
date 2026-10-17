/**
 * The quote breakdown's notes, as a list.
 *
 * The engine explains its own price — "Minimum charge of ₦20,000 applied",
 * "Ordered outside working hours — production is scheduled to start at the next
 * opening", "Customer brings the item/fabric. No material charge". The type said
 * `string` while the API returns an ARRAY, so nothing could ever read them and
 * every explanation was dropped.
 *
 * That made a minimum-charge order look like a calculation error: "Custom Fabric
 * Cutting" bills ₦10,000 of lines against a ₦20,000 total, with nothing on the
 * page saying why.
 *
 * Tolerant of a single string so an older or odd payload cannot blank the price
 * panel, and blanks are dropped so a stray empty note does not render a bullet.
 */
export function noteList(notes: string[] | string | null | undefined): string[] {
  if (!notes) return [];
  return (Array.isArray(notes) ? notes : [notes])
    .map((n) => String(n ?? '').trim())
    // `filter(Boolean)` alone is not enough: "   " is TRUTHY, so a whitespace-only
    // note would render an empty bullet point.
    .filter((n) => n.length > 0);
}
