import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OptionFieldsBlock } from '@/components/skyal/OptionFieldsBlock'
import type { OptionField } from '@/lib/order'

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

describe('OptionFieldsBlock — Acrylic Cake Topper (Skyal) from the catalog fixture', () => {
  test('renders Colour dropdown + Topper message text + Age number', () => {
    const services = require('./fixtures/skyal-services.json') as Array<Record<string, unknown>>;
    const topper = services.find((s) => s.type === 'skyal_topper_acrylic');
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
