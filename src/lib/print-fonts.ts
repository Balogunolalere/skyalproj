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
  /** Expected file in `public/fonts/` for an exact preview. */
  file: string;
  /** CSS `font-family` stack: the real face first, free fallbacks after. */
  styles: string;
}

export const PRINT_FONTS: PrintFont[] = [
  {
    name: 'Samantha Upright PRO W05',
    file: 'SamanthaUprightPROW05.woff2',
    styles: "'Samantha Upright PRO W05', 'Great Vibes', cursive",
  },
  { name: 'Style Script', file: 'StyleScript.woff2', styles: "'Style Script', cursive" },
  {
    name: 'Lavanderia Sturdy',
    file: 'LavanderiaSturdy.woff2',
    styles: "'Lavanderia Sturdy', 'Yellowtail', cursive",
  },
  {
    name: 'Athena of the Ocean',
    file: 'AthenaOfTheOcean.woff2',
    styles: "'Athena of the Ocean', 'Alex Brush', cursive",
  },
  { name: 'Amarillo', file: 'Amarillo.woff2', styles: "'Amarillo', 'Satisfy', cursive" },
  { name: 'Sunshine', file: 'Sunshine.woff2', styles: "'Sunshine', 'Pacifico', cursive" },
  {
    name: 'White Dream',
    file: 'WhiteDream.woff2',
    styles: "'White Dream', 'Dancing Script', cursive",
  },
  { name: 'Gabriola', file: 'Gabriola.woff2', styles: "'Gabriola', 'Cormorant Garamond', serif" },
  { name: 'Clarendon', file: 'Clarendon.woff2', styles: "'Clarendon', 'Zilla Slab', serif" },
  {
    name: 'Baby Valentina',
    file: 'BabyValentina.woff2',
    styles: "'Baby Valentina', 'Kaushan Script', cursive",
  },
];

/** Free families used in the preview until the real files are supplied. */
export const PREVIEW_FALLBACK_FAMILIES: string[] = [
  'Great Vibes',
  'Style Script',
  'Yellowtail',
  'Alex Brush',
  'Satisfy',
  'Pacifico',
  'Dancing Script',
  'Cormorant Garamond',
  'Zilla Slab',
  'Kaushan Script',
];

/** The stack to render a font name with; unknown names inherit the site font. */
export function fontStack(name: string | undefined | null): string {
  const font = PRINT_FONTS.find((f) => f.name === name);
  return font ? font.styles : 'inherit';
}

/**
 * One stylesheet for every fallback family. Loaded only when a service actually
 * offers fonts — a customer ordering a plain cut downloads none of this.
 */
export function previewStylesheetHref(): string {
  const families = PREVIEW_FALLBACK_FAMILIES.map(
    (f) => `family=${f.replace(/ /g, '+')}:wght@400`,
  ).join('&');
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
