/**
 * `validateOptionValues` is a client-side copy of the backend's option contract
 * (`validateOptionSelection`). These cases mirror the backend's own rules so the
 * divergence fails here rather than in front of a customer as
 * "400 INVALID_ORDER_INPUT" after they pressed the order button.
 *
 * The distinction that matters: `missingRequiredOptionFields` answers only "is
 * it filled in", so a number of 9999 where max is 100, or a 400-character note
 * where the limit is 300, used to travel all the way to the server.
 */
import { describe, it, expect } from 'vitest';
import {
  summarizeOptionErrors,
  validateOptionValues,
  type OptionField,
} from '@/lib/order';

const dropdown = (over: Partial<OptionField> = {}): OptionField => ({
  key: 'colour',
  label: 'Colour',
  type: 'dropdown',
  choices: ['Gold', 'Silver'],
  ...over,
});

const number = (over: Partial<OptionField> = {}): OptionField => ({
  key: 'width',
  label: 'Width',
  type: 'number',
  ...over,
});

const text = (over: Partial<OptionField> = {}): OptionField => ({
  key: 'message',
  label: 'Topper message',
  type: 'text',
  ...over,
});

describe('validateOptionValues — empty and required', () => {
  it('passes when there are no fields at all', () => {
    expect(validateOptionValues(null, {}).valid).toBe(true);
    expect(validateOptionValues(undefined, {})).toEqual({ valid: true, errors: {} });
    expect(validateOptionValues([], {}).valid).toBe(true);
  });

  it('reports a required field that was never filled in', () => {
    const r = validateOptionValues([dropdown({ required: true })], {});
    expect(r.valid).toBe(false);
    expect(r.errors.colour).toBe('Colour is required');
  });

  it('treats whitespace-only as empty', () => {
    const r = validateOptionValues([text({ required: true })], { message: '   ' });
    expect(r.valid).toBe(false);
    expect(r.errors.message).toBe('Topper message is required');
  });

  it('does not complain about an empty OPTIONAL field', () => {
    expect(validateOptionValues([text({ maxLength: 10 })], { message: '' }).valid).toBe(true);
    expect(validateOptionValues([number({ min: 5 })], { width: '' }).valid).toBe(true);
  });
});

describe('validateOptionValues — dropdown choices', () => {
  it('accepts a listed choice', () => {
    expect(validateOptionValues([dropdown({ required: true })], { colour: 'Gold' }).valid).toBe(true);
  });

  it('accepts a choice given as { value, image }', () => {
    const field = dropdown({ choices: [{ value: 'Gold', image: 'https://x/g.png' }] });
    expect(validateOptionValues([field], { colour: 'Gold' }).valid).toBe(true);
  });

  it('rejects a value that is not in the list (a choice the admin has since removed)', () => {
    const r = validateOptionValues([dropdown()], { colour: 'Chartreuse' });
    expect(r.valid).toBe(false);
    expect(r.errors.colour).toBe('Colour must be one of the listed options');
  });

  it('rejects ANY value when the dropdown lists no choices', () => {
    // The backend resolves the value through `choices?.find(...)`, so an
    // unconfigured dropdown can never accept one — verified against
    // src/lib/service-options.ts in the admin repo.
    expect(validateOptionValues([dropdown({ choices: [] })], { colour: 'anything' }).valid).toBe(false);
    expect(validateOptionValues([dropdown({ choices: undefined })], { colour: 'anything' }).valid).toBe(false);
  });

  it('tolerates surrounding whitespace in a choice', () => {
    expect(validateOptionValues([dropdown()], { colour: '  Gold  ' }).valid).toBe(true);
  });
});

describe('validateOptionValues — numbers', () => {
  it('rejects something that is not a number', () => {
    const r = validateOptionValues([number()], { width: 'ten' });
    expect(r.valid).toBe(false);
    expect(r.errors.width).toBe('Width must be a whole number');
  });

  it('rejects a decimal — the backend requires Number.isInteger', () => {
    expect(validateOptionValues([number()], { width: '2.5' }).errors.width).toBe('Width must be a whole number');
    expect(validateOptionValues([number()], { width: '3' }).valid).toBe(true);
    expect(validateOptionValues([number()], { width: '3.0' }).valid).toBe(true);
    expect(validateOptionValues([number()], { width: '-4' }).valid).toBe(true);
  });

  it('rejects a value below min and above max, and accepts the bounds themselves', () => {
    const field = number({ min: 10, max: 100 });
    expect(validateOptionValues([field], { width: '9' }).errors.width).toBe('Width must be at least 10');
    expect(validateOptionValues([field], { width: '101' }).errors.width).toBe('Width must be at most 100');
    expect(validateOptionValues([field], { width: '10' }).valid).toBe(true);
    expect(validateOptionValues([field], { width: '100' }).valid).toBe(true);
  });

  it('applies min alone and max alone', () => {
    expect(validateOptionValues([number({ min: 5 })], { width: '4' }).valid).toBe(false);
    expect(validateOptionValues([number({ min: 5 })], { width: '500000' }).valid).toBe(true);
    expect(validateOptionValues([number({ max: 5 })], { width: '6' }).valid).toBe(false);
    expect(validateOptionValues([number({ max: 5 })], { width: '-99' }).valid).toBe(true);
  });

  it('accepts a negative whole number when nothing forbids it', () => {
    expect(validateOptionValues([number()], { width: '-3' }).valid).toBe(true);
  });

  it('does not apply min/max to a number the customer left empty and optional', () => {
    expect(validateOptionValues([number({ min: 10, max: 20 })], { width: '' }).valid).toBe(true);
  });
});

describe('validateOptionValues — text length', () => {
  it('rejects text over maxLength, accepts it exactly at the limit', () => {
    const field = text({ maxLength: 5 });
    expect(validateOptionValues([field], { message: '123456' }).errors.message).toBe(
      'Topper message must be at most 5 characters',
    );
    expect(validateOptionValues([field], { message: '12345' }).valid).toBe(true);
  });

  it('measures the TRIMMED length, like the backend', () => {
    const field = text({ maxLength: 5 });
    expect(validateOptionValues([field], { message: '  abcde  ' }).valid).toBe(true);
  });

  it('applies maxLength to a textarea too', () => {
    const r = validateOptionValues([{ key: 'n', label: 'Notes', type: 'textarea', maxLength: 3 }], {
      n: 'abcd',
    });
    expect(r.valid).toBe(false);
  });

  it('does not apply maxLength to a number field', () => {
    // "12345" is 5 characters but a number field is bounded by min/max, not length.
    expect(validateOptionValues([number({ min: 0, max: 999999 })], { width: '12345' }).valid).toBe(true);
  });
});

describe('validateOptionValues — several fields at once', () => {
  it('reports every problem, not just the first', () => {
    const r = validateOptionValues(
      [dropdown({ required: true }), number({ key: 'width', label: 'Width', min: 10 }), text({ required: true })],
      { width: '3' },
    );
    expect(r.valid).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['colour', 'message', 'width']);
    expect(r.errors.width).toBe('Width must be at least 10');
  });

  it('reports a required-empty field instead of a second problem on the same field', () => {
    // A required dropdown that is empty is "required", never "x is required AND must be a number".
    const r = validateOptionValues([number({ required: true })], {});
    expect(Object.values(r.errors)).toEqual(['Width is required']);
  });

  it('ignores values for keys that are not fields', () => {
    expect(validateOptionValues([dropdown()], { colour: 'Gold', stale: 'whatever' }).valid).toBe(true);
  });
});

describe('summarizeOptionErrors', () => {
  it('returns null when there is nothing wrong', () => {
    expect(summarizeOptionErrors({})).toBeNull();
    expect(summarizeOptionErrors({ a: '' })).toBeNull();
  });

  it('returns the single message verbatim', () => {
    expect(summarizeOptionErrors({ colour: 'Colour is required' })).toBe('Colour is required');
  });

  it('joins two messages and counts the rest instead of listing them all', () => {
    expect(summarizeOptionErrors({ a: 'A is required', b: 'B is required' })).toBe('A is required; B is required');
    expect(summarizeOptionErrors({ a: 'A is required', b: 'B is required', c: 'C must be a number' })).toBe(
      'A is required; B is required; +1 more',
    );
  });
});
