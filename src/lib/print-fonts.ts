/**
 * The fonts we can cut — the customer-facing half.
 *
 * ⚠️ MIRROR of the admin backend's `src/lib/print-fonts.ts` (the canonical list
 * that validation runs against) and of paberin's copy. Same pattern as
 * business-calendar.ts: three repos, one list, and a drift has to fail a test
 * rather than surprise a customer. `tests/unit/print-fonts.test.ts` pins the
 * names, and the backend rejects any name that is not on its list — so a drift
 * shows up as a 400 the moment it matters, never as a silent wrong preview.
 *
 * The real typefaces are commercial and are not shipped here. Each `styles` stack
 * leads with the real family and falls back to a free near-equivalent, so:
 *   - drop the file into `public/fonts/<file>` and the preview becomes exact,
 *     with no code change (see `docs` in the README section of this file), and
 *   - until then the customer still sees script vs slab vs handwritten, instead
 *     of one generic font pretending to be ten.
 */

export interface PrintFont {
  /** Canonical name: what the customer picks and the order records. */
  name: string;
  /**
   * The real typeface this label stands for — the operator's reference. The
   * customer picks "FONT A"; whoever loads the file in the laser software needs
   * to know that means Amarillo. Shown on the order, never to the customer.
   */
  ownerSpelling?: string;
  /** Expected file in `public/fonts/` for an exact preview. */
  file: string;
  /** CSS `font-family` stack: the real face first, free fallbacks after. */
  styles: string;
}

export const PRINT_FONTS: PrintFont[] = [
  { name: 'FONT A', ownerSpelling: 'Amarillo', file: 'FontA.woff2', styles: "'FontA', 'Allura', cursive" },
  { name: 'FONT B', ownerSpelling: 'Amarylli Blossom', file: 'FontB.woff2', styles: "'FontB', 'Great Vibes', cursive" },
  { name: 'FONT C', ownerSpelling: 'Athena of the Ocean', file: 'FontC.woff2', styles: "'FontC', 'Alex Brush', cursive" },
  { name: 'FONT D', ownerSpelling: 'Baby Valentina', file: 'FontD.woff2', styles: "'FontD', 'Kaushan Script', cursive" },
  { name: 'FONT E', ownerSpelling: 'Clarendon', file: 'FontE.woff2', styles: "'FontE', 'Besley', serif" },
  { name: 'FONT F', ownerSpelling: 'Gabriola', file: 'FontF.woff2', styles: "'FontF', 'Cormorant Garamond', serif" },
  { name: 'FONT G', ownerSpelling: 'Lavanderia Sturdy', file: 'FontG.woff2', styles: "'FontG', 'Yellowtail', cursive" },
  { name: 'FONT H', ownerSpelling: 'Samantha Upright', file: 'FontH.woff2', styles: "'FontH', 'Great Vibes', cursive" },
  { name: 'FONT I', ownerSpelling: 'Style Script', file: 'FontI.woff2', styles: "'FontI', 'Style Script', cursive" },
  { name: 'FONT J', ownerSpelling: 'Sunshine', file: 'FontJ.woff2', styles: "'FontJ', 'Courgette', cursive" },
  { name: 'FONT K', ownerSpelling: 'White Dream', file: 'FontK.woff2', styles: "'FontK', 'Parisienne', cursive" },
];

/** Free families used in the preview until the real files are supplied. */
export const PREVIEW_FALLBACK_FAMILIES: string[] = [
  'Allura',
  'Great Vibes',
  'Alex Brush',
  'Kaushan Script',
  'Besley',
  'Cormorant Garamond',
  'Yellowtail',
  'Style Script',
  'Courgette',
  'Parisienne',
];

/**
 * The list in force on this page: the built-in ten until the shop's own catalogue
 * arrives from the API, then whatever it says.
 *
 * The catalogue is data now (`print_fonts` setting, editable in the admin), so a
 * font added there must render with ITS preview stack — not fall back to the site
 * font just because this file has never heard of it.
 */
let liveFonts: PrintFont[] = PRINT_FONTS;

export function setLiveFonts(fonts: PrintFont[] | null | undefined): void {
  liveFonts = Array.isArray(fonts) && fonts.length > 0 ? fonts : PRINT_FONTS;
}

export function knownFonts(): PrintFont[] {
  return liveFonts;
}

/** The stack to render a font name with; unknown names inherit the site font. */
export function fontStack(name: string | undefined | null): string {
  const font = liveFonts.find((f) => f.name === name) ?? PRINT_FONTS.find((f) => f.name === name);
  return font ? font.styles : 'inherit';
}

/**
 * One stylesheet for every fallback family. Loaded only when a service actually
 * offers fonts — a customer ordering a plain cut downloads none of this.
 */
export function previewStylesheetHref(): string {
  // No weight axis: these are single-weight display faces, and asking for an
  // axis a family does not have makes Google return 400 — which would take the
  // whole stylesheet down, not just that font.
  const families = PREVIEW_FALLBACK_FAMILIES.map((f) => `family=${f.replace(/ /g, '+')}`).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/** Words the preview shows when the customer has not typed their text yet. */
export const PREVIEW_SAMPLE = 'Happy Birthday';

/**
 * The text to preview in the chosen font: whatever the customer has typed into
 * the service's first text field, so the preview is the real thing, and a sample
 * while that field is still empty.
 */
export function previewTextFor(
  fields: Array<{ key: string; type: string }> | null | undefined,
  values: Record<string, string | number>,
): string {
  for (const field of fields ?? []) {
    if (field.type !== 'text' && field.type !== 'textarea') continue;
    // Options are held as strings or numbers depending on the form; only text
    // fields can feed the preview, and those are always strings.
    const typed = String(values[field.key] ?? '').trim();
    if (typed) return typed;
  }
  return PREVIEW_SAMPLE;
}
