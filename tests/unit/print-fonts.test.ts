/**
 * The customer-facing half of the font feature.
 *
 * The list is a MIRROR of the admin backend's `src/lib/print-fonts.ts` (and of
 * paberin's copy) — the backend validates against its own list, so the names here
 * have to match it exactly or a customer picks a font that fails validation.
 *
 * The preview stacks are the other half of the promise: the real face first, a
 * free near-equivalent after it, so the preview is exact once the real files land
 * in `public/fonts/` and still shows script-vs-slab before that.
 */
import { describe, it, expect } from 'vitest';
import {
  PRINT_FONTS,
  PREVIEW_SAMPLE,
  fontStack,
  previewStylesheetHref,
  previewTextFor,
} from '@/lib/print-fonts';
import { validateOptionValues, type OptionField } from '@/lib/order';

/** The names the backend accepts — pinned identically in its own test. */
const BACKEND_NAMES = [
  'Samantha Upright PRO W05',
  'Style Script',
  'Lavanderia Sturdy',
  'Athena of the Ocean',
  'Amarillo',
  'Sunshine',
  'White Dream',
  'Gabriola',
  'Clarendon',
  'Baby Valentina',
];

describe('the mirrored font list', () => {
  it('is exactly the ten names the backend validates against', () => {
    expect(PRINT_FONTS.map((f) => f.name)).toEqual(BACKEND_NAMES);
  });

  it('leads each stack with the real family and falls back after it', () => {
    for (const font of PRINT_FONTS) {
      const [first, ...rest] = font.styles.split(',').map((s) => s.trim());
      expect(first.replace(/['"]/g, '')).toBe(font.name);
      expect(rest.length).toBeGreaterThan(0);
    }
  });

  it('gives every font a file to drop into public/fonts/', () => {
    for (const font of PRINT_FONTS) expect(font.file).toMatch(/\.woff2$/);
  });
});

describe('fontStack', () => {
  it('resolves a known name to its stack', () => {
    expect(fontStack('Clarendon')).toContain('Clarendon');
    expect(fontStack('Style Script')).toBe("'Style Script', cursive");
  });

  it('inherits the site font for an unknown or empty name, rather than guessing', () => {
    expect(fontStack('Comic Sans')).toBe('inherit');
    expect(fontStack('')).toBe('inherit');
    expect(fontStack(undefined)).toBe('inherit');
    expect(fontStack(null)).toBe('inherit');
  });
});

describe('previewStylesheetHref', () => {
  it('asks for every fallback family in one request', () => {
    const href = previewStylesheetHref();
    expect(href.startsWith('https://fonts.googleapis.com/css2?')).toBe(true);
    expect(href).toContain('family=Great+Vibes');
    expect(href).toContain('family=Zilla+Slab');
    expect(href).toContain('display=swap');
    // One request, not one per font.
    expect(href.match(/family=/g)?.length).toBeGreaterThan(5);
  });

  it('never asks for the commercial faces themselves', () => {
    const href = previewStylesheetHref();
    for (const name of ['Samantha', 'Lavanderia', 'Athena', 'Amarillo', 'Baby']) {
      expect(href).not.toContain(name);
    }
  });
});

describe('previewTextFor', () => {
  const fields = [
    { key: 'fonts', type: 'font' },
    { key: 'message', type: 'text' },
    { key: 'notes', type: 'textarea' },
  ];

  it("previews the customer's own text", () => {
    expect(previewTextFor(fields, { message: 'Ada & Tunde' })).toBe('Ada & Tunde');
  });

  it('falls back to a sample while that field is empty', () => {
    expect(previewTextFor(fields, {})).toBe(PREVIEW_SAMPLE);
    expect(previewTextFor(fields, { message: '   ' })).toBe(PREVIEW_SAMPLE);
  });

  it('prefers the first text field over a later textarea', () => {
    expect(previewTextFor(fields, { notes: 'from notes' })).toBe('from notes');
    expect(previewTextFor(fields, { message: 'message wins', notes: 'notes' })).toBe('message wins');
  });

  it('handles a service with no text field at all', () => {
    expect(previewTextFor([{ key: 'fonts', type: 'font' }], {})).toBe(PREVIEW_SAMPLE);
    expect(previewTextFor(null, {})).toBe(PREVIEW_SAMPLE);
  });

  it('trims what it shows', () => {
    expect(previewTextFor(fields, { message: '  Bola  ' })).toBe('Bola');
  });
});

describe('a font field validates like a choice list', () => {
  const fontField = (over: Partial<OptionField> = {}): OptionField => ({
    key: 'fonts',
    label: 'Font',
    type: 'font',
    choices: BACKEND_NAMES,
    ...over,
  });

  it('accepts a listed font', () => {
    expect(validateOptionValues([fontField()], { fonts: 'Clarendon' }).valid).toBe(true);
  });

  it('rejects a font that is not on the list, with wording about fonts', () => {
    const r = validateOptionValues([fontField()], { fonts: 'Helvetica' });
    expect(r.valid).toBe(false);
    expect(r.errors.fonts).toBe('Font must be one of the listed fonts');
  });

  it('rejects any value when the field arrived with no choices', () => {
    // Should not happen (the backend attaches the house list), but the rule must
    // match the backend's: an empty list accepts nothing.
    expect(validateOptionValues([fontField({ choices: [] })], { fonts: 'Clarendon' }).valid).toBe(false);
  });

  it('requires a font when the field is required', () => {
    const r = validateOptionValues([fontField({ required: true })], {});
    expect(r.errors.fonts).toBe('Font is required');
  });

  it('honours a narrowed list', () => {
    const narrowed = fontField({ choices: ['Amarillo'] });
    expect(validateOptionValues([narrowed], { fonts: 'Amarillo' }).valid).toBe(true);
    expect(validateOptionValues([narrowed], { fonts: 'Clarendon' }).valid).toBe(false);
  });

  it('leaves a dropdown talking about options, not fonts', () => {
    const dd: OptionField = { key: 'colour', label: 'Colour', type: 'dropdown', choices: ['Gold'] };
    expect(validateOptionValues([dd], { colour: 'Blue' }).errors.colour).toBe(
      'Colour must be one of the listed options',
    );
  });
});
