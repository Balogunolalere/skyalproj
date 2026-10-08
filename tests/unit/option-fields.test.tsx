import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OptionFieldsBlock } from '@/components/skyal/OptionFieldsBlock'
import type { OptionField } from '@/lib/order'
import catalogServices from './fixtures/skyal-services.json'

/**
 * optionFields → form inputs mapping: every field type must render the right
 * input (dropdown → select of choices, text → input, textarea → textarea,
 * number → number honoring min/max), and legacy `options` must keep the
 * single dropdown. Rendered server-side so no DOM is needed.
 */

const noop = () => {};

function render(fields: OptionField[], values: Record<string, string> = {}) {
  return renderToStaticMarkup(
    <OptionFieldsBlock
      service={{ optionFields: fields }}
      values={values}
      onChange={noop}
      variant=""
      onVariantChange={noop}
    />,
  );
}

describe('OptionFieldsBlock — structured optionFields', () => {
  const fields: OptionField[] = [
    { key: 'colour', label: 'Colour', type: 'dropdown', choices: ['Gold', 'Silver'], required: true },
    { key: 'message', label: 'Topper message', type: 'text', maxLength: 120, required: true },
    { key: 'age', label: 'Age', type: 'number', min: 1, max: 100 },
    { key: 'details', label: 'Details', type: 'textarea' },
  ];

  test('dropdown renders a <select> with the field choices', () => {
    const html = render(fields);
    expect(html).toContain('<select');
    expect(html).toContain('id="option-colour"');
    expect(html).toContain('<option value="Gold">Gold</option>');
    expect(html).toContain('<option value="Silver">Silver</option>');
  });

  test('text renders an input with maxLength honored', () => {
    const html = render(fields);
    expect(html).toContain('id="option-message"');
    expect(html).toContain('type="text"');
    expect(html).toContain('maxLength="120"');
  });

  test('textarea renders a <textarea>', () => {
    const html = render(fields);
    expect(html).toContain('<textarea');
    expect(html).toContain('id="option-details"');
  });

  test('number renders a number input honoring min/max', () => {
    const html = render(fields);
    expect(html).toContain('id="option-age"');
    expect(html).toContain('type="number"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="100"');
  });

  test('renders the current values', () => {
    const html = render(fields, { colour: 'Gold', age: '30' });
    expect(html).toContain('<option value="Gold" selected="">Gold</option>');
    expect(html).toContain('value="30"');
  });
});

describe('OptionFieldsBlock — legacy flat options', () => {
  test('renders the single legacy dropdown when optionFields is absent', () => {
    const html = renderToStaticMarkup(
      <OptionFieldsBlock
        service={{ options: ['Option A', 'Option B'] }}
        values={{}}
        onChange={noop}
        variant=""
        onVariantChange={noop}
      />,
    );
    expect(html).toContain('aria-label="Variant"');
    expect(html).toContain('<option value="Option A">Option A</option>');
    expect(html).toContain('<option value="Option B">Option B</option>');
    // No structured inputs when only legacy options exist.
    expect(html).not.toContain('id="option-');
  });

  test('renders nothing when the service has no options at all', () => {
    const html = renderToStaticMarkup(
      <OptionFieldsBlock
        service={{ options: [], optionFields: null }}
        values={{}}
        onChange={noop}
        variant=""
        onVariantChange={noop}
      />,
    );
    expect(html).toBe('');
  });
});

describe('OptionFieldsBlock — image choice grid', () => {
  const imageField: OptionField = {
    key: 'colour',
    label: 'Colour',
    type: 'dropdown',
    required: true,
    choices: [{ value: 'Gold', image: 'https://x/g.png' }, 'Silver'],
  };

  test('renders two radio choices with a thumbnail on the image choice', () => {
    const html = render([imageField], { colour: 'Gold' });
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('data-choice-value="Gold"');
    expect(html).toContain('src="https://x/g.png"');
    expect(html).toContain('>Gold<');
    expect(html).toContain('>Silver<');
    // Thumbnails can't render in a native select — switch to the grid.
    expect(html).not.toContain('<select');
  });

  test('string-only choices keep the native select (no grid)', () => {
    const html = render([
      { key: 'colour', label: 'Colour', type: 'dropdown', choices: ['Gold', 'Silver'] },
    ]);
    expect(html).toContain('<select');
    expect(html).not.toContain('role="radiogroup"');
  });
});

describe('OptionFieldsBlock — Acrylic Cake Topper (Skyal) from the catalog fixture', () => {
  test('renders Colour dropdown + Topper message text + Age number', () => {
    const topper = catalogServices.find((s) => s.type === 'skyal_topper_acrylic');
    expect(topper).toBeDefined();

    const html = renderToStaticMarkup(
      <OptionFieldsBlock
        service={topper as never}
        values={{ colour: 'Gold', message: 'Happy Birthday', age: '30' }}
        onChange={noop}
        variant=""
        onVariantChange={noop}
      />,
    );

    // Manual acceptance: Colour dropdown + Message text + Age number.
    expect(html).toContain('id="option-colour"');
    expect(html).toContain('<select');
    expect(html).toContain('<option value="Gold" selected="">Gold</option>');
    expect(html).toContain('<option value="Silver">Silver</option>');
    expect(html).toContain('id="option-message"');
    expect(html).toContain('type="text"');
    expect(html).toContain('id="option-age"');
    expect(html).toContain('type="number"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="100"');
  });
});

/**
 * A DERIVED field — "the height the designer needs".
 *
 * The owner's arithmetic: "my layer is 1.5, and I have 3 layers, so 1.5 × 3 —
 * this is the height they are working with". The customer never types it, so the
 * block must SHOW it and must NOT render an input for it.
 */
describe('OptionFieldsBlock — a calculated field', () => {
  const FIELDS: OptionField[] = [
    { key: 'Layers', label: 'Layers', type: 'number', min: 1, max: 8, required: true },
    { key: 'Layer_Inches', label: 'Thickness', type: 'number', min: 1, max: 4, required: true, decimals: true },
    { key: 'Height_Inches', label: 'Total height (in)', type: 'number', compute: { multiply: ['Layers', 'Layer_Inches'] } },
  ];
  const render = (values: Record<string, string>) =>
    renderToStaticMarkup(
      <OptionFieldsBlock
        service={{ optionFields: FIELDS } as never}
        values={values}
        onChange={() => {}}
        variant=""
        onVariantChange={() => {}}
      />,
    );

  test('shows the calculated value once both inputs are known', () => {
    const html = render({ Layers: '3', Layer_Inches: '1.5' });
    expect(html).toContain('data-testid="computed-Height_Inches"');
    expect(html).toContain('4.5');           // the owner's own example
    expect(html).toContain('calculated');
  });

  test('renders NO input for it — the customer cannot type into it', () => {
    const html = render({ Layers: '3', Layer_Inches: '1.5' });
    expect(html).not.toContain('id="option-Height_Inches"');
  });

  test('shows a placeholder, not a wrong number, before both inputs are filled', () => {
    for (const values of [{}, { Layers: '3' }, { Layer_Inches: '2' }] as Record<string, string>[]) {
      const html = render(values);
      expect(html).toContain('data-testid="computed-Height_Inches"');
      expect(html).toContain('Fill in the fields above');
      expect(html).not.toContain('4.5');
    }
  });

  test('recomputes as the customer changes an input', () => {
    expect(render({ Layers: '2', Layer_Inches: '2' })).toContain('4');
    expect(render({ Layers: '3', Layer_Inches: '3' })).toContain('9');
  });

  test('does not mark it required, however the admin set it', () => {
    const html = renderToStaticMarkup(
      <OptionFieldsBlock
        service={{ optionFields: [{ ...FIELDS[2], required: true }] } as never}
        values={{ Layers: '2', Layer_Inches: '2' }}
        onChange={() => {}}
        variant=""
        onVariantChange={() => {}}
      />,
    );
    expect(html).toContain('calculated');
    expect(html).not.toContain('*');
  });

  test('carries decimals so 1.5in is accepted', () => {
    const html = render({});
    expect(html).toMatch(/id="option-Layer_Inches"[^>]*step="0\.01"/);
    // the whole-number field stays on whole numbers
    expect(html).toMatch(/id="option-Layers"[^>]*step="1"/);
  });
});
